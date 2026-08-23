const express = require("express");
const db = require("../db");
const { requireAuth, requireGestor } = require("../middleware/auth");
const { hojeStr } = require("../utils/vagaCompute");

const router = express.Router();

// --- Despesas: Folha de Pagamento, Benefícios, Sistemas -----
// Gestor pode criar, editar, aprovar e visualizar despesas.
// Algumas despesas são derivadas do Ponto (extra/banco de horas) — o sistema as
// propõe automaticamente, mas Gestor aprova manualmente (pode ter particularidades).

const CATEGORIAS_DESPESA = [
  "Folha de Pagamento",
  "Benefício", // Vale Refeição, Vale Transporte, Plano de Saúde, etc.
  "Sistema/Ferramenta", // Adobe, Slack, etc.
  "Outro",
];

const STATUS_DESPESA = ["Rascunho", "Pendente Aprovação", "Aprovado", "Pago"];

router.get("/", requireAuth, requireGestor, (req, res) => {
  const despesas = db.readCollection("despesas");
  const { mes, ano, categoria, status } = req.query;

  let resultado = despesas;

  if (mes && ano) {
    const mesStr = String(mes).padStart(2, "0");
    const anoStr = String(ano);
    resultado = resultado.filter((d) => {
      const dataParte = (d.dataPeriodo || "").substring(0, 7);
      return dataParte === `${anoStr}-${mesStr}`;
    });
  }

  if (categoria) {
    resultado = resultado.filter((d) => d.categoria === categoria);
  }

  if (status) {
    resultado = resultado.filter((d) => d.status === status);
  }

  res.json(resultado);
});

router.get("/categorias", requireAuth, requireGestor, (req, res) => {
  res.json(CATEGORIAS_DESPESA);
});

router.get("/status", requireAuth, requireGestor, (req, res) => {
  res.json(STATUS_DESPESA);
});

router.post("/", requireAuth, requireGestor, (req, res) => {
  const {
    descricao, categoria, valor, dataPeriodo,
    consultorId, origem, // origem: "Manual" ou "Ponto" (auto-derivada)
    observacoes,
  } = req.body || {};

  if (!descricao || !categoria || valor === undefined || !dataPeriodo) {
    return res.status(400).json({ erro: "Descrição, categoria, valor e data/período são obrigatórios." });
  }

  if (!CATEGORIAS_DESPESA.includes(categoria)) {
    return res.status(400).json({ erro: "Categoria de despesa inválida." });
  }

  const despesa = db.insert("despesas", {
    descricao,
    categoria,
    valor: Number(valor),
    dataPeriodo, // YYYY-MM ou YYYY-MM-DD
    consultorId: consultorId || null, // Opcional, para associar a um funcionário
    origem: origem || "Manual", // "Manual" ou "Ponto"
    status: "Rascunho",
    observacoes: observacoes || "",
    dataPagamento: null,
  });

  res.status(201).json(despesa);
});

router.patch("/:id", requireAuth, requireGestor, (req, res) => {
  const despesa = db.findById("despesas", req.params.id);
  if (!despesa) return res.status(404).json({ erro: "Despesa não encontrada." });

  const { descricao, categoria, valor, dataPeriodo, status, dataPagamento, observacoes } = req.body || {};

  if (categoria && !CATEGORIAS_DESPESA.includes(categoria)) {
    return res.status(400).json({ erro: "Categoria de despesa inválida." });
  }

  if (status && !STATUS_DESPESA.includes(status)) {
    return res.status(400).json({ erro: "Status de despesa inválido." });
  }

  const atualizado = db.update("despesas", despesa.id, {
    descricao,
    categoria,
    valor: valor !== undefined ? Number(valor) : undefined,
    dataPeriodo,
    status,
    dataPagamento, // Marca como pago
    observacoes,
  });

  res.json(atualizado);
});

router.delete("/:id", requireAuth, requireGestor, (req, res) => {
  const despesa = db.findById("despesas", req.params.id);
  if (!despesa) return res.status(404).json({ erro: "Despesa não encontrada." });

  db.remove("despesas", req.params.id);
  res.json({ ok: true });
});

// --- Gerar despesas derivadas do Ponto (propostas) ----
// POST /gerar-do-ponto: sistema analisa banco de horas/extra do mês e propõe despesas
// Gestor revisa, aprova ou rejeita.
router.post("/gerar-do-ponto", requireAuth, requireGestor, (req, res) => {
  const { mes, ano } = req.body || {};
  if (!mes || !ano) {
    return res.status(400).json({ erro: "Mês e ano são obrigatórios." });
  }

  // Busca closures de ponto do mês
  const mesStr = String(mes).padStart(2, "0");
  const fechamentosDoMes = db.readCollection("fechamentosPonto").filter((f) => {
    const [fAno, fMes] = (f.mesFechamento || "").split("-");
    return fAno === String(ano) && fMes === mesStr;
  });

  const propostas = [];

  fechamentosDoMes.forEach((fechamento) => {
    const consultor = db.findById("consultores", fechamento.consultorId);
    if (!consultor) return;

    // Extra a pagar (banco de horas positivo)
    if (fechamento.saldoFinal && fechamento.saldoFinal > 0) {
      const minutosExtra = fechamento.saldoFinal;
      const horasExtra = minutosExtra / 60;
      const valorHora = consultor.salarioMensal ? consultor.salarioMensal / 220 : 0; // ~220h/mês
      const valorExtra = horasExtra * valorHora;

      propostas.push({
        descricao: `Extra — ${consultor.nome} (${horasExtra.toFixed(1)}h)`,
        categoria: "Folha de Pagamento",
        valor: Math.round(valorExtra * 100) / 100,
        dataPeriodo: `${ano}-${mesStr}`,
        consultorId: consultor.id,
        origem: "Ponto",
        observacoes: `Auto-gerado do fechamento de ponto. ${horasExtra.toFixed(1)}h a R$ ${(valorHora).toFixed(2)}/h`,
      });
    }

    // Desconto por falta (banco negativo — opcional, depende da política)
    // Por enquanto, não criamos desconto automático, só comunicamos
  });

  res.json({
    mes,
    ano,
    propostasCount: propostas.length,
    propostas,
  });
});

module.exports = router;
