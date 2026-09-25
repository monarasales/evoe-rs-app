const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// Bater ponto (criar registro)
router.post("/bater", requireAuth, (req, res) => {
  const usuario = req.user;
  const hoje = new Date().toISOString().split("T")[0];

  // Procurar ponto do usuário de hoje
  const pontos = db.readCollection("ponto") || [];
  let pontoDia = pontos.find((p) => {
    const dataPonto = new Date(p.criadoEm).toISOString().split("T")[0];
    return dataPonto === hoje && p.usuarioId === usuario.id;
  });

  if (!pontoDia) {
    // Criar novo registro de ponto (entrada)
    pontoDia = db.insert("ponto", {
      usuarioId: usuario.id,
      usuarioNome: usuario.nome,
      colaboradorId: usuario.consultorId || usuario.id, // Usando consultorId como colaboradorId
      data: hoje,
      entrada: new Date().toISOString(),
      saida: null,
      pausaEntrada: null,
      pausaSaida: null,
      criadoEm: new Date().toISOString(),
    });
  } else if (!pontoDia.saida && pontoDia.pausaSaida) {
    // Retornando de pausa - registrar saída
    pontoDia.saida = new Date().toISOString();
    db.update("ponto", pontoDia.id, pontoDia);
  } else if (!pontoDia.pausaEntrada && pontoDia.entrada && !pontoDia.pausaSaida) {
    // Iniciando pausa - registrar entrada de pausa
    pontoDia.pausaEntrada = new Date().toISOString();
    db.update("ponto", pontoDia.id, pontoDia);
  } else if (pontoDia.pausaEntrada && !pontoDia.pausaSaida) {
    // Finalizando pausa - registrar saída de pausa
    pontoDia.pausaSaida = new Date().toISOString();
    db.update("ponto", pontoDia.id, pontoDia);
  } else if (!pontoDia.saida) {
    // Registrar saída
    pontoDia.saida = new Date().toISOString();
    db.update("ponto", pontoDia.id, pontoDia);
  }

  res.json(pontoDia);
});

// Obter pontos do dia (usuário logado)
router.get("/dia/:data", requireAuth, (req, res) => {
  const usuario = req.user;
  const data = req.params.data;

  const pontos = db.readCollection("ponto") || [];
  const pontosDodia = pontos.filter((p) => {
    const dataPonto = new Date(p.criadoEm).toISOString().split("T")[0];
    return dataPonto === data && p.usuarioId === usuario.id;
  });

  res.json(pontosDodia);
});

// Obter últimos 7 dias (usuário logado)
router.get("/semana", requireAuth, (req, res) => {
  const usuario = req.user;
  const hoje = new Date();
  const seratras7Dias = new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000);

  const pontos = db.readCollection("ponto") || [];
  const pontosSemana = pontos.filter((p) => {
    const dataPonto = new Date(p.criadoEm);
    return dataPonto >= seratras7Dias && p.usuarioId === usuario.id;
  });

  res.json(pontosSemana);
});

// Obter pontos de todos os colaboradores (apenas Gestor)
router.get("/colaboradores", (req, res) => {
  const { requireGestor } = require("../middleware/auth");
  if (req.user && !req.user.perfil || !req.user.perfil.includes("Gestor")) {
    return res.status(403).json({ erro: "Acesso negado." });
  }

  const pontos = db.readCollection("ponto") || [];

  // Agrupar por colaborador e data
  const pontosOrganizados = pontos.map((p) => ({
    ...p,
    colaboradorNome: p.usuarioNome,
  }));

  res.json(pontosOrganizados);
});

module.exports = router;
