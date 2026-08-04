// CRM — Prospects: todo mundo que entra em contato querendo cotar um serviço
// (seleção, implantação de RH, implantação de cultura, pesquisa de clima), ainda sem
// ser cliente. Serve para a Evoé fazer follow-up e entender quem indicou / por que
// eventualmente não fechou.

const express = require("express");
const db = require("../db");
const { requireGestor } = require("../middleware/auth");
const { SERVICOS_PROSPECT, ETAPAS_PROSPECT } = require("../utils/constants");

const router = express.Router();

// CRM (Prospects) é restrito ao Gestor — Recrutador e Supervisora não têm acesso,
// nem leitura nem escrita, a dados comerciais de clientes/prospects.
router.get("/", requireGestor, (req, res) => {
  const prospects = db.readCollection("prospects").sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  res.json(prospects);
});

router.get("/opcoes", requireGestor, (req, res) => {
  res.json({ servicos: SERVICOS_PROSPECT, etapas: ETAPAS_PROSPECT });
});

router.get("/:id", requireGestor, (req, res) => {
  const prospect = db.findById("prospects", req.params.id);
  if (!prospect) return res.status(404).json({ erro: "Prospect não encontrado." });
  res.json(prospect);
});

function extrairCampos(body) {
  const {
    nome,
    empresa,
    telefone,
    servicoDesejado,
    servicoOutro,
    quemIndicou,
    motivoNaoFechou,
    etapa,
    dataContato,
    proximoFollowUp,
    observacoes,
  } = body || {};
  return {
    nome: (nome || "").trim(),
    empresa: (empresa || "").trim(),
    telefone: (telefone || "").trim(),
    servicoDesejado: SERVICOS_PROSPECT.includes(servicoDesejado) ? servicoDesejado : SERVICOS_PROSPECT[0],
    servicoOutro: (servicoOutro || "").trim(),
    quemIndicou: (quemIndicou || "").trim(),
    motivoNaoFechou: (motivoNaoFechou || "").trim(),
    etapa: ETAPAS_PROSPECT.includes(etapa) ? etapa : ETAPAS_PROSPECT[0],
    dataContato: dataContato || new Date().toISOString().slice(0, 10),
    proximoFollowUp: proximoFollowUp || null,
    observacoes: (observacoes || "").trim(),
  };
}

router.post("/", requireGestor, (req, res) => {
  const campos = extrairCampos(req.body);
  if (!campos.nome) return res.status(400).json({ erro: "Nome da pessoa de contato é obrigatório." });
  const prospect = db.insert("prospects", { ...campos, criadoPorId: req.consultor.id });
  res.status(201).json(prospect);
});

router.patch("/:id", requireGestor, (req, res) => {
  const prospect = db.findById("prospects", req.params.id);
  if (!prospect) return res.status(404).json({ erro: "Prospect não encontrado." });
  const campos = extrairCampos({ ...prospect, ...req.body });
  if (!campos.nome) return res.status(400).json({ erro: "Nome da pessoa de contato é obrigatório." });
  const atualizado = db.update("prospects", prospect.id, campos);
  res.json(atualizado);
});

router.delete("/:id", requireGestor, (req, res) => {
  const ok = db.remove("prospects", req.params.id);
  if (!ok) return res.status(404).json({ erro: "Prospect não encontrado." });
  res.json({ ok: true });
});

module.exports = router;
