const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.post("/login", (req, res) => {
  const { username, senha } = req.body || {};
  if (!username || !senha) {
    return res.status(400).json({ erro: "Informe usuário e senha." });
  }
  const user = db.readCollection("users").find((u) => u.username === String(username).toLowerCase());
  if (!user || !bcrypt.compareSync(senha, user.passwordHash)) {
    return res.status(401).json({ erro: "Usuário ou senha inválidos." });
  }
  const consultor = db.findById("consultores", user.consultorId);
  if (!consultor || !consultor.ativo) {
    return res.status(403).json({ erro: "Usuário inativo. Fale com o gestor do sistema." });
  }
  req.session.userId = user.id;
  res.json({ id: consultor.id, nome: consultor.nome, perfil: consultor.perfil, email: consultor.email });
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({
    id: req.consultor.id,
    nome: req.consultor.nome,
    perfil: req.consultor.perfil,
    email: req.consultor.email,
  });
});

module.exports = router;
