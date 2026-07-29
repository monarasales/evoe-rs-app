const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { notifyMudancaVaga } = require("../utils/notify");
const { computeVagaFields, computarReposicaoInfo, hojeStr } = require("../utils/vagaCompute");
const { ETAPAS_VAGA, PRIORIDADES, TIPOS_VAGA } = require("../utils/constants");

const router = express.Router();

function podeEditar(req, vaga) {
  return (
    req.consultor.perfil === "Gestor" ||
    req.consultor.perfil === "Supervisora" ||
    vaga.consultorId === req.consultor.id
  );
}

function comCampos(vaga) {
  const candidatosDaVaga = db.readCollection("candidatos").filter((c) => c.vagaId === vaga.id);
  const vagaOrigem = vaga.tipoVaga === "Reposição" && vaga.vagaOrigemId ? db.findById("vagas", vaga.vagaOrigemId) : null;
  const contratoOrigem = vagaOrigem ? db.readCollection("contratos").find((c) => c.vagaId === vagaOrigem.id) : null;
  return {
    ...computeVagaFields(vaga, candidatosDaVaga),
    reposicaoInfo: computarReposicaoInfo(vaga, vagaOrigem, contratoOrigem),
  };
}

router.get("/", (req, res) => {
  let vagas = db.readCollection("vagas");
  const { consultorId, etapa } = req.query;
  if (consultorId) vagas = vagas.filter((v) => v.consultorId === consultorId);
  if (etapa) vagas = vagas.filter((v) => v.etapaAtual === etapa);
  res.json(vagas.map(comCampos));
});

router.get("/etapas", (req, res) => {
  res.json(ETAPAS_VAGA);
});

router.get("/:id", (req, res) => {
  const vaga = db.findById("vagas", req.params.id);
  if (!vaga) return res.status(404).json({ erro: "Vaga não encontrada." });
  res.json(comCampos(vaga));
});

router.post("/", requireAuth, (req, res) => {
  const { titulo, perfilVaga, empresaId, consultorId, dataAbertura, prazoFechamento, prioridade, observacoes, salario, tipoVaga, motivoReposicao, vagaOrigemId } = req.body || {};

  if (!titulo || !empresaId || !consultorId || !dataAbertura || !prazoFechamento) {
    return res.status(400).json({ erro: "Título, empresa, consultor, data de abertura e prazo de fechamento são obrigatórios." });
  }
  if (!db.findById("empresas", empresaId)) return res.status(400).json({ erro: "Empresa inválida." });
  if (!db.findById("consultores", consultorId)) return res.status(400).json({ erro: "Consultor inválido." });
  if (prioridade && !PRIORIDADES.includes(prioridade)) return res.status(400).json({ erro: "Prioridade inválida." });
  if (tipoVaga && !TIPOS_VAGA.includes(tipoVaga)) return res.status(400).json({ erro: "Tipo de vaga inválido." });
  if (tipoVaga === "Reposição" && vagaOrigemId && !db.findById("vagas", vagaOrigemId)) {
    return res.status(400).json({ erro: "Vaga de origem da reposição inválida." });
  }

  const vaga = db.insert("vagas", {
    titulo,
    perfilVaga: perfilVaga || "",
    empresaId,
    consultorId,
    dataAbertura,
    prazoFechamento,
    prioridade: prioridade || "Média",
    salario: Number(salario) || 0,
    tipoVaga: tipoVaga === "Reposição" ? "Reposição" : "Nova",
    motivoReposicao: tipoVaga === "Reposição" ? (motivoReposicao || "") : "",
    vagaOrigemId: tipoVaga === "Reposição" ? (vagaOrigemId || null) : null,
    etapaAtual: ETAPAS_VAGA[0],
    dataEntradaEtapa: hojeStr(),
    dataFechamento: null,
    observacoes: observacoes || "",
    alertaPrazoEnviado: false,
    alertaAtrasoEnviado: false,
    alertaSlaProximoEnviado: false,
    alertaSlaEstouradoEnviado: false,
    emStandBy: false,
    dataInicioStandBy: null,
    diasStandByAcumulados: 0,
    motivoStandBy: "",
    comissaoPaga: false,
    comissaoPagaEm: null,
    comissaoPagaPorId: null,
  });

  db.insert("historico", {
    vagaId: vaga.id,
    consultorId: vaga.consultorId,
    etapa: vaga.etapaAtual,
    dataEntrada: hojeStr(),
    dataSaida: null,
  });

  notifyMudancaVaga({
    vaga,
    atorId: req.consultor.id,
    tipo: "Nova Vaga Atribuída",
    assunto: `Nova vaga atribuída: ${vaga.titulo}`,
    mensagem: `Uma nova vaga foi colocada no Backlog e atribuída a você: "${vaga.titulo}" (${db.findById("empresas", vaga.empresaId)?.nome || ""}). Prazo combinado: ${vaga.prazoFechamento}.`,
  });

  res.status(201).json(comCampos(vaga));
});

