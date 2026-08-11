// Banco de Horas: fechamento mensal do Controle de Ponto.
//
// O sistema já calcula o saldo de horas (trabalhadas x esperadas) de cada dia
// automaticamente — mas nunca decide sozinho o que fazer com esse saldo (pagar hora
// extra, dar folga, deixar acumular). Fechar um mês aqui só TRAVA os registros de
// ponto daquele mês contra edição (evita corrigir por engano um período que já foi
// conferido) e registra o saldo que passa para o mês seguinte — um valor sempre
// calculado automaticamente, mas que o Gestor pode ajustar na hora de fechar, caso
// já tenha decidido pagar/descontar/dar folga de parte dele.
//
// Os meses precisam ser fechados em ordem (não dá pra fechar Setembro sem ter
// fechado Agosto antes), pra que o saldo acumulado sempre bata. Só o Gestor fecha,
// edita o saldo transportado ou reabre um mês.

const express = require("express");
const db = require("../db");
const { requireAuth, requireGestor, requireGestorOuSupervisora } = require("../middleware/auth");
const { usaControlePonto, hojeStrFuso } = require("../utils/pontoCompute");

const router = express.Router();

function mesSeguinte(anoMes) {
  const [ano, mes] = anoMes.split("-").map(Number);
  const data = new Date(ano, mes, 1); // mes (1-based) já aponta pro mês seguinte em base 0
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
}

function mesAnterior(anoMes) {
  const [ano, mes] = anoMes.split("-").map(Number);
  const data = new Date(ano, mes - 2, 1);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
}

function calcularSaldoDoMes(consultorId, anoMes) {
  const soma = db
    .readCollection("pontos")
    .filter((p) => p.consultorId === consultorId && p.data.slice(0, 7) === anoMes)
    .reduce((acc, p) => acc + (Number(p.saldoHoras) || 0), 0);
  return Math.round(soma * 100) / 100;
}

function ultimoFechamentoAtivo(consultorId) {
  const fechamentos = db
    .readCollection("fechamentosPonto")
    .filter((f) => f.consultorId === consultorId && f.status === "Fechado")
    .sort((a, b) => b.anoMes.localeCompare(a.anoMes));
  return fechamentos[0] || null;
}

function saldoAcumuladoAnteriorPara(consultorId, anoMes) {
  const anterior = db
    .readCollection("fechamentosPonto")
    .find((f) => f.consultorId === consultorId && f.anoMes === mesAnterior(anoMes) && f.status === "Fechado");
  return anterior ? Number(anterior.saldoTransportado) || 0 : 0;
}

// Prévia do fechamento: mostra os números calculados ANTES de confirmar, pra o Gestor
// decidir se ajusta o saldo transportado (ex: já decidiu pagar parte em horas extras).
router.get("/preview", requireAuth, requireGestor, (req, res) => {
  const { consultorId, anoMes } = req.query;
  const consultor = db.findById("consultores", consultorId);
  if (!consultor) return res.status(400).json({ erro: "Funcionário inválido." });
  if (!anoMes || !/^\d{4}-\d{2}$/.test(anoMes)) {
    return res.status(400).json({ erro: "Mês inválido. Use o formato AAAA-MM." });
  }

  const anoMesAtual = hojeStrFuso().slice(0, 7);
  const jaFechado = db
    .readCollection("fechamentosPonto")
    .some((f) => f.consultorId === consultorId && f.anoMes === anoMes && f.status === "Fechado");
  const ultimo = ultimoFechamentoAtivo(consultorId);
  const proximoMesEsperado = ultimo ? mesSeguinte(ultimo.anoMes) : null;

  let podeFechar = true;
  let motivoBloqueio = null;
  if (anoMes >= anoMesAtual) {
    podeFechar = false;
    motivoBloqueio = "Só é possível fechar meses já encerrados (não o mês atual nem meses futuros).";
  } else if (jaFechado) {
    podeFechar = false;
    motivoBloqueio = "Este mês já está fechado.";
  } else if (proximoMesEsperado && anoMes !== proximoMesEsperado) {
    podeFechar = false;
    motivoBloqueio = `Feche os meses em ordem — o próximo mês a fechar é ${proximoMesEsperado}.`;
  }

  const saldoAcumuladoAnterior = saldoAcumuladoAnteriorPara(consultorId, anoMes);
  const saldoDoMes = calcularSaldoDoMes(consultorId, anoMes);
  const saldoFinalCalculado = Math.round((saldoAcumuladoAnterior + saldoDoMes) * 100) / 100;

  res.json({
    consultorId,
    anoMes,
    saldoAcumuladoAnterior,
    saldoDoMes,
    saldoFinalCalculado,
    jaFechado,
    podeFechar,
    motivoBloqueio,
    proximoMesEsperado,
  });
});

// Meus fechamentos (extrato do próprio funcionário — qualquer um que usa Ponto).
router.get("/meus", requireAuth, (req, res) => {
  const fechamentos = db
    .readCollection("fechamentosPonto")
    .filter((f) => f.consultorId === req.consultor.id)
    .sort((a, b) => b.anoMes.localeCompare(a.anoMes));
  res.json(fechamentos);
});

// Fechamentos de um funcionário específico (Gestor/Supervisora).
router.get("/", requireAuth, requireGestorOuSupervisora, (req, res) => {
  const { consultorId } = req.query;
  if (!consultorId) return res.status(400).json({ erro: "Informe o consultorId." });
  const fechamentos = db
    .readCollection("fechamentosPonto")
    .filter((f) => f.consultorId === consultorId)
    .sort((a, b) => b.anoMes.localeCompare(a.anoMes));
  res.json(fechamentos);
});

