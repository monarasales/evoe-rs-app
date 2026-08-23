const express = require("express");
const db = require("../db");
const { requireAuth, requireGestor } = require("../middleware/auth");

const router = express.Router();

// --- Módulo Cultura Organizacional ---
// Gerenciar projetos de implementação de cultura dos clientes.
// Cada projeto tem um cronograma com fases/ações, prazos e status de cumprimento.

const ETAPAS_PROJETO = [
  "Diagnóstico",
  "Planejamento",
  "Implementação",
  "Acompanhamento",
  "Encerramento",
];

const STATUS_ACAO = ["Não Iniciada", "Em Andamento", "Concluída", "Atrasada"];

// --- Projetos de Cultura ---
router.get("/projetos", requireAuth, requireGestor, (req, res) => {
  const projetos = db.readCollection("projetosCultura");
  const { empresaId, status } = req.query;

  let resultado = projetos;

  if (empresaId) {
    resultado = resultado.filter((p) => p.empresaId === empresaId);
  }

  if (status) {
    resultado = resultado.filter((p) => p.status === status);
  }

  res.json(resultado);
});

router.post("/projetos", requireAuth, requireGestor, (req, res) => {
  const {
    titulo, empresaId, descricao, dataInicio, dataFim,
    consultorResponsavel, objetivos,
  } = req.body || {};

  if (!titulo || !empresaId) {
    return res.status(400).json({ erro: "Título e empresa são obrigatórios." });
  }

  const empresa = db.findById("empresas", empresaId);
  if (!empresa) return res.status(400).json({ erro: "Empresa não encontrada." });

  const projeto = db.insert("projetosCultura", {
    titulo,
    empresaId,
    descricao: descricao || "",
    dataInicio: dataInicio || null,
    dataFim: dataFim || null,
    consultorResponsavel: consultorResponsavel || null,
    objetivos: objetivos || "", // Texto descritivo dos objetivos
    status: "Planejamento", // Diagnóstico, Planejamento, Implementação, Acompanhamento, Encerramento
    progresso: 0, // Percentual (calcula-se a partir das ações)
  });

  res.status(201).json(projeto);
});

router.get("/projetos/:id", requireAuth, requireGestor, (req, res) => {
  const projeto = db.findById("projetosCultura", req.params.id);
  if (!projeto) return res.status(404).json({ erro: "Projeto não encontrado." });
  res.json(projeto);
});

router.patch("/projetos/:id", requireAuth, requireGestor, (req, res) => {
  const projeto = db.findById("projetosCultura", req.params.id);
  if (!projeto) return res.status(404).json({ erro: "Projeto não encontrado." });

  const { titulo, descricao, dataInicio, dataFim, status, consultorResponsavel, objetivos } = req.body || {};

  const atualizado = db.update("projetosCultura", projeto.id, {
    titulo,
    descricao,
    dataInicio,
    dataFim,
    status,
    consultorResponsavel,
    objetivos,
  });

  res.json(atualizado);
});

router.delete("/projetos/:id", requireAuth, requireGestor, (req, res) => {
  const projeto = db.findById("projetosCultura", req.params.id);
  if (!projeto) return res.status(404).json({ erro: "Projeto não encontrado." });

  // Remove todas as ações do projeto
  const acoes = db.readCollection("acoesCultura");
  const acoesRestantes = acoes.filter((a) => a.projetoId !== projeto.id);
  db.writeCollection("acoesCultura", acoesRestantes);

  db.remove("projetosCultura", projeto.id);
  res.json({ ok: true });
});

// --- Ações/Tarefas do Projeto ---
router.get("/projetos/:projetoId/acoes", requireAuth, requireGestor, (req, res) => {
  const acoes = db.readCollection("acoesCultura");
  const resultado = acoes.filter((a) => a.projetoId === req.params.projetoId);
  // Ordena por data (cronog)
  resultado.sort((a, b) => (a.dataVencimento || "").localeCompare(b.dataVencimento || ""));
  res.json(resultado);
});

router.post("/projetos/:projetoId/acoes", requireAuth, requireGestor, (req, res) => {
  const projeto = db.findById("projetosCultura", req.params.projetoId);
  if (!projeto) return res.status(404).json({ erro: "Projeto não encontrado." });

  const {
    titulo, descricao, etapa, dataVencimento, responsavel, status,
    observacoes,
  } = req.body || {};

  if (!titulo) {
    return res.status(400).json({ erro: "Título da ação é obrigatório." });
  }

  if (etapa && !ETAPAS_PROJETO.includes(etapa)) {
    return res.status(400).json({ erro: "Etapa inválida." });
  }

  const acao = db.insert("acoesCultura", {
    projetoId: projeto.id,
    titulo,
    descricao: descricao || "",
    etapa: etapa || "Implementação",
    dataVencimento: dataVencimento || null,
    responsavel: responsavel || null, // ID do consultor ou texto livre
    status: status || "Não Iniciada",
    observacoes: observacoes || "",
  });

  res.status(201).json(acao);
});

router.patch("/acoes/:id", requireAuth, requireGestor, (req, res) => {
  const acao = db.findById("acoesCultura", req.params.id);
  if (!acao) return res.status(404).json({ erro: "Ação não encontrada." });

  const { titulo, descricao, etapa, dataVencimento, status, responsavel, observacoes } = req.body || {};

  if (status && !STATUS_ACAO.includes(status)) {
    return res.status(400).json({ erro: "Status de ação inválido." });
  }

  const atualizado = db.update("acoesCultura", acao.id, {
    titulo,
    descricao,
    etapa,
    dataVencimento,
    status,
    responsavel,
    observacoes,
  });

  res.json(atualizado);
});

router.delete("/acoes/:id", requireAuth, requireGestor, (req, res) => {
  const acao = db.findById("acoesCultura", req.params.id);
  if (!acao) return res.status(404).json({ erro: "Ação não encontrada." });

  db.remove("acoesCultura", acao.id);
  res.json({ ok: true });
});

// --- Constantes ---
router.get("/etapas", requireAuth, requireGestor, (req, res) => {
  res.json(ETAPAS_PROJETO);
});

router.get("/status-acoes", requireAuth, requireGestor, (req, res) => {
  res.json(STATUS_ACAO);
});

module.exports = router;
