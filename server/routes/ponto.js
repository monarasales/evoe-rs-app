const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

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
  return diasSemana[new Date(data).getDay()];
}

// ============= BATER PONTO COM VALIDAÇÃO DE LOCALIZAÇÃO =============

// Bater ponto (criar registro com GPS)
router.post("/bater", requireAuth, (req, res) => {
  const usuario = req.user;
  const { lat, long } = req.body || {};
  const hoje = new Date().toISOString().split("T")[0];
  const diaSemana = obterDiaSemana(hoje);

  // Validações básicas
  if (!lat || !long) {
    return res.status(400).json({ erro: "Latitude e longitude são obrigatórias." });
  }

  // Buscar colaborador para validar localização
  const colaboradores = db.readCollection("colaboradores") || [];
  const colaborador = colaboradores.find((c) => c.id === usuario.id || c.id === usuario.consultorId);

  if (!colaborador) {
    return res
      .status(404)
      .json({ erro: "Colaborador não encontrado. Cadastre-se primeiro." });
  }

  // Buscar configuração da empresa
  let configuracao = db.readCollection("configuracao") || [];
  let empresa = configuracao.find((c) => c.tipo === "empresa");
  if (!empresa) {
    empresa = {
      localizacaoEmpresa: null,
      raioTolerancia: 500,
    };
  }

  // Validar localização
  let validacaoLocalizacao = {
    dentroZona: false,
    distanciaMetros: 0,
    avisoLocalizacao: "",
  };

  const ehHomeOffice = colaborador.diasHomeOffice && colaborador.diasHomeOffice.includes(diaSemana);

  if (ehHomeOffice && colaborador.localizacaoResidencial) {
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
  } else if (empresa.localizacaoEmpresa) {
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
  let pontoDia = pontos.find((p) => {
    const dataPonto = new Date(p.criadoEm).toISOString().split("T")[0];
    return dataPonto === hoje && p.usuarioId === usuario.id;
  });

  if (!pontoDia) {
    // Criar novo registro de ponto (entrada)
    pontoDia = db.insert("ponto", {
      usuarioId: usuario.id,
      usuarioNome: usuario.nome,
      colaboradorId: usuario.consultorId || usuario.id,
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
  const pontosDodia = pontos.filter((p) => {
    const dataPonto = new Date(p.criadoEm).toISOString().split("T")[0];
    return dataPonto === data && p.usuarioId === usuario.id;
  });

  res.json(pontosDodia);
});

// Obter últimos 7 dias (usuário logado)
router.get("/semana", requireAuth, (req, res) => {
  const usuario = req.user;
  const hoje = new Date();
  const seratras7Dias = new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000);

  const pontos = db.readCollection("ponto") || [];
  const pontosSemana = pontos.filter((p) => {
    const dataPonto = new Date(p.criadoEm);
    return dataPonto >= seratras7Dias && p.usuarioId === usuario.id;
  });

  res.json(pontosSemana);
});

// Obter pontos de todos os colaboradores (apenas Gestor)
router.get("/colaboradores", (req, res) => {
  const { requireGestor } = require("../middleware/auth");
  if (req.user && !req.user.perfil || !req.user.perfil.includes("Gestor")) {
    return res.status(403).json({ erro: "Acesso negado." });
  }

  const pontos = db.readCollection("ponto") || [];

  // Agrupar por colaborador e data
  const pontosOrganizados = pontos.map((p) => ({
    ...p,
    colaboradorNome: p.usuarioNome,
  }));

  res.json(pontosOrganizados);
});

module.exports = router;
