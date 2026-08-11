// Ocorrências de Ponto: quando o funcionário não conseguiu bater o ponto no horário
// (esqueceu, problema técnico, imprevisto etc.), registra uma ocorrência explicando o
// motivo em vez de deixar o dia sem nenhum registro. O Gestor recebe notificação,
// decide aceitar ou recusar a justificativa e, se aceitar, corrige o ponto manualmente
// (edição já existente em Controle de Ponto) — a ocorrência em si não altera nenhum
// horário sozinha, é só o registro da justificativa e da decisão. Só o Gestor vê e
// responde ocorrências (mesma regra de quem tem acesso pra corrigir o ponto).
const express = require("express");
const db = require("../db");
const { requireAuth, requireGestor } = require("../middleware/auth");
const { notify } = require("../utils/notify");
const { usaControlePonto } = require("../utils/pontoCompute");

const router = express.Router();

function gestoresAtivos() {
  return db.readCollection("consultores").filter((c) => c.perfil === "Gestor" && c.ativo);
}

function dataBr(iso) {
  const [ano, mes, dia] = String(iso).split("-");
  return `${dia}/${mes}/${ano}`;
}

// Funcionário registra uma ocorrência pra um dia específico (hoje ou um dia recente
// que esqueceu de bater). Não exige que já exista um registro de ponto pra esse dia —
// pode ser justamente a ocorrência de "não bati nada esse dia".
router.post("/", requireAuth, (req, res) => {
  if (!usaControlePonto(req.consultor)) {
    return res.status(403).json({ erro: "O Controle de Ponto não está habilitado para o seu cadastro." });
  }
  const { data, motivo } = req.body || {};
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return res.status(400).json({ erro: "Data inválida. Use o formato AAAA-MM-DD." });
  }
  if (!motivo || !motivo.trim()) {
    return res.status(400).json({ erro: "Descreva o que aconteceu para o Gestor avaliar." });
  }
  const jaTemPendente = db
    .readCollection("ocorrenciasPonto")
    .some((o) => o.consultorId === req.consultor.id && o.data === data && o.status === "Pendente");
  if (jaTemPendente) {
    return res.status(400).json({ erro: "Já existe uma ocorrência pendente para esse dia — aguarde a resposta do Gestor." });
  }

  const ocorrencia = db.insert("ocorrenciasPonto", {
    consultorId: req.consultor.id,
    data,
    motivo: motivo.trim(),
    status: "Pendente",
    respondidoPorId: null,
    respondidoEm: null,
    respostaObservacao: "",
  });

  gestoresAtivos().forEach((g) =>
    notify({
      tipo: "Ocorrência de Ponto",
      destinatarioId: g.id,
      assunto: `Ocorrência de ponto: ${req.consultor.nome}`,
      mensagem: `${req.consultor.nome} registrou uma ocorrência de ponto para ${dataBr(data)}: "${motivo.trim()}". Abra Controle de Ponto para avaliar.`,
    })
  );

  res.status(201).json(ocorrencia);
});

// Ocorrências do próprio funcionário, com status (tela "Meu Ponto").
router.get("/minhas", requireAuth, (req, res) => {
  const minhas = db
    .readCollection("ocorrenciasPonto")
    .filter((o) => o.consultorId === req.consultor.id)
    .sort((a, b) => (a.data < b.data ? 1 : -1));
  res.json(minhas);
});

// Listagem completa — só o Gestor.
router.get("/", requireGestor, (req, res) => {
  let ocorrencias = db.readCollection("ocorrenciasPonto");
  const { status } = req.query;
  if (status) ocorrencias = ocorrencias.filter((o) => o.status === status);
  res.json(ocorrencias.sort((a, b) => (a.data < b.data ? 1 : -1)));
});

// Gestor aceita ou recusa a justificativa. Aceitar NÃO corrige o ponto sozinho — só
// registra a decisão; a correção em si continua sendo feita manualmente pelo Gestor
// no registro de ponto do dia (Editar / Registrar manualmente), decisão explícita da
// usuária de manter esse controle sempre nas mãos dela.
router.patch("/:id/responder", requireGestor, (req, res) => {
  const ocorrencia = db.findById("ocorrenciasPonto", req.params.id);
  if (!ocorrencia) return res.status(404).json({ erro: "Ocorrência não encontrada." });
  if (ocorrencia.status !== "Pendente") {
    return res.status(400).json({ erro: "Essa ocorrência já foi respondida." });
  }
  const { status, respostaObservacao } = req.body || {};
  if (!["Aprovada", "Rejeitada"].includes(status)) {
    return res.status(400).json({ erro: "Status inválido — use Aprovada ou Rejeitada." });
  }

  const observacao = (respostaObservacao || "").trim();
  const atualizado = db.update("ocorrenciasPonto", ocorrencia.id, {
    status,
    respondidoPorId: req.consultor.id,
    respondidoEm: db.nowIso(),
    respostaObservacao: observacao,
  });

  notify({
    tipo: status === "Aprovada" ? "Ocorrência de Ponto Aceita" : "Ocorrência de Ponto Recusada",
    destinatarioId: ocorrencia.consultorId,
    assunto: `Sua ocorrência de ponto de ${dataBr(ocorrencia.data)} foi ${status === "Aprovada" ? "aceita" : "recusada"}`,
    mensagem:
      status === "Aprovada"
        ? `${req.consultor.nome} aceitou sua justificativa${observacao ? ` — observação: ${observacao}` : ""}. Se for o caso, seu ponto será corrigido manualmente.`
        : `${req.consultor.nome} não aceitou sua justificativa${observacao ? ` — motivo: ${observacao}` : ""}.`,
  });

  res.json(atualizado);
});

module.exports = router;
