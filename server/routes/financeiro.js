// Faturamento das vagas em aberto: quanto já foi recebido (1ª parcela, recebida ao
// abrir a vaga/gerar o contrato) e quanto está previsto para os próximos 30 dias
// (2ª parcela, na data de vencimento cadastrada no contrato). Só o Gestor tem acesso,
// por ser informação financeira.

const express = require("express");
const db = require("../db");
const { requireAuth, requireGestor } = require("../middleware/auth");
const { calcularParcelas } = require("../utils/financeiro");
const { ETAPAS_ENCERRADAS } = require("../utils/constants");
const { hojeStr } = require("../utils/vagaCompute");

const router = express.Router();

function diasAte(dataStr) {
  if (!dataStr) return null;
  const hoje = new Date(hojeStr() + "T00:00:00");
  const alvo = new Date(dataStr + "T00:00:00");
  return Math.round((alvo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
}

router.get("/", requireAuth, requireGestor, (req, res) => {
  const vagas = db.readCollection("vagas");
  const contratos = db.readCollection("contratos");
  const empresas = db.readCollection("empresas");
  const consultores = db.readCollection("consultores");

  const vagasAbertas = vagas.filter((v) => !ETAPAS_ENCERRADAS.includes(v.etapaAtual));
  const vagasAbertasIds = new Set(vagasAbertas.map((v) => v.id));

  const linhas = contratos
    .filter((c) => vagasAbertasIds.has(c.vagaId))
    .map((c) => {
      const vaga = db.findById("vagas", c.vagaId);
      const empresa = empresas.find((e) => e.id === c.empresaId);
      const consultor = consultores.find((cs) => cs.id === c.consultorId);
      const { valorTotal, valorParcela1, valorParcela2, salarioFaltando } = calcularParcelas(c, vaga);
      const diasParcela2 = diasAte(c.dataVencimentoParcela2);
      return {
        contratoId: c.id,
        numero: c.numero,
        vagaId: c.vagaId,
        vagaTitulo: vaga ? vaga.titulo : "—",
        empresaNome: empresa ? empresa.nome : "—",
        consultorNome: consultor ? consultor.nome : "—",
        tipoCobranca: c.tipoCobranca,
        valorTotal,
        valorParcela1,
        valorParcela2,
        dataVencimentoParcela1: c.dataVencimentoParcela1 || null,
        dataVencimentoParcela2: c.dataVencimentoParcela2 || null,
        diasParcela2,
        salarioFaltando,
      };
    })
    .sort((a, b) => (a.dataVencimentoParcela2 || "9999-99-99") < (b.dataVencimentoParcela2 || "9999-99-99") ? -1 : 1);

  const vagasComContrato = new Set(contratos.map((c) => c.vagaId));
  const vagasAbertasSemContrato = vagasAbertas.filter((v) => !vagasComContrato.has(v.id)).length;

  const recebido = linhas.reduce((soma, l) => soma + l.valorParcela1, 0);
  const totalContratado = linhas.reduce((soma, l) => soma + l.valorTotal, 0);
  const previsto30dias = linhas
    .filter((l) => l.diasParcela2 !== null && l.diasParcela2 >= 0 && l.diasParcela2 <= 30)
    .reduce((soma, l) => soma + l.valorParcela2, 0);
  const vencidoNaoRecebido = linhas
    .filter((l) => l.diasParcela2 !== null && l.diasParcela2 < 0)
    .reduce((soma, l) => soma + l.valorParcela2, 0);
  const qtdSemSalario = linhas.filter((l) => l.salarioFaltando).length;

  res.json({
    linhas,
    resumo: {
      recebido: Math.round(recebido * 100) / 100,
      previsto30dias: Math.round(previsto30dias * 100) / 100,
      vencidoNaoRecebido: Math.round(vencidoNaoRecebido * 100) / 100,
      totalContratado: Math.round(totalContratado * 100) / 100,
      aReceberTotal: Math.round((totalContratado - recebido) * 100) / 100,
      qtdSemSalario,
      vagasAbertasSemContrato,
    },
  });
});

// ---------- Contas a receber (todas as parcelas, com baixa e cobrança) ----------
const CR = require("../utils/contasReceber");
const re = /^\d{4}-\d{2}-\d{2}$/;
const dinheiro = (v) => {
  let s = String(v == null ? "" : v).replace(/[^\d,.]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};

router.get("/parcelas", requireAuth, requireGestor, (req, res) => {
  const hoje = CR.hojeLocal();
  const parcelas = CR.listarParcelas(hoje).sort((a, b) => {
    const ordem = { vencida: 0, hoje: 1, a_vencer: 2, sem_data: 3, paga: 4 };
    return ordem[a.situacao] - ordem[b.situacao] || String(a.vencimento || "9999").localeCompare(String(b.vencimento || "9999"));
  });
  res.json({ hoje, parcelas, resumo: CR.resumo(parcelas, hoje) });
});

router.get("/parcelas/contagem", requireAuth, requireGestor, (req, res) => {
  const r = CR.resumo(CR.listarParcelas());
  res.json({ cobrar: r.vencidas.qtd + r.hoje.qtd });
});

// Lançamento manual (ou várias parcelas de uma vez: ex. 50% agora + 50% em 30 dias).
router.post("/recebiveis", requireAuth, requireGestor, (req, res) => {
  const b = req.body || {};
  const parcelas = (Array.isArray(b.parcelas) ? b.parcelas : [b]).slice(0, 24);
  const empresa = b.empresaId ? db.findById("empresas", b.empresaId) : null;
  const clienteNome = String(b.clienteNome || (empresa && empresa.nome) || "").trim().slice(0, 150);
  if (!clienteNome) return res.status(400).json({ erro: "Escolha o cliente." });
  const lidas = parcelas.map((p, i) => ({ valor: dinheiro(p.valor), vencimento: re.test(String(p.vencimento || "")) ? p.vencimento : "", i }));
  if (!lidas.length || lidas.some((p) => !p.valor)) return res.status(400).json({ erro: "Informe o valor de cada parcela." });
  if (lidas.some((p) => !p.vencimento)) return res.status(400).json({ erro: "Informe o vencimento de cada parcela." });
  const vaga = b.vagaId ? db.findById("vagas", b.vagaId) : null;
  const descricaoBase = String(b.descricao || "").trim().slice(0, 150) || (vaga ? `Recrutamento e Seleção — ${vaga.titulo}` : "Serviço Evoé");
  const proposta = b.propostaId ? db.findById("propostas", b.propostaId) : null;
  const criados = lidas.map((p) =>
    db.insert(CR.COL, {
      empresaId: empresa ? empresa.id : null,
      clienteNome,
      vagaId: vaga ? vaga.id : null,
      consultorId: vaga ? vaga.consultorId : null,
      propostaId: proposta ? proposta.id : null,
      numeroProposta: proposta ? proposta.numero : "",
      descricao: lidas.length > 1 ? `${p.i + 1}ª parcela — ${descricaoBase}` : descricaoBase,
      parcela: p.i + 1,
      totalParcelas: lidas.length,
      valor: p.valor,
      vencimento: p.vencimento,
      pagamento: null,
      cobrancas: [],
      criadoPor: req.consultor.nome,
    })
  );
  if (proposta) db.update("propostas", proposta.id, { parcelasLancadas: criados.map((c) => c.id) });
  res.status(201).json(criados);
});

router.patch("/recebiveis/:id", requireAuth, requireGestor, (req, res) => {
  const r = db.findById(CR.COL, req.params.id);
  if (!r) return res.status(404).json({ erro: "Parcela não encontrada." });
  const b = req.body || {};
  const dados = {};
  if (b.valor !== undefined) {
    const v = dinheiro(b.valor);
    if (!v) return res.status(400).json({ erro: "Valor inválido." });
    dados.valor = v;
  }
  if (b.vencimento !== undefined) {
    if (!re.test(String(b.vencimento))) return res.status(400).json({ erro: "Vencimento inválido." });
    dados.vencimento = b.vencimento;
    dados.lembretesCobranca = {}; // data nova: lembretes recomeçam
  }
  if (b.descricao !== undefined) dados.descricao = String(b.descricao).trim().slice(0, 150);
  if (b.cancelar) Object.assign(dados, { cancelado: true, canceladoEm: new Date().toISOString(), canceladoPor: req.consultor.nome });
  res.json(db.update(CR.COL, r.id, { ...dados, historicoEdicoes: [...(r.historicoEdicoes || []), { em: new Date().toISOString(), por: req.consultor.nome, antes: { valor: r.valor, vencimento: r.vencimento, descricao: r.descricao } }] }));
});

router.post("/parcelas/:id/pagar", requireAuth, requireGestor, (req, res) => {
  const b = req.body || {};
  if (!re.test(String(b.em || ""))) return res.status(400).json({ erro: "Informe a data do recebimento." });
  try {
    CR.registrarPagamento(req.params.id, { em: b.em, valor: dinheiro(b.valor), forma: b.forma, obs: b.obs }, req.consultor.nome);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ erro: err.message });
  }
});

router.post("/parcelas/:id/desfazer", requireAuth, requireGestor, (req, res) => {
  try {
    CR.desfazerPagamento(req.params.id, req.consultor.nome);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ erro: err.message });
  }
});

router.post("/parcelas/:id/cobranca", requireAuth, requireGestor, (req, res) => {
  try {
    CR.registrarCobranca(req.params.id, String((req.body || {}).canal || "WhatsApp").slice(0, 30), req.consultor.nome);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ erro: err.message });
  }
});

module.exports = router;
