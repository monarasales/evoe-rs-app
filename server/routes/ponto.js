// Controle de Ponto (estagiários): entrada batida automaticamente no login (ver
// server/routes/auth.js), saída batida manualmente pelo próprio estagiário, e
// relatório de horas trabalhadas x esperadas para o Gestor/Supervisora.
const express = require("express");
const db = require("../db");
const { requireAuth, requireGestorOuSupervisora } = require("../middleware/auth");
const { hojeStr } = require("../utils/vagaCompute");
const { horasEntre, avaliarLocalizacao } = require("../utils/pontoCompute");

const router = express.Router();

function pontoDeHoje(consultorId) {
  const data = hojeStr();
  return db.readCollection("pontos").find((p) => p.consultorId === consultorId && p.data === data) || null;
}

// Registro de ponto do dia do próprio usuário logado (ou null, se ainda não bateu
// hoje — por exemplo, quem não é estagiário nunca tem um registro criado).
router.get("/hoje", requireAuth, (req, res) => {
  res.json(pontoDeHoje(req.consultor.id));
});

// Chamado logo após o login para anexar a localização capturada pelo navegador à
// entrada já batida automaticamente. Sem localização, o ponto continua valendo —
// só fica sem a checagem de distância.
router.patch("/hoje/entrada-localizacao", requireAuth, (req, res) => {
  const { lat, lng } = req.body || {};
  if (typeof lat !== "number" || typeof lng !== "number") {
    return res.status(400).json({ erro: "Localização inválida." });
  }
  const ponto = pontoDeHoje(req.consultor.id);
  if (!ponto) return res.status(404).json({ erro: "Nenhuma batida de ponto encontrada para hoje." });

  const avaliacao = avaliarLocalizacao(req.consultor, lat, lng);
  const atualizado = db.update("pontos", ponto.id, {
    entradaLat: lat,
    entradaLng: lng,
    entradaDistanciaMetros: avaliacao.distanciaMetros,
    entradaForaDoLocal: avaliacao.foraDoLocal,
    entradaReferencia: avaliacao.referencia,
  });
  res.json(atualizado);
});

// Bater saída — ação manual do estagiário. Calcula horas trabalhadas e o saldo
// (positivo = hora extra, negativo = a descontar) com base no horário esperado
// cadastrado no funcionário.
router.post("/bater-saida", requireAuth, (req, res) => {
  if (req.consultor.tipoVinculo !== "Estágio") {
    return res.status(403).json({ erro: "O Controle de Ponto está disponível apenas para estagiários." });
  }
  const ponto = pontoDeHoje(req.consultor.id);
  if (!ponto) {
    return res.status(400).json({ erro: "Nenhuma entrada registrada hoje. Faça login novamente para bater o ponto." });
  }
  if (ponto.horaSaida) {
    return res.status(400).json({ erro: "A saída de hoje já foi registrada." });
  }

  const { lat, lng } = req.body || {};
  const horaSaida = (() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  })();

  const patch = { horaSaida };
  if (typeof lat === "number" && typeof lng === "number") {
    const avaliacao = avaliarLocalizacao(req.consultor, lat, lng);
    patch.saidaLat = lat;
    patch.saidaLng = lng;
    patch.saidaDistanciaMetros = avaliacao.distanciaMetros;
    patch.saidaForaDoLocal = avaliacao.foraDoLocal;
  }

  const horasTrabalhadas = horasEntre(ponto.horaEntrada, horaSaida);
  patch.horasTrabalhadas = horasTrabalhadas;
  patch.saldoHoras = Math.round((horasTrabalhadas - (ponto.horasEsperadas || 0)) * 100) / 100;

  const atualizado = db.update("pontos", ponto.id, patch);
  res.json(atualizado);
});

// Histórico do próprio estagiário (tela "Meu Ponto").
router.get("/meu", requireAuth, (req, res) => {
  const registros = db
    .readCollection("pontos")
    .filter((p) => p.consultorId === req.consultor.id)
    .sort((a, b) => b.data.localeCompare(a.data));
  res.json(registros);
});

// Listagem completa (Gestor/Supervisora) — opcionalmente filtrada por consultor.
router.get("/", requireGestorOuSupervisora, (req, res) => {
  let registros = db.readCollection("pontos");
  const { consultorId } = req.query;
  if (consultorId) registros = registros.filter((p) => p.consultorId === consultorId);
  registros = registros.sort((a, b) => b.data.localeCompare(a.data));
  res.json(registros);
});

// Resumo por estagiário num período (padrão: mês atual) — horas trabalhadas,
// esperadas e saldo (hora extra ou desconto), além de avisos (fora do local,
// dias sem bater saída).
router.get("/resumo", requireGestorOuSupervisora, (req, res) => {
  const consultores = db.readCollection("consultores").filter((c) => c.tipoVinculo === "Estágio");
  const registros = db.readCollection("pontos");
  const hoje = hojeStr();
  const inicio = req.query.inicio || `${hoje.slice(0, 7)}-01`;
  const fim = req.query.fim || hoje;

  const resumo = consultores.map((c) => {
    const doPeriodo = registros.filter((p) => p.consultorId === c.id && p.data >= inicio && p.data <= fim);
    const horasTrabalhadas = doPeriodo.reduce((acc, p) => acc + (p.horasTrabalhadas || 0), 0);
    const horasEsperadas = doPeriodo.reduce((acc, p) => acc + (p.horasEsperadas || 0), 0);
    return {
      consultor: { id: c.id, nome: c.nome, ativo: c.ativo, modalidadeTrabalho: c.modalidadeTrabalho },
      horasTrabalhadas: Math.round(horasTrabalhadas * 100) / 100,
      horasEsperadas: Math.round(horasEsperadas * 100) / 100,
      saldoHoras: Math.round((horasTrabalhadas - horasEsperadas) * 100) / 100,
      diasComPonto: doPeriodo.length,
      diasForaDoLocal: doPeriodo.filter((p) => p.entradaForaDoLocal || p.saidaForaDoLocal).length,
      diasSemSaida: doPeriodo.filter((p) => !p.horaSaida).length,
    };
  });

  res.json({ inicio, fim, resumo });
});

module.exports = router;
