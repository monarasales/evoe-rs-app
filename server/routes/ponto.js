// Ponto — lado do COLABORADOR (bater ponto e "Meu Ponto").
// Regra de segurança: o colaborador é identificado SEMPRE pela sessão (login),
// nunca por parâmetro vindo da tela — assim ninguém lê o ponto de um colega.
// As telas do Gestor ficam em routes/pontoGestao.js.

const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { dataLocal, horaMinLocal, timestampLocal, diaSemana, minParaHhmm } = require("../utils/ponto/tempo");
const { normalizarEscala } = require("../utils/ponto/motor");
const { jornadaDo, mapaFeriados } = require("../utils/ponto/jornada");
const { COL_MARCACOES, apurarColaborador, apurarMes } = require("../utils/ponto/apuracao");

const router = express.Router();
router.use(requireAuth);

const INTERVALO_MINIMO_SEG = 60; // evita batida dupla por toque repetido

function calcularDistancia(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1000;
}

/** Cadastro de colaborador vinculado ao login da sessão. */
function colaboradorDaSessao(req) {
  const colaboradores = db.readCollection("colaboradores");
  const consultorId = req.user.consultorId;
  return (
    colaboradores.find((c) => c.consultorId && c.consultorId === consultorId) ||
    colaboradores.find((c) => c.id === consultorId) ||
    null
  );
}

function configEmpresa() {
  const empresa = db.readCollection("configuracao").find((c) => c.tipo === "empresa");
  return empresa || { localizacaoEmpresa: null, raioTolerancia: 500 };
}

const MSG_SEM_VINCULO =
  'Seu login ainda não está vinculado a um cadastro de colaborador. Peça ao Gestor para vincular em Colaboradores > Cadastro de Colaboradores (campo "Login no sistema").';

function exigirColaborador(req, res, next) {
  const colaborador = colaboradorDaSessao(req);
  if (!colaborador) return res.status(404).json({ erro: MSG_SEM_VINCULO });
  req.colaborador = colaborador;
  next();
}

/** Rótulo do próximo registro, pela quantidade de marcações já feitas hoje. */
function proximaAcao(qtd, temAlmoco) {
  if (qtd === 0) return "Registrar ENTRADA";
  if (temAlmoco && qtd === 1) return "Saída para ALMOÇO";
  if (temAlmoco && qtd === 2) return "VOLTA do almoço";
  if (temAlmoco && qtd === 3) return "Registrar SAÍDA";
  return qtd % 2 === 1 ? "Registrar SAÍDA / pausa" : "Registrar VOLTA";
}

/** Onde a pessoa deveria estar hoje (casa em dia de home office, senão escritório). */
function localEsperado(colaborador, dia) {
  const ehHomeOffice = (colaborador.diasHomeOffice || []).includes(dia);
  const casa = colaborador.localizacaoResidencial;
  if (ehHomeOffice && casa && casa.lat != null) {
    return {
      nome: "casa",
      endereco: [colaborador.enderecoResidencial, colaborador.numeroResidencial].filter(Boolean).join(", "),
      loc: casa,
      raio: colaborador.raioTolerancia || 500,
    };
  }
  const empresa = configEmpresa();
  if (empresa.localizacaoEmpresa && empresa.localizacaoEmpresa.lat != null) {
    return { nome: "empresa", endereco: empresa.enderecoEmpresa || "", loc: empresa.localizacaoEmpresa, raio: empresa.raioTolerancia || 500 };
  }
  return null;
}

// Nomes dos dias no formato usado em colaborador.diasHomeOffice.
const DIA_EXTENSO = { dom: "domingo", seg: "segunda", ter: "terça", qua: "quarta", qui: "quinta", sex: "sexta", sab: "sábado" };

