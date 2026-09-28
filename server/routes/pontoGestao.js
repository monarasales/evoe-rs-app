// Ponto — telas do GESTOR: Registros, Escalas e Feriados (Etapa 1).
// Todas as contas passam por utils/ponto/apuracao.js (mesmo motor do Meu Ponto).

const express = require("express");
const db = require("../db");
const { requireGestor } = require("../middleware/auth");
const { dataLocal } = require("../utils/ponto/tempo");
const { resumirDias } = require("../utils/ponto/motor");
const { apurarMes, COL_MARCACOES } = require("../utils/ponto/apuracao");
const {
  COL_JORNADAS,
  COL_FERIADOS,
  garantirJornadaPadrao,
  listarJornadas,
  cargaSemanal,
  validarJornada,
  listarFeriados,
  mapaFeriados,
} = require("../utils/ponto/jornada");

const router = express.Router();
router.use(requireGestor);

function lerMes(query) {
  const hoje = dataLocal();
  const ano = Number(query.ano) || Number(hoje.slice(0, 4));
  const mes = Number(query.mes) || Number(hoje.slice(5, 7));
  return { ano, mes, hoje };
}

// ---------- Registros: marcações por colaborador e dia, com saldo ----------
router.get("/registros", (req, res) => {
  const { ano, mes, hoje } = lerMes(req.query);
  if (mes < 1 || mes > 12) return res.status(400).json({ erro: "Mês inválido." });

  const ctx = {
    hoje,
    jornadas: listarJornadas(),
    feriados: mapaFeriados(),
    marcacoes: db.readCollection(COL_MARCACOES),
  };
  const colaboradores = db
    .readCollection("colaboradores")
    .filter((c) => !req.query.colaboradorId || c.id === req.query.colaboradorId)
    .filter((c) => c.ativo !== false || ctx.marcacoes.some((mk) => mk.colaboradorId === c.id))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  let periodo = null;
  const resultado = colaboradores.map((c) => {
    const apurado = apurarMes(c, ano, mes, ctx);
    periodo = apurado.periodo;
    // Linhas = dias com marcação (+ hoje). O total soma SÓ as linhas visíveis,
    // para nunca contradizer o que está na tela; faltas vêm à parte.
    const linhas = apurado.dias.filter((d) => d.horarios.length > 0 || d.status === "em_andamento").reverse();
    const faltas = apurado.dias.filter((d) => d.status === "falta").map((d) => d.data);
    return {
      colaborador: { id: c.id, nome: c.nome, vinculado: !!c.consultorId, ativo: c.ativo !== false },
      linhas,
      totalLinhas: resumirDias(linhas),
      faltas,
      pendentes: apurado.resumo.pendentes,
    };
  });

  res.json({ periodo, colaboradores: resultado });
});

// ---------- Escalas ----------
router.get("/jornadas", (req, res) => {
  const colaboradores = db.readCollection("colaboradores");
  const jornadas = listarJornadas().map((j) => ({
    ...j,
    cargaSemanalMin: cargaSemanal(j),
    colaboradorNome: j.colaboradorId ? (colaboradores.find((c) => c.id === j.colaboradorId) || {}).nome || "(colaborador removido)" : null,
  }));
  res.json(jornadas.sort((a, b) => (a.colaboradorId ? 1 : 0) - (b.colaboradorId ? 1 : 0)));
});

router.put("/jornadas/padrao", (req, res) => {
  const { dados, erro } = validarJornada(req.body || {});
  if (erro) return res.status(400).json({ erro });
  const padrao = garantirJornadaPadrao();
  res.json(db.update(COL_JORNADAS, padrao.id, dados));
});

// Cria ou substitui a escala individual de um colaborador.
router.put("/jornadas/colaborador/:colaboradorId", (req, res) => {
  const colaborador = db.findById("colaboradores", req.params.colaboradorId);
  if (!colaborador) return res.status(404).json({ erro: "Colaborador não encontrado." });
  const { dados, erro } = validarJornada(req.body || {});
  if (erro) return res.status(400).json({ erro });
  const existente = db.readCollection(COL_JORNADAS).find((j) => j.colaboradorId === colaborador.id);
  const salvo = existente
    ? db.update(COL_JORNADAS, existente.id, dados)
    : db.insert(COL_JORNADAS, { colaboradorId: colaborador.id, ...dados });
  res.json(salvo);
});

// Remove a escala individual (o colaborador volta a seguir a padrão).
router.delete("/jornadas/:id", (req, res) => {
  const jornada = db.findById(COL_JORNADAS, req.params.id);
  if (!jornada) return res.status(404).json({ erro: "Escala não encontrada." });
  if (!jornada.colaboradorId) return res.status(400).json({ erro: "A escala padrão não pode ser excluída." });
  db.remove(COL_JORNADAS, jornada.id);
  res.json({ sucesso: true });
});

// ---------- Feriados ----------
const TIPOS_FERIADO = ["nacional", "estadual", "municipal", "ponto facultativo"];

router.get("/feriados", (req, res) => {
  const ano = String(Number(req.query.ano) || dataLocal().slice(0, 4));
  res.json(listarFeriados().filter((f) => f.data.startsWith(ano)).sort((a, b) => a.data.localeCompare(b.data)));
});

router.post("/feriados", (req, res) => {
  const { data, nome, tipo } = req.body || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data || "")) return res.status(400).json({ erro: "Informe a data do feriado." });
  if (!String(nome || "").trim()) return res.status(400).json({ erro: "Informe o nome do feriado." });
  const existente = listarFeriados().find((f) => f.data === data);
  if (existente) return res.status(400).json({ erro: `Já existe um feriado nessa data: ${existente.nome}.` });
  res.status(201).json(
    db.insert(COL_FERIADOS, { data, nome: String(nome).trim(), tipo: TIPOS_FERIADO.includes(tipo) ? tipo : "municipal" })
  );
});

router.delete("/feriados/:id", (req, res) => {
  if (!db.remove(COL_FERIADOS, req.params.id)) return res.status(404).json({ erro: "Feriado não encontrado." });
  res.json({ sucesso: true });
});

// Importa os feriados nacionais do ano (BrasilAPI). Não duplica datas já cadastradas.
router.post("/feriados/importar", async (req, res) => {
  const ano = Number((req.body || {}).ano);
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) return res.status(400).json({ erro: "Ano inválido." });
  let lista;
  try {
    const r = await fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    lista = await r.json();
  } catch (err) {
    return res.status(502).json({ erro: "Não foi possível buscar os feriados nacionais agora. Tente de novo ou cadastre manualmente." });
  }
  const existentes = new Set(listarFeriados().map((f) => f.data));
  const novos = lista.filter((f) => f.date && !existentes.has(f.date));
  novos.forEach((f) => db.insert(COL_FERIADOS, { data: f.date, nome: f.name, tipo: "nacional" }));
  res.json({ importados: novos.length });
});

module.exports = router;
