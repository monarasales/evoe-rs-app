// Ponto — telas do GESTOR: Registros, Escalas e Feriados (Etapa 1).
// Todas as contas passam por utils/ponto/apuracao.js (mesmo motor do Meu Ponto).

const express = require("express");
const db = require("../db");
const { requireGestor } = require("../middleware/auth");
const { dataLocal, horaMinLocal, diaSemana, minParaHhmm } = require("../utils/ponto/tempo");
const { resumirDias, statusPresenca, periodoDoMes } = require("../utils/ponto/motor");
const { apurarMes, carregarContexto } = require("../utils/ponto/apuracao");
const { jornadaDo } = require("../utils/ponto/jornada");
const { COL_OCORRENCIAS, CATALOGO, TIPOS, listarOcorrencias, validarOcorrencia } = require("../utils/ponto/ocorrencias");
const {
  COL_JORNADAS,
  COL_FERIADOS,
  garantirJornadaPadrao,
  listarJornadas,
  cargaSemanal,
  validarJornada,
  listarFeriados,
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

  const ctx = carregarContexto(hoje);
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

// Colaboradores considerados nas telas de apuração: ativos, ou inativos com marcações.
function colaboradoresApurados(ctx, colaboradorId) {
  return db
    .readCollection("colaboradores")
    .filter((c) => !colaboradorId || c.id === colaboradorId)
    .filter((c) => c.ativo !== false || ctx.marcacoes.some((mk) => mk.colaboradorId === c.id))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

const resumoColab = (c) => ({ id: c.id, nome: c.nome, vinculado: !!c.consultorId, ativo: c.ativo !== false });

// ---------- Hoje: presença em tempo real ----------
router.get("/hoje", (req, res) => {
  const agora = new Date();
  const hoje = dataLocal(agora);
  const agoraMin = horaMinLocal(agora);
  const ctx = carregarContexto(hoje);
  const feriado = ctx.feriados.get(hoje) || null;
  const lista = db
    .readCollection("colaboradores")
    .filter((c) => c.ativo !== false && !(c.dataInicioPonto && c.dataInicioPonto > hoje))
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .map((c) => {
      const jornada = jornadaDo(c.id, ctx.jornadas);
      const escalaDia = jornada.dias[diaSemana(hoje)];
      const marcacoes = ctx.marcacoes.filter((mk) => mk.colaboradorId === c.id && mk.data === hoje).sort((a, b) => a.horaMin - b.horaMin);
      const ocorrencia = ctx.mapaOcorrencias.get(`${c.id}|${hoje}`) || null;
      return {
        colaborador: resumoColab(c),
        status: statusPresenca({ escalaDia, marcacoes: marcacoes.map((mk) => mk.horaMin), ocorrencia, feriado, agoraMin, config: jornada }),
        escalaDia: escalaDia || null,
        horarios: marcacoes.map((mk) => ({ hora: minParaHhmm(mk.horaMin), dentroZona: mk.dentroZona, ajuste: !!mk.ajuste })),
        ocorrencia: ocorrencia ? ocorrencia.nome : null,
      };
    });
  const conta = (st) => lista.filter((x) => x.status === st).length;
  // Presentes = presente + atrasado + externo. Afastados e sem expediente saem do denominador.
  const presentes = conta("presente") + conta("atrasado") + conta("externo");
  const esperados = lista.length - conta("afastado") - conta("sem_expediente");
  res.json({
    hoje,
    agora: minParaHhmm(agoraMin),
    feriado: feriado ? feriado.nome : null,
    totais: {
      presentes,
      esperados,
      percentual: esperados ? Math.round((presentes / esperados) * 100) : null,
      atrasados: conta("atrasado"),
      aguardando: conta("aguardando"),
      ausentes: conta("ausente"),
      afastados: conta("afastado"),
      externos: conta("externo"),
    },
    colaboradores: lista,
  });
});

// ---------- Folha: totais do mês por colaborador ----------
router.get("/folha", (req, res) => {
  const { ano, mes, hoje } = lerMes(req.query);
  const ctx = carregarContexto(hoje);
  let periodo = null;
  const linhas = colaboradoresApurados(ctx).map((c) => {
    const ap = apurarMes(c, ano, mes, ctx);
    periodo = ap.periodo;
    return { colaborador: resumoColab(c), resumo: ap.resumo };
  });
  res.json({ periodo: periodo || periodoDoMes(ano, mes, hoje), linhas });
});

// Ficha individual: todos os dias do mês de um colaborador.
router.get("/ficha/:colaboradorId", (req, res) => {
  const { ano, mes, hoje } = lerMes(req.query);
  const colaborador = db.findById("colaboradores", req.params.colaboradorId);
  if (!colaborador) return res.status(404).json({ erro: "Colaborador não encontrado." });
  const ap = apurarMes(colaborador, ano, mes, carregarContexto(hoje));
  res.json({ colaborador: resumoColab(colaborador), periodo: ap.periodo, resumo: ap.resumo, dias: ap.dias });
});

// ---------- Frequência ----------
router.get("/frequencia", (req, res) => {
  const { ano, mes, hoje } = lerMes(req.query);
  const ctx = carregarContexto(hoje);
  let periodo = null;
  const linhas = colaboradoresApurados(ctx).map((c) => {
    const ap = apurarMes(c, ano, mes, ctx);
    periodo = ap.periodo;
    const fechados = ap.dias.filter((d) => d.data <= ap.periodo.fimFechado);
    const comEscala = fechados.filter((d) => !["sem_escala", "feriado", "futuro"].includes(d.status));
    const creditados = comEscala.filter((d) => d.abonado && d.cargaCumprida > 0 && !d.horarios.length).length; // home office etc.
    const afastados = comEscala.filter((d) => d.abonado && !d.horarios.length && d.cargaCumprida === 0).length;
    const comMarcacao = comEscala.filter((d) => d.horarios.length > 0).length;
    const faltas = comEscala.filter((d) => d.status === "falta").length;
    const presentes = comMarcacao + creditados;
    const denominador = presentes + faltas;
    const pontuais = comEscala.filter((d) => d.horarios.length > 0 && d.atrasoMin === 0).length;
    return {
      colaborador: resumoColab(c),
      diasEsperados: denominador,
      presentes,
      faltas,
      afastados,
      atrasos: ap.resumo.atrasos,
      pendentes: ap.resumo.pendentes,
      presenca: denominador ? Math.round((presentes / denominador) * 100) : null,
      pontualidade: comMarcacao ? Math.round((pontuais / comMarcacao) * 100) : null,
    };
  });
  res.json({ periodo: periodo || periodoDoMes(ano, mes, hoje), linhas });
});

// ---------- Inconsistências ----------
// Dia sem nenhuma marcação -> precisa de JUSTIFICATIVA (ocorrência);
// marcação faltando -> precisa de AJUSTE. Dias resolvidos por ocorrência NÃO somem:
// mudam de estado (o espelho continua mostrando que não houve marcação).
router.get("/inconsistencias", (req, res) => {
  const { ano, mes, hoje } = lerMes(req.query);
  const ctx = carregarContexto(hoje);
  const itens = [];
  for (const c of colaboradoresApurados(ctx, req.query.colaboradorId)) {
    const ap = apurarMes(c, ano, mes, ctx);
    for (const d of ap.dias.filter((x) => x.data <= ap.periodo.fimFechado)) {
      const oc = ctx.mapaOcorrencias.get(`${c.id}|${d.data}`);
      const semMarcacao = d.horarios.length === 0;
      let tipo = null;
      let situacao = null;
      if (d.status === "falta") {
        // Com ocorrência lançada (ex.: falta injustificada) o caso foi tratado, mesmo mantendo a falta.
        tipo = "sem_marcacao";
        situacao = oc ? "tratada" : "pendente";
      } else if (d.status === "incompleto") {
        tipo = "marcacao_faltando";
        situacao = "pendente";
      } else if (d.status === "abonado") {
        // Abonado só acontece em dia sem marcação ou incompleto: fica na lista, resolvido.
        tipo = semMarcacao ? "sem_marcacao" : "marcacao_faltando";
        situacao = "resolvida";
      }
      if (!tipo) continue;
      itens.push({
        colaborador: resumoColab(c),
        data: d.data,
        diaSemana: d.diaSemana,
        tipo,
        situacao,
        ocorrencia: oc ? oc.nome : null,
        horarios: d.horarios.map(minParaHhmm),
      });
    }
  }
  const ordem = { pendente: 0, tratada: 1, resolvida: 2 };
  itens.sort((a, b) => ordem[a.situacao] - ordem[b.situacao] || b.data.localeCompare(a.data));
  res.json({
    periodo: periodoDoMes(ano, mes, hoje),
    pendentes: itens.filter((i) => i.situacao === "pendente").length,
    itens,
  });
});

// ---------- Ocorrências ----------
router.get("/ocorrencias/tipos", (req, res) => res.json(CATALOGO));

router.get("/ocorrencias", (req, res) => {
  const { ano, mes } = lerMes(req.query);
  const ini = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fim = `${ano}-${String(mes).padStart(2, "0")}-31`;
  const colaboradores = db.readCollection("colaboradores");
  const lista = listarOcorrencias()
    .filter((oc) => oc.dataInicio <= fim && oc.dataFim >= ini)
    .filter((oc) => !req.query.colaboradorId || oc.colaboradorId === req.query.colaboradorId)
    .map((oc) => ({
      ...oc,
      tipoNome: (TIPOS.get(oc.tipo) || {}).nome || oc.tipo,
      colaboradorNome: (colaboradores.find((c) => c.id === oc.colaboradorId) || {}).nome || "(colaborador removido)",
    }))
    .sort((a, b) => b.dataInicio.localeCompare(a.dataInicio));
  res.json(lista);
});

router.post("/ocorrencias", (req, res) => {
  const { dados, avisos, erro } = validarOcorrencia(req.body || {}, dataLocal());
  if (erro) return res.status(400).json({ erro });
  const salvo = db.insert(COL_OCORRENCIAS, { ...dados, lancadoPor: req.consultor.id });
  res.status(201).json({ ...salvo, avisos });
});

router.delete("/ocorrencias/:id", (req, res) => {
  if (!db.remove(COL_OCORRENCIAS, req.params.id)) return res.status(404).json({ erro: "Ocorrência não encontrada." });
  res.json({ sucesso: true });
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