// ---------- Situação de hoje (tela Meu Ponto) ----------
router.get("/meu/hoje", exigirColaborador, (req, res) => {
  const c = req.colaborador;
  const hoje = dataLocal();
  const jornada = jornadaDo(c.id);
  const escalaDia = jornada.dias[diaSemana(hoje)];
  const escala = normalizarEscala(escalaDia);
  const [diaHoje] = apurarColaborador(c, hoje, hoje, { hoje });
  const feriado = mapaFeriados().get(hoje) || null;
  const local = localEsperado(c, DIA_EXTENSO[diaSemana(hoje)]);

  res.json({
    nome: c.nome,
    ativo: c.ativo !== false,
    hoje,
    diaSemana: diaSemana(hoje),
    feriado: feriado ? feriado.nome : null,
    escalaHoje: escalaDia || null,
    cargaEsperadaHoje: escala ? escala.cargaEsperada : 0,
    marcacoes: diaHoje.marcacoesDetalhe.map((mk) => ({ ...mk, hora: minParaHhmm(mk.horaMin) })),
    cargaCumpridaAteAgora: diaHoje.cargaCumprida,
    atrasoMin: diaHoje.atrasoMin,
    proximaAcao: proximaAcao(diaHoje.horarios.length, !!(escala && escala.temAlmoco)),
    localEsperado: local ? { nome: local.nome, endereco: local.endereco, loc: local.loc, raio: local.raio } : null,
  });
});

// ---------- Bater ponto ----------
router.post("/bater", exigirColaborador, (req, res) => {
  const c = req.colaborador;
  if (c.ativo === false) {
    return res.status(403).json({ erro: "Seu cadastro de colaborador está inativo. Fale com o Gestor." });
  }
  const lat = Number((req.body || {}).lat);
  const long = Number((req.body || {}).long);
  if (!Number.isFinite(lat) || !Number.isFinite(long)) {
    return res.status(400).json({ erro: "Localização obrigatória. Permita o acesso à localização no navegador." });
  }

  const agora = new Date();
  const hoje = dataLocal(agora);
  const marcacoes = db.readCollection(COL_MARCACOES);
  const ultimaHoje = marcacoes
    .filter((mk) => mk.colaboradorId === c.id && mk.data === hoje)
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))[0];
  if (ultimaHoje && agora - new Date(ultimaHoje.criadoEm) < INTERVALO_MINIMO_SEG * 1000) {
    return res.status(409).json({ erro: "Você acabou de registrar um ponto. Aguarde 1 minuto para registrar o próximo." });
  }

  let dentroZona = null;
  let distanciaMetros = null;
  let aviso = "";
  const local = localEsperado(c, DIA_EXTENSO[diaSemana(hoje)]);
  if (local) {
    distanciaMetros = Math.round(calcularDistancia(lat, long, local.loc.lat, local.loc.long));
    dentroZona = distanciaMetros <= local.raio;
    const onde = local.nome === "casa" ? "de casa" : "da empresa";
    aviso = dentroZona
      ? `✅ Você está ${local.nome === "casa" ? "em casa" : "na empresa"} (${distanciaMetros}m)`
      : `⚠️ Você está a ${distanciaMetros}m ${onde}. Limite: ${local.raio}m — ponto registrado com aviso.`;
  }

  const marcacao = db.insert(COL_MARCACOES, {
    colaboradorId: c.id,
    consultorId: c.consultorId || null,
    data: hoje,
    horaMin: horaMinLocal(agora),
    timestamp: timestampLocal(agora),
    origem: "web",
    ajuste: false,
    motivoAjuste: "",
    registradoPor: req.user.consultorId,
    localizacao: { lat, long },
    localEsperado: local ? local.nome : null,
    distanciaMetros,
    dentroZona,
    criadoEm: agora.toISOString(),
  });

  res.status(201).json({ ...marcacao, hora: minParaHhmm(marcacao.horaMin), aviso });
});

// ---------- Meu mês (só os próprios dados) ----------
router.get("/meu/periodo", exigirColaborador, (req, res) => {
  const hoje = dataLocal();
  const ano = Number(req.query.ano) || Number(hoje.slice(0, 4));
  const mes = Number(req.query.mes) || Number(hoje.slice(5, 7));
  if (mes < 1 || mes > 12) return res.status(400).json({ erro: "Mês inválido." });
  const { periodo, dias, resumo } = apurarMes(req.colaborador, ano, mes, { hoje });
  res.json({ periodo, resumo, dias: dias.slice().reverse() });
});

module.exports = router;
module.exports.colaboradorDaSessao = colaboradorDaSessao;
