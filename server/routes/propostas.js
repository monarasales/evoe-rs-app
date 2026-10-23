// Propostas comerciais (CRM, só Gestor): modelo padrão editável, proposta por cliente
// (cópia própria dos textos, editável), PDF com a identidade visual, Word editável e
// status (Rascunho → Enviada → Aceita/Recusada; "Arquivada" em vez de apagar).

const express = require("express");
const db = require("../db");
const { requireAuth, requireGestor } = require("../middleware/auth");
const { MODELO_PADRAO, MARCADORES, calcularVagas, gerarPdfProposta, gerarDocxProposta } = require("../utils/proposta");

const router = express.Router();
router.use(requireAuth, requireGestor);

const COL = "propostas";
const STATUS = ["Rascunho", "Enviada", "Aceita", "Recusada", "Arquivada"];
const t = (v, max = 300) => String(v == null ? "" : v).trim().slice(0, max);
const num = (v, min, max, padrao) => {
  const n = Number(String(v == null ? "" : v).replace(",", "."));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao;
};
const dinheiro = (v) => {
  let s = String(v == null ? "" : v).replace(/[^\d,.]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};

const paramModelo = () => db.readCollection("parametros").find((p) => p.chave === "modeloProposta");
/** Modelo em uso: o salvo pelo Gestor sobre o padrão (campos novos do padrão nunca somem). */
function modeloAtual() {
  const p = paramModelo();
  return { ...MODELO_PADRAO, ...((p && p.modelo) || {}) };
}

function normalizarSecoes(lista) {
  return (Array.isArray(lista) ? lista : []).slice(0, 30).map((s, i) => ({
    id: t(s.id, 40) || `secao-${i + 1}`,
    titulo: t(s.titulo, 120),
    texto: t(s.texto, 8000),
    novaPagina: !!s.novaPagina,
    tabelaVagas: !!s.tabelaVagas,
    incluir: s.incluir !== false,
  }));
}

/** Campos editáveis (proposta ou modelo). Só o que vier na requisição é alterado. */
function lerCampos(b, base = {}) {
  const d = {};
  const tem = (k) => b[k] !== undefined;
  if (tem("percentual")) d.percentual = num(b.percentual, 0, 300, base.percentual);
  if (tem("percentualTabela")) d.percentualTabela = num(b.percentualTabela, 0, 300, base.percentualTabela);
  if (tem("pagamento")) d.pagamento = t(b.pagamento, 300);
  if (tem("garantiaDias")) d.garantiaDias = num(b.garantiaDias, 0, 999, base.garantiaDias);
  if (tem("prazoDias")) d.prazoDias = num(b.prazoDias, 0, 999, base.prazoDias);
  if (tem("validadeDias")) d.validadeDias = num(b.validadeDias, 0, 999, base.validadeDias);
  if (tem("salarioMinimo")) d.salarioMinimo = dinheiro(b.salarioMinimo);
  if (tem("assinaturaNome")) d.assinaturaNome = t(b.assinaturaNome, 120);
  if (tem("assinaturaCargo")) d.assinaturaCargo = t(b.assinaturaCargo, 120);
  if (tem("incluirParceiros")) d.incluirParceiros = !!b.incluirParceiros;
  if (tem("secoes")) d.secoes = normalizarSecoes(b.secoes);
  return d;
}

function lerCamposProposta(b) {
  const d = {};
  const tem = (k) => b[k] !== undefined;
  for (const [k, max] of [["clienteNome", 150], ["contatoNome", 120], ["contatoEmail", 160], ["contatoWhatsapp", 25], ["observacaoInterna", 1000]]) if (tem(k)) d[k] = t(b[k], max);
  if (tem("data") && /^\d{4}-\d{2}-\d{2}$/.test(b.data)) d.data = b.data;
  if (tem("vagas"))
    d.vagas = (Array.isArray(b.vagas) ? b.vagas : []).slice(0, 50).map((v) => ({ cargo: t(v.cargo, 150), salario: dinheiro(v.salario), quantidade: Math.max(1, Math.min(99, parseInt(v.quantidade, 10) || 1)) })).filter((v) => v.cargo || v.salario);
  return d;
}

const comTotais = (p) => ({ ...p, calculo: calcularVagas(p) });

// ---------- Modelo padrão ----------
router.get("/modelo", (req, res) => {
  const p = paramModelo();
  res.json({ modelo: modeloAtual(), personalizado: !!(p && p.modelo), atualizadoPor: p ? p.atualizadoPor : null, atualizadoEm: p ? p.updatedAt : null, marcadores: MARCADORES });
});

router.put("/modelo", (req, res) => {
  const b = req.body || {};
  const p = paramModelo();
  if (b.restaurar) {
    // Restaurar guarda o modelo personalizado anterior (nada se perde).
    if (p) db.update("parametros", p.id, { modelo: null, modelosAnteriores: [...(p.modelosAnteriores || []), ...(p.modelo ? [{ em: new Date().toISOString(), modelo: p.modelo }] : [])].slice(-20), atualizadoPor: req.consultor.nome });
    return res.json({ modelo: MODELO_PADRAO, personalizado: false });
  }
  const atual = modeloAtual();
  const modelo = { ...((p && p.modelo) || {}), ...lerCampos(b, atual) };
  const dados = { modelo, atualizadoPor: req.consultor.nome, ...(p && p.modelo ? { modelosAnteriores: [...(p.modelosAnteriores || []), { em: new Date().toISOString(), modelo: p.modelo }].slice(-20) } : {}) };
  if (p) db.update("parametros", p.id, dados);
  else db.insert("parametros", { chave: "modeloProposta", ...dados });
  res.json({ modelo: modeloAtual(), personalizado: true });
});

// ---------- Propostas ----------
router.get("/", (req, res) => {
  res.json(db.readCollection(COL).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(comTotais));
});

router.get("/:id", (req, res) => {
  const p = db.findById(COL, req.params.id);
  if (!p) return res.status(404).json({ erro: "Proposta não encontrada." });
  res.json(comTotais(p));
});

function proximoNumero() {
  const ano = new Date().getFullYear();
  const lista = db.readCollection("parametros");
  let par = lista.find((x) => x.chave === "propostas");
  if (!par) par = db.insert("parametros", { chave: "propostas", ano, proximo: 1 });
  const n = par.ano === ano ? par.proximo || 1 : 1;
  db.update("parametros", par.id, { ano, proximo: n + 1 });
  return `${String(n).padStart(3, "0")}/${ano}`;
}

router.post("/", (req, res) => {
  const b = req.body || {};
  const empresa = b.empresaId ? db.findById("empresas", b.empresaId) : null;
  const prospect = b.prospectId ? db.findById("prospects", b.prospectId) : null;
  const base = {
    clienteNome: (empresa && empresa.nome) || (prospect && (prospect.empresa || prospect.nome)) || "",
    contatoNome: (empresa && empresa.contatoResponsavel) || (prospect && prospect.nome) || "",
    contatoEmail: (empresa && empresa.emailContato) || (prospect && prospect.email) || "",
    contatoWhatsapp: (empresa && empresa.whatsappContato) || (prospect && prospect.telefone) || "",
  };
  const campos = lerCamposProposta({ ...base, ...b });
  if (!campos.clienteNome) return res.status(400).json({ erro: "Informe o cliente da proposta." });
  // Vaga sugerida a partir do prospect (cargos/quantidade) — editável depois.
  if (!campos.vagas && prospect && prospect.cargos) campos.vagas = [{ cargo: prospect.cargos, salario: 0, quantidade: prospect.qtdVagas || 1 }];
  const modelo = modeloAtual();
  const proposta = db.insert(COL, {
    numero: proximoNumero(),
    status: "Rascunho",
    empresaId: empresa ? empresa.id : null,
    prospectId: prospect ? prospect.id : null,
    data: new Date().toISOString().slice(0, 10),
    vagas: [],
    ...modelo, // cópia própria dos textos e condições
    ...campos,
    criadaPor: req.consultor.nome,
    historico: [{ em: new Date().toISOString(), acao: "Proposta criada", por: req.consultor.nome }],
  });
  res.status(201).json(comTotais(proposta));
});

router.patch("/:id", (req, res) => {
  const p = db.findById(COL, req.params.id);
  if (!p) return res.status(404).json({ erro: "Proposta não encontrada." });
  const b = req.body || {};
  const dados = { ...lerCampos(b, p), ...lerCamposProposta(b) };
  // Versão anterior dos textos fica guardada quando eles mudam.
  if (dados.secoes && JSON.stringify(dados.secoes) !== JSON.stringify(p.secoes)) dados.secoesAnteriores = [...(p.secoesAnteriores || []), { em: new Date().toISOString(), secoes: p.secoes }].slice(-20);
  res.json(comTotais(db.update(COL, p.id, { ...dados, editadaPor: req.consultor.nome })));
});

router.post("/:id/status", (req, res) => {
  const p = db.findById(COL, req.params.id);
  if (!p) return res.status(404).json({ erro: "Proposta não encontrada." });
  const status = (req.body || {}).status;
  if (!STATUS.includes(status)) return res.status(400).json({ erro: "Status inválido." });
  const agora = new Date().toISOString();
  const calc = calcularVagas(p);
  const extra = status === "Enviada" ? { enviadaEm: agora } : status === "Aceita" ? { aceitaEm: agora } : status === "Recusada" ? { recusadaEm: agora } : {};
  const atualizado = db.update(COL, p.id, { status, ...extra, historico: [...(p.historico || []), { em: agora, acao: `Status: ${status}`, por: req.consultor.nome }] });

  // CRM: proposta enviada move o prospect para "Proposta Enviada" e registra o valor.
  const prospect = p.prospectId ? db.findById("prospects", p.prospectId) : null;
  if (prospect) {
    const ordem = ["Novo", "Em Contato", "Proposta Enviada", "Negociação", "Fechado", "Perdido"];
    const dadosP = {
      interacoes: [...(prospect.interacoes || []), { id: db.newId(), em: agora, por: req.consultor.nome, canal: "Proposta", texto: `Proposta nº ${p.numero} — ${status}${calc.total ? ` (${calc.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})` : ""}` }],
    };
    if (status === "Enviada") {
      if (calc.total) dadosP.valorProposta = calc.total;
      if (ordem.indexOf(prospect.etapa) < 2) {
        dadosP.etapa = "Proposta Enviada";
        dadosP.historicoEtapas = [...(prospect.historicoEtapas || []), { de: prospect.etapa, para: "Proposta Enviada", em: agora, por: req.consultor.nome }];
      }
    }
    db.update("prospects", prospect.id, dadosP);
  }
  res.json(comTotais(atualizado));
});

const nomeArquivo = (p, ext) => `Proposta ${p.numero.replace("/", "-")} - ${String(p.clienteNome || "cliente").replace(/[^\w\- À-ú]+/g, "").slice(0, 60)}.${ext}`;

router.get("/:id/pdf", async (req, res) => {
  const p = db.findById(COL, req.params.id);
  if (!p) return res.status(404).send("Proposta não encontrada.");
  try {
    const buf = await gerarPdfProposta(p);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `${req.query.baixar ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(nomeArquivo(p, "pdf"))}`);
    res.send(buf);
  } catch (err) {
    console.error("[proposta] PDF:", err);
    res.status(500).send("Não foi possível gerar o PDF.");
  }
});

router.get("/:id/docx", async (req, res) => {
  const p = db.findById(COL, req.params.id);
  if (!p) return res.status(404).send("Proposta não encontrada.");
  try {
    const buf = await gerarDocxProposta(p);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(nomeArquivo(p, "docx"))}`);
    res.send(buf);
  } catch (err) {
    console.error("[proposta] Word:", err);
    res.status(500).send("Não foi possível gerar o Word.");
  }
});

module.exports = router;