router.patch("/:id", requireAuth, (req, res) => {
  const vaga = db.findById("vagas", req.params.id);
  if (!vaga) return res.status(404).json({ erro: "Vaga não encontrada." });
  if (!podeEditar(req, vaga)) {
    return res.status(403).json({ erro: "Você só pode editar vagas atribuídas a você." });
  }
  const { titulo, perfilVaga, empresaId, consultorId, dataAbertura, prazoFechamento, prioridade, observacoes, salario, tipoVaga, motivoReposicao, vagaOrigemId } = req.body || {};
  if (prioridade && !PRIORIDADES.includes(prioridade)) return res.status(400).json({ erro: "Prioridade inválida." });
  if (tipoVaga && !TIPOS_VAGA.includes(tipoVaga)) return res.status(400).json({ erro: "Tipo de vaga inválido." });
  if (tipoVaga === "Reposição" && vagaOrigemId && !db.findById("vagas", vagaOrigemId)) {
    return res.status(400).json({ erro: "Vaga de origem da reposição inválida." });
  }

  const atualizado = db.update("vagas", vaga.id, {
    titulo,
    perfilVaga,
    empresaId,
    consultorId,
    dataAbertura,
    prazoFechamento,
    prioridade,
    observacoes,
    salario: salario !== undefined ? Number(salario) || 0 : undefined,
    tipoVaga,
    motivoReposicao: tipoVaga === "Nova" ? "" : motivoReposicao,
    vagaOrigemId: tipoVaga === "Nova" ? null : vagaOrigemId,
    // se o prazo mudou, os alertas de prazo/atraso podem disparar de novo
    ...(prazoFechamento && prazoFechamento !== vaga.prazoFechamento
      ? { alertaPrazoEnviado: false, alertaAtrasoEnviado: false }
      : {}),
    // se a data de abertura mudou, os alertas de SLA de fechamento também podem disparar de novo
    ...(dataAbertura && dataAbertura !== vaga.dataAbertura
      ? { alertaSlaProximoEnviado: false, alertaSlaEstouradoEnviado: false }
      : {}),
  });

  notifyMudancaVaga({
    vaga: atualizado,
    atorId: req.consultor.id,
    tipo: "Vaga Atualizada",
    assunto: `Vaga atualizada: ${atualizado.titulo}`,
    mensagem: `${req.consultor.nome} atualizou os dados da vaga "${atualizado.titulo}".`,
  });

  res.json(comCampos(atualizado));
});

// Endpoint dedicado à mudança de etapa (usado pelo drag-and-drop do Kanban):
// fecha o registro de histórico da etapa anterior e abre um novo.
router.patch("/:id/etapa", requireAuth, (req, res) => {
  const vaga = db.findById("vagas", req.params.id);
  if (!vaga) return res.status(404).json({ erro: "Vaga não encontrada." });
  if (!podeEditar(req, vaga)) {
    return res.status(403).json({ erro: "Você só pode mover vagas atribuídas a você." });
  }
  const { etapa } = req.body || {};
  if (!ETAPAS_VAGA.includes(etapa)) return res.status(400).json({ erro: "Etapa inválida." });
  if (etapa === vaga.etapaAtual) return res.json(comCampos(vaga));

  const hoje = hojeStr();

  const historicoAberto = db
    .readCollection("historico")
    .find((h) => h.vagaId === vaga.id && !h.dataSaida);
  if (historicoAberto) {
    db.update("historico", historicoAberto.id, { dataSaida: hoje });
  }
  db.insert("historico", {
    vagaId: vaga.id,
    consultorId: vaga.consultorId,
    etapa,
    dataEntrada: hoje,
    dataSaida: null,
  });

  const patch = { etapaAtual: etapa, dataEntradaEtapa: hoje };
  if (etapa === "11. Aprovado" || etapa === "12. Cancelada/Encerrada") {
    patch.dataFechamento = hoje;
  }
  const atualizado = db.update("vagas", vaga.id, patch);

  const ehAprovacao = etapa === "11. Aprovado";
  notifyMudancaVaga({
    vaga: atualizado,
    atorId: req.consultor.id,
    tipo: ehAprovacao ? "Candidato Aprovado" : "Mudança de Etapa",
    assunto: ehAprovacao ? `Vaga fechada: ${vaga.titulo}` : `Vaga "${vaga.titulo}" avançou para: ${etapa}`,
    mensagem: ehAprovacao
      ? `${req.consultor.nome} marcou a vaga "${vaga.titulo}" como Aprovada. Vaga fechada.`
      : `${req.consultor.nome} moveu a vaga "${vaga.titulo}" para a etapa "${etapa}".`,
  });

  res.json(comCampos(atualizado));
});