// Fecha um mês para um funcionário — trava os registros de ponto daquele mês.
router.post("/", requireAuth, requireGestor, (req, res) => {
  const { consultorId, anoMes } = req.body || {};
  const consultor = db.findById("consultores", consultorId);
  if (!consultor) return res.status(400).json({ erro: "Funcionário inválido." });
  if (!usaControlePonto(consultor)) {
    return res.status(400).json({ erro: "Este funcionário não usa Controle de Ponto." });
  }
  if (!anoMes || !/^\d{4}-\d{2}$/.test(anoMes)) {
    return res.status(400).json({ erro: "Mês inválido. Use o formato AAAA-MM." });
  }

  const anoMesAtual = hojeStrFuso().slice(0, 7);
  if (anoMes >= anoMesAtual) {
    return res.status(400).json({ erro: "Só é possível fechar meses já encerrados (não o mês atual nem meses futuros)." });
  }

  const jaFechado = db
    .readCollection("fechamentosPonto")
    .some((f) => f.consultorId === consultorId && f.anoMes === anoMes && f.status === "Fechado");
  if (jaFechado) {
    return res.status(409).json({ erro: `O mês ${anoMes} já está fechado para ${consultor.nome}.` });
  }

  const ultimo = ultimoFechamentoAtivo(consultorId);
  if (ultimo && anoMes !== mesSeguinte(ultimo.anoMes)) {
    return res.status(400).json({ erro: `Feche os meses em ordem — o próximo mês a fechar para ${consultor.nome} é ${mesSeguinte(ultimo.anoMes)}.` });
  }

  const saldoAcumuladoAnterior = saldoAcumuladoAnteriorPara(consultorId, anoMes);
  const saldoDoMes = calcularSaldoDoMes(consultorId, anoMes);
  const saldoFinalCalculado = Math.round((saldoAcumuladoAnterior + saldoDoMes) * 100) / 100;

  const temValorInformado = req.body.saldoTransportado !== undefined && req.body.saldoTransportado !== null && req.body.saldoTransportado !== "";
  const saldoTransportado = temValorInformado ? Number(req.body.saldoTransportado) : saldoFinalCalculado;
  if (!Number.isFinite(saldoTransportado)) {
    return res.status(400).json({ erro: "Saldo transportado inválido." });
  }

  const novo = db.insert("fechamentosPonto", {
    consultorId,
    anoMes,
    saldoAcumuladoAnterior,
    saldoDoMes,
    saldoFinalCalculado,
    saldoTransportado: Math.round(saldoTransportado * 100) / 100,
    observacoes: String(req.body.observacoes || "").trim(),
    status: "Fechado",
    fechadoPorId: req.consultor.id,
    fechadoEm: db.nowIso(),
    reabertoPorId: null,
    reabertoEm: null,
  });
  res.status(201).json(novo);
});

// Ajusta o saldo transportado (ou as observações) de um mês já fechado, sem precisar
// reabri-lo — útil quando a decisão sobre o saldo (pagar/descontar/folga) muda depois.
router.patch("/:id", requireAuth, requireGestor, (req, res) => {
  const fechamento = db.findById("fechamentosPonto", req.params.id);
  if (!fechamento) return res.status(404).json({ erro: "Fechamento não encontrado." });
  if (fechamento.status !== "Fechado") {
    return res.status(400).json({ erro: "Este mês está reaberto. Feche-o novamente para poder editar o saldo transportado." });
  }

  const patch = {};
  if (req.body.saldoTransportado !== undefined) {
    const valor = Number(req.body.saldoTransportado);
    if (!Number.isFinite(valor)) return res.status(400).json({ erro: "Saldo transportado inválido." });
    patch.saldoTransportado = Math.round(valor * 100) / 100;
  }
  if (req.body.observacoes !== undefined) {
    patch.observacoes = String(req.body.observacoes || "").trim();
  }

  const atualizado = db.update("fechamentosPonto", fechamento.id, patch);
  res.json(atualizado);
});

// Reabre um mês fechado — destrava os registros de ponto dele para correção. Não
// apaga o histórico do fechamento anterior (fica registrado quem reabriu e quando).
router.patch("/:id/reabrir", requireAuth, requireGestor, (req, res) => {
  const fechamento = db.findById("fechamentosPonto", req.params.id);
  if (!fechamento) return res.status(404).json({ erro: "Fechamento não encontrado." });
  if (fechamento.status !== "Fechado") {
    return res.status(400).json({ erro: "Este mês já está reaberto." });
  }

  const atualizado = db.update("fechamentosPonto", fechamento.id, {
    status: "Reaberto",
    reabertoPorId: req.consultor.id,
    reabertoEm: db.nowIso(),
  });

  const posteriores = db
    .readCollection("fechamentosPonto")
    .filter((f) => f.consultorId === fechamento.consultorId && f.status === "Fechado" && f.anoMes > fechamento.anoMes)
    .map((f) => f.anoMes)
    .sort();
  const aviso =
    posteriores.length > 0
      ? `Atenção: os meses ${posteriores.join(", ")} já foram fechados usando o saldo transportado deste mês como ponto de partida. Se for corrigir o saldo aqui, considere reabri-los também.`
      : null;

  res.json({ ...atualizado, aviso });
});

module.exports = router;
