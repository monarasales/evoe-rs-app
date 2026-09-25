const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// Cada usuário só vê as próprias notificações.
router.get("/", requireAuth, (req, res) => {
  const minhas = db
    .readCollection("notificacoes")
    .filter((n) => n.destinatarioId === req.consultor.id)
    .sort((a, b) => (a.dataEnvio < b.dataEnvio ? 1 : -1));
  res.json(minhas);
});

router.get("/nao-lidas/contagem", requireAuth, (req, res) => {
  const total = db
    .readCollection("notificacoes")
    .filter((n) => n.destinatarioId === req.consultor.id && !n.lida).length;
  res.json({ total });
});

router.patch("/:id/lida", requireAuth, (req, res) => {
  const notificacao = db.findById("notificacoes", req.params.id);
  if (!notificacao || notificacao.destinatarioId !== req.consultor.id) {
    return res.status(404).json({ erro: "Notificação não encontrada." });
  }
  const atualizado = db.update("notificacoes", req.params.id, { lida: true });
  res.json(atualizado);
});

router.post("/marcar-todas-lidas", requireAuth, (req, res) => {
  const todas = db.readCollection("notificacoes");
  let alterou = false;
  todas.forEach((n) => {
    if (n.destinatarioId === req.consultor.id && !n.lida) {
      n.lida = true;
      alterou = true;
    }
  });
  if (alterou) db.writeCollection("notificacoes", todas);
  res.json({ ok: true });
});

module.exports = router;
