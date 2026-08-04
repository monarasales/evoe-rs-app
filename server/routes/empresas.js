const express = require("express");
const db = require("../db");
const { requireAuth, requireGestor } = require("../middleware/auth");

const router = express.Router();

// Leitura fica aberta a qualquer logado — Recrutador/Supervisora precisam ver o
// NOME da empresa em Vagas, Contratos e Dashboard, mesmo sem acesso ao CRM completo.
// Criar/editar/excluir empresa (dados comerciais do cliente) é só do Gestor.
router.get("/", requireAuth, (req, res) => {
  res.json(db.readCollection("empresas"));
});

router.get("/:id", requireAuth, (req, res) => {
  const empresa = db.findById("empresas", req.params.id);
  if (!empresa) return res.status(404).json({ erro: "Empresa não encontrada." });
  res.json(empresa);
});

router.post("/", requireGestor, (req, res) => {
  const {
    nome,
    cnpj,
    endereco,
    segmento,
    contatoResponsavel,
    emailContato,
    whatsappContato,
    representanteLegalNome,
    representanteLegalCpf,
  } = req.body || {};
  if (!nome) return res.status(400).json({ erro: "Nome da empresa é obrigatório." });
  const empresa = db.insert("empresas", {
    nome,
    cnpj: cnpj || "",
    endereco: endereco || "",
    segmento: segmento || "",
    contatoResponsavel: contatoResponsavel || "",
    emailContato: emailContato || "",
    whatsappContato: whatsappContato || "",
    representanteLegalNome: representanteLegalNome || "",
    representanteLegalCpf: representanteLegalCpf || "",
  });
  res.status(201).json(empresa);
});

router.patch("/:id", requireGestor, (req, res) => {
  const atualizado = db.update("empresas", req.params.id, req.body || {});
  if (!atualizado) return res.status(404).json({ erro: "Empresa não encontrada." });
  res.json(atualizado);
});

router.delete("/:id", requireGestor, (req, res) => {
  const emUso = db.readCollection("vagas").some((v) => v.empresaId === req.params.id);
  if (emUso) {
    return res.status(409).json({ erro: "Esta empresa possui vagas vinculadas e não pode ser excluída." });
  }
  const ok = db.remove("empresas", req.params.id);
  if (!ok) return res.status(404).json({ erro: "Empresa não encontrada." });
  res.json({ ok: true });
});

module.exports = router;
