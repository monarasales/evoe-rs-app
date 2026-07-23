const express = require("express");
const db = require("../db");

const router = express.Router();

router.get("/", (req, res) => {
  res.json(db.readCollection("empresas"));
});

router.get("/:id", (req, res) => {
  const empresa = db.findById("empresas", req.params.id);
  if (!empresa) return res.status(404).json({ erro: "Empresa não encontrada." });
  res.json(empresa);
});

router.post("/", (req, res) => {
  const { nome, cnpj, endereco, segmento, contatoResponsavel, emailContato, whatsappContato } = req.body || {};
  if (!nome) return res.status(400).json({ erro: "Nome da empresa é obrigatório." });
  const empresa = db.insert("empresas", {
    nome,
    cnpj: cnpj || "",
    endereco: endereco || "",
    segmento: segmento || "",
    contatoResponsavel: contatoResponsavel || "",
    emailContato: emailContato || "",
    whatsappContato: whatsappContato || "",
  });
  res.status(201).json(empresa);
});

router.patch("/:id", (req, res) => {
  const atualizado = db.update("empresas", req.params.id, req.body || {});
  if (!atualizado) return res.status(404).json({ erro: "Empresa não encontrada." });
  res.json(atualizado);
});

router.delete("/:id", (req, res) => {
  const emUso = db.readCollection("vagas").some((v) => v.empresaId === req.params.id);
  if (emUso) {
    return res.status(409).json({ erro: "Esta empresa possui vagas vinculadas e não pode ser excluída." });
  }
  const ok = db.remove("empresas", req.params.id);
  if (!ok) return res.status(404).json({ erro: "Empresa não encontrada." });
  res.json({ ok: true });
});

module.exports = router;
