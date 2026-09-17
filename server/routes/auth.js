const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { usaControlePonto } = require("../utils/pontoCompute");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "evoe-rs-jwt-secret-change-in-production";

router.post("/login", (req, res) => {
  const { username, senha } = req.body || {};
  if (!username || !senha) {
    return res.status(400).json({ erro: "Informe usuário e senha." });
  }
  const user = db.readCollection("users").find((u) => u.username === String(username).trim().toLowerCase());
  if (!user || !bcrypt.compareSync(String(senha).trim(), user.passwordHash)) {
    return res.status(401).json({ erro: "Usuário ou senha inválidos." });
  }
  const consultor = db.findById("consultores", user.consultorId);
  if (!consultor || !consultor.ativo) {
    return res.status(403).json({ erro: "Usuário inativo. Fale com o gestor do sistema." });
  }

  // Gera JWT token
  const token = jwt.sign(
    { userId: user.id, consultorId: consultor.id, username: user.username },
    JWT_SECRET,
    { expiresIn: "8h" }
  );

  res.json({
    token,
    id: consultor.id,
    nome: consultor.nome,
    perfil: consultor.perfil,
    email: consultor.email,
    usaControlePonto: usaControlePonto(consultor),
    bloqueiaAutoCorrecaoPonto: !!consultor.bloqueiaAutoCorrecaoPonto,
  });
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
    usaControlePonto: usaControlePonto(req.consultor),
    bloqueiaAutoCorrecaoPonto: !!req.consultor.bloqueiaAutoCorrecaoPonto,
  });
});

module.exports = router;