// Alterna o Stand By de uma vaga: pausa (ou retoma) a contagem de dias em aberto e o
// relógio do prazo/SLA de fechamento. Ao retomar, os dias parados são somados em
// diasStandByAcumulados (descontados do cálculo em vagaCompute.js) e os alertas de
// prazo/SLA são reabertos, já que a "janela" efetiva de fechamento se estendeu.
router.patch("/:id/standby", requireAuth, (req, res) => {
  const vaga = db.findById("vagas", req.params.id);
  if (!vaga) return res.status(404).json({ erro: "Vaga não encontrada." });
  if (!podeEditar(req, vaga)) {
    return res.status(403).json({ erro: "Você só pode alterar o Stand By de vagas atribuídas a você." });
  }
  if (["11. Aprovado", "12. Cancelada/Encerrada"].includes(vaga.etapaAtual)) {
    return res.status(400).json({ erro: "Não é possível colocar em Stand By uma vaga já encerrada." });
  }

  const { standBy, motivo } = req.body || {};
  const hoje = hojeStr();
  let atualizado;

  if (standBy && !vaga.emStandBy) {
    atualizado = db.update("vagas", vaga.id, {
      emStandBy: true,
      dataInicioStandBy: hoje,
      motivoStandBy: motivo || "",
    });
    notifyMudancaVaga({
      vaga: atualizado,
      atorId: req.consultor.id,
      tipo: "Vaga em Stand By",
      assunto: `Vaga em Stand By: ${atualizado.titulo}`,
      mensagem: `${req.consultor.nome} colocou a vaga "${atualizado.titulo}" em Stand By${motivo ? ` — motivo: ${motivo}` : ""}. A contagem de prazo e SLA fica pausada até a retomada.`,
    });
  } else if (!standBy && vaga.emStandBy) {
    const { diasEntre } = require("../utils/vagaCompute");
    const diasPausados = diasEntre(vaga.dataInicioStandBy, hoje);
    atualizado = db.update("vagas", vaga.id, {
      emStandBy: false,
      dataInicioStandBy: null,
      diasStandByAcumulados: (vaga.diasStandByAcumulados || 0) + Math.max(0, diasPausados),
      motivoStandBy: "",
      // reabre os alertas: a janela efetiva de prazo/SLA "andou" com a pausa
      alertaPrazoEnviado: false,
      alertaAtrasoEnviado: false,
      alertaSlaProximoEnviado: false,
      alertaSlaEstouradoEnviado: false,
    });
    notifyMudancaVaga({
      vaga: atualizado,
      atorId: req.consultor.id,
      tipo: "Vaga Retomada",
      assunto: `Vaga retomada: ${atualizado.titulo}`,
      mensagem: `${req.consultor.nome} retomou a vaga "${atualizado.titulo}" (estava ${diasPausados} dia(s) em Stand By).`,
    });
  } else {
    atualizado = vaga;
  }

  res.json(comCampos(atualizado));
});

router.delete("/:id", requireAuth, (req, res) => {
  const vaga = db.findById("vagas", req.params.id);
  if (!vaga) return res.status(404).json({ erro: "Vaga não encontrada." });
  if (!podeEditar(req, vaga)) {
    return res.status(403).json({ erro: "Você só pode excluir vagas atribuídas a você." });
  }
  db.remove("vagas", req.params.id);
  res.json({ ok: true });
});

module.exports = router;
