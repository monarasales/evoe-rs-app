const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { garantirPontoDeHoje } = require("../utils/pontoCompute");

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

  // Controle de Ponto: estagiário bate a entrada automaticamente ao logar — não
  // depende de ele lembrar de fazer isso manualmente. Se algo der errado aqui,
  // não pode travar o login (por isso o try/catch).
  if (consultor.tipoVinculo === "Estágio") {
    try {
      garantirPontoDeHoje(consultor);
    } catch (e) {
      console.error("Falha ao registrar ponto automático no login:", e.message);
    }
  }

  res.json({ id: consultor.id, nome: consultor.nome, perfil: consultor.perfil, email: consultor.email, tipoVinculo: consultor.tipoVinculo });
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
    tipoVinculo: req.consultor.tipoVinculo,
  });
});

module.exports = router;
