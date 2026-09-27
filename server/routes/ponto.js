const express = require("express");
const db = require("../db");
const { requireAuth, requireGestor } = require("../middleware/auth");

const router = express.Router();

// ============= UTILITÁRIOS PARA GEOLOCALIZAÇÃO =============
function calcularDistancia(lat1, lon1, lat2, lon2) {
  const R = 6371; // Raio da Terra em km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 1000; // Retorna em metros
}

function obterDiaSemana(data) {
  const diasSemana = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  return diasSemana[new Date(data + "T12:00:00Z").getUTCDay()];
}

// Datas do ponto sempre no horário do Ceará — o servidor roda em UTC, e sem isso
// um ponto batido depois das 21h cairia no dia seguinte.
const FUSO = "America/Fortaleza";
function dataLocal(date = new Date()) {
  return date.toLocaleDateString("en-CA", { timeZone: FUSO }); // AAAA-MM-DD
}

/** Cadastro de colaborador vinculado ao login (consultor) da pessoa. */
function encontrarColaborador(consultorId) {
  const colaboradores = db.readCollection("colaboradores") || [];
  return (
    colaboradores.find((c) => c.consultorId && c.consultorId === consultorId) ||
    colaboradores.find((c) => c.id === consultorId) ||
    null
  );
}

function configEmpresa() {
  const empresa = (db.readCollection("configuracao") || []).find((c) => c.tipo === "empresa");
  return empresa || { localizacaoEmpresa: null, raioTolerancia: 500 };
}

const MSG_SEM_VINCULO =
  "Seu login ainda não está vinculado a um cadastro de colaborador. Peça ao Gestor para vincular em Colaboradores > Cadastro de Colaboradores (campo \"Login no sistema\").";

// Dados que a tela de Ponto precisa para mostrar onde a pessoa deve estar hoje.
router.get("/meu-cadastro", requireAuth, (req, res) => {
  const colaborador = encontrarColaborador(req.user.consultorId);
  if (!colaborador) return res.status(404).json({ erro: MSG_SEM_VINCULO });
  const hoje = dataLocal();
  const diaSemana = obterDiaSemana(hoje);
  const empresa = configEmpresa();
  res.json({
    nome: colaborador.nome,
    ativo: colaborador.ativo !== false,
    hoje,
    diaSemana,
    ehHomeOffice: (colaborador.diasHomeOffice || []).includes(diaSemana),
    enderecoResidencial: [colaborador.enderecoResidencial, colaborador.numeroResidencial].filter(Boolean).join(", "),
    localizacaoResidencial: colaborador.localizacaoResidencial || null,
    raioTolerancia: colaborador.raioTolerancia || 500,
    enderecoEmpresa: empresa.enderecoEmpresa || "",
    localizacaoEmpresa: empresa.localizacaoEmpresa || null,
    raioEmpresa: empresa.raioTolerancia || 500,
  });
});

// ============= BATER PONTO COM VALIDAÇÃO DE LOCALIZAÇÃO =============

