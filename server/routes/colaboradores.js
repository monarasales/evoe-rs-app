const express = require("express");
const db = require("../db");
const { requireGestor } = require("../middleware/auth");

const router = express.Router();

// Listar todos os colaboradores
router.get("/", (req, res) => {
  const colaboradores = db.readCollection("colaboradores") || [];
  res.json(colaboradores);
});

// Obter colaborador por ID
router.get("/:id", (req, res) => {
  const colaborador = db.findById("colaboradores", req.params.id);
  if (!colaborador) return res.status(404).json({ erro: "Colaborador não encontrado." });
  res.json(colaborador);
});

// Criar novo colaborador (apenas Gestor)
router.post("/", requireGestor, (req, res) => {
  const { nome, cargo, cpf, email, telefone, endereco, ativo } = req.body || {};
  if (!nome) {
    return res.status(400).json({ erro: "Nome é obrigatório." });
  }

  const colaborador = db.insert("colaboradores", {
    nome,
    cargo: cargo || "",
    cpf: cpf || "",
    email: email || "",
    telefone: telefone || "",
    endereco: endereco || "",
    ativo: ativo !== false,
    criadoEm: new Date().toISOString(),
  });

  res.status(201).json(colaborador);
});

// Editar colaborador (apenas Gestor)
router.patch("/:id", requireGestor, (req, res) => {
  const { nome, cargo, cpf, email, telefone, endereco, ativo } = req.body || {};
  const atualizado = db.update("colaboradores", req.params.id, {
    nome,
    cargo,
    cpf,
    email,
    telefone,
    endereco,
    ativo,
  });
  if (!atualizado) return res.status(404).json({ erro: "Colaborador não encontrado." });
  res.json(atualizado);
});

// Excluir colaborador (apenas Gestor)
router.delete("/:id", requireGestor, (req, res) => {
  const deletado = db.delete("colaboradores", req.params.id);
  if (!deletado) return res.status(404).json({ erro: "Colaborador não encontrado." });
  res.json({ sucesso: true });
});

module.exports = router;
