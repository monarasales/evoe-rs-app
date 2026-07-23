const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { requireGestor } = require("../middleware/auth");
const { PERFIS_ACESSO } = require("../utils/constants");

const router = express.Router();

// Qualquer usuário autenticado pode listar consultores (precisa para os seletores de formulário).
router.get("/", (req, res) => {
  const users = db.readCollection("users");
  const consultores = db.readCollection("consultores").map((c) => {
    const user = users.find((u) => u.consultorId === c.id);
    return { ...c, username: user ? user.username : null };
  });
  res.json(consultores);
});

router.get("/:id", (req, res) => {
  const consultor = db.findById("consultores", req.params.id);
  if (!consultor) return res.status(404).json({ erro: "Consultor não encontrado." });
  res.json(consultor);
});

// Apenas Gestor pode criar/editar consultores (gestão de equipe).
router.post("/", requireGestor, (req, res) => {
  const { nome, email, whatsapp, perfil, ativo, username, senha } = req.body || {};
  if (!nome || !email || !perfil || !PERFIS_ACESSO.includes(perfil)) {
    return res.status(400).json({ erro: "Nome, e-mail e perfil (Gestor/Recrutador) são obrigatórios." });
  }
  const consultor = db.insert("consultores", {
    nome,
    email,
    whatsapp: whatsapp || "",
    perfil,
    ativo: ativo !== false,
  });

  if (username && senha) {
    const jaExiste = db.readCollection("users").some((u) => u.username === username.toLowerCase());
    if (!jaExiste) {
      db.insert("users", {
        consultorId: consultor.id,
        username: username.toLowerCase(),
        passwordHash: bcrypt.hashSync(senha, 10),
      });
    }
  }

  res.status(201).json(consultor);
});

router.patch("/:id", requireGestor, (req, res) => {
  const { nome, email, whatsapp, perfil, ativo } = req.body || {};
  if (perfil && !PERFIS_ACESSO.includes(perfil)) {
    return res.status(400).json({ erro: "Perfil inválido." });
  }
  const atualizado = db.update("consultores", req.params.id, { nome, email, whatsapp, perfil, ativo });
  if (!atualizado) return res.status(404).json({ erro: "Consultor não encontrado." });
  res.json(atualizado);
});

// Redefinir usuário/senha de login de um consultor já existente (só Gestor).
router.patch("/:id/credenciais", requireGestor, (req, res) => {
  const consultor = db.findById("consultores", req.params.id);
  if (!consultor) return res.status(404).json({ erro: "Consultor não encontrado." });

  const { username, senha } = req.body || {};
  if (!username || !senha) {
    return res.status(400).json({ erro: "Usuário e senha são obrigatórios." });
  }

  const usernameNormalizado = String(username).trim().toLowerCase();
  const users = db.readCollection("users");
  const emUsoPorOutro = users.some(
    (u) => u.username === usernameNormalizado && u.consultorId !== consultor.id
  );
  if (emUsoPorOutro) {
    return res.status(400).json({ erro: "Esse nome de usuário já está em uso por outro consultor." });
  }

  const existente = users.find((u) => u.consultorId === consultor.id);
  const passwordHash = bcrypt.hashSync(senha, 10);
  if (existente) {
    db.update("users", existente.id, { username: usernameNormalizado, passwordHash });
  } else {
    db.insert("users", { consultorId: consultor.id, username: usernameNormalizado, passwordHash });
  }

  res.json({ username: usernameNormalizado });
});

module.exports = router;