// Bater ponto (criar registro com GPS)
router.post("/bater", requireAuth, (req, res) => {
  const usuario = req.user;
  const { lat, long } = req.body || {};
  const hoje = dataLocal();
  const diaSemana = obterDiaSemana(hoje);

  // Validações básicas
  if (!lat || !long) {
    return res.status(400).json({ erro: "Latitude e longitude são obrigatórias." });
  }

  // Buscar colaborador para validar localização
  const colaborador = encontrarColaborador(usuario.consultorId);
  if (!colaborador) return res.status(404).json({ erro: MSG_SEM_VINCULO });
  if (colaborador.ativo === false) {
    return res.status(403).json({ erro: "Seu cadastro de colaborador está inativo. Fale com o Gestor." });
  }

  const empresa = configEmpresa();

  // Validar localização
  let validacaoLocalizacao = {
    dentroZona: false,
    distanciaMetros: 0,
    avisoLocalizacao: "",
  };

  const ehHomeOffice = colaborador.diasHomeOffice && colaborador.diasHomeOffice.includes(diaSemana);

  if (ehHomeOffice && colaborador.localizacaoResidencial && colaborador.localizacaoResidencial.lat != null) {
    // Validar se está em casa (sexta-feira)
    const distancia = calcularDistancia(
      lat,
      long,
      colaborador.localizacaoResidencial.lat,
      colaborador.localizacaoResidencial.long
    );
    validacaoLocalizacao.distanciaMetros = Math.round(distancia);
    validacaoLocalizacao.dentroZona = distancia <= colaborador.raioTolerancia;
    validacaoLocalizacao.avisoLocalizacao = validacaoLocalizacao.dentroZona
      ? `✅ Você está em casa (${Math.round(distancia)}m)`
      : `⚠️ Você está ${Math.round(distancia)}m de casa. Limite: ${colaborador.raioTolerancia}m`;
  } else if (empresa.localizacaoEmpresa && empresa.localizacaoEmpresa.lat != null) {
    // Validar se está na empresa (seg-qui)
    const distancia = calcularDistancia(
      lat,
      long,
      empresa.localizacaoEmpresa.lat,
      empresa.localizacaoEmpresa.long
    );
    validacaoLocalizacao.distanciaMetros = Math.round(distancia);
    validacaoLocalizacao.dentroZona = distancia <= empresa.raioTolerancia;
    validacaoLocalizacao.avisoLocalizacao = validacaoLocalizacao.dentroZona
      ? `✅ Você está na empresa (${Math.round(distancia)}m)`
      : `⚠️ Você está ${Math.round(distancia)}m da empresa. Limite: ${empresa.raioTolerancia}m`;
  }

  // IMPORTANTE: Permitir bater ponto mesmo fora da zona (registra aviso)
  // Em produção, você pode mudar isso para res.status(400) se quiser bloquear

  // Procurar ponto do usuário de hoje
  const pontos = db.readCollection("ponto") || [];
  let pontoDia = pontos.find((p) => p.data === hoje && p.usuarioId === usuario.id);

  if (pontoDia && pontoDia.saida) {
    return res.status(400).json({ erro: "Sua jornada de hoje já foi encerrada (saída registrada)." });
  }

  if (!pontoDia) {
    // Criar novo registro de ponto (entrada)
    pontoDia = db.insert("ponto", {
      usuarioId: usuario.id,
      usuarioNome: colaborador.nome || (req.consultor && req.consultor.nome) || usuario.username,
      colaboradorId: colaborador.id,
      data: hoje,
      diaSemana,
      entrada: new Date().toISOString(),
      entradaLocalizacao: { lat, long },
      entradaDistancia: validacaoLocalizacao.distanciaMetros,
      entradaDentroZona: validacaoLocalizacao.dentroZona,
      saida: null,
      saidaLocalizacao: null,
      saidaDistancia: 0,
      saidaDentroZona: false,
      pausaEntrada: null,
      pausaEntradaLocalizacao: null,
      pausaEntradaDistancia: 0,
      pausaSaida: null,
      pausaSaidaLocalizacao: null,
      pausaSaidaDistancia: 0,
      criadoEm: new Date().toISOString(),
    });
  } else if (!pontoDia.saida && pontoDia.pausaSaida) {
    // Retornando de pausa - registrar saída
    pontoDia.saida = new Date().toISOString();
    pontoDia.saidaLocalizacao = { lat, long };
    pontoDia.saidaDistancia = validacaoLocalizacao.distanciaMetros;
    pontoDia.saidaDentroZona = validacaoLocalizacao.dentroZona;
    db.update("ponto", pontoDia.id, pontoDia);
  } else if (!pontoDia.pausaEntrada && pontoDia.entrada && !pontoDia.pausaSaida) {
    // Iniciando pausa - registrar entrada de pausa
    pontoDia.pausaEntrada = new Date().toISOString();
    pontoDia.pausaEntradaLocalizacao = { lat, long };
    pontoDia.pausaEntradaDistancia = validacaoLocalizacao.distanciaMetros;
    db.update("ponto", pontoDia.id, pontoDia);
  } else if (pontoDia.pausaEntrada && !pontoDia.pausaSaida) {
    // Finalizando pausa - registrar saída de pausa
    pontoDia.pausaSaida = new Date().toISOString();
    pontoDia.pausaSaidaLocalizacao = { lat, long };
    pontoDia.pausaSaidaDistancia = validacaoLocalizacao.distanciaMetros;
    db.update("ponto", pontoDia.id, pontoDia);
  } else if (!pontoDia.saida) {
    // Registrar saída
    pontoDia.saida = new Date().toISOString();
    pontoDia.saidaLocalizacao = { lat, long };
    pontoDia.saidaDistancia = validacaoLocalizacao.distanciaMetros;
    pontoDia.saidaDentroZona = validacaoLocalizacao.dentroZona;
    db.update("ponto", pontoDia.id, pontoDia);
  }

  res.json({
    ...pontoDia,
    validacaoLocalizacao,
  });
});

// Obter pontos do dia (usuário logado)
router.get("/dia/:data", requireAuth, (req, res) => {
  const usuario = req.user;
  const data = req.params.data;

  const pontos = db.readCollection("ponto") || [];
  const pontosDodia = pontos.filter((p) => p.data === data && p.usuarioId === usuario.id);

  res.json(pontosDodia);
});

// Obter últimos 7 dias (usuário logado)
router.get("/semana", requireAuth, (req, res) => {
  const usuario = req.user;
  const inicio = dataLocal(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));

  const pontos = db.readCollection("ponto") || [];
  const pontosSemana = pontos
    .filter((p) => p.data >= inicio && p.usuarioId === usuario.id)
    .sort((a, b) => b.data.localeCompare(a.data));

  res.json(pontosSemana);
});

// Obter pontos de todos os colaboradores (apenas Gestor)
router.get("/colaboradores", requireAuth, requireGestor, (req, res) => {

  const pontos = db.readCollection("ponto") || [];

  // Agrupar por colaborador e data
  const colaboradores = db.readCollection("colaboradores") || [];
  const pontosOrganizados = pontos
    .map((p) => ({
      ...p,
      colaboradorNome: p.usuarioNome || (colaboradores.find((c) => c.id === p.colaboradorId) || {}).nome || "—",
    }))
    .sort((a, b) => (b.data || "").localeCompare(a.data || ""));

  res.json(pontosOrganizados);
});

module.exports = router;
