// Apuração: junta marcações + escala + feriados e passa pelo motor.
// É o ÚNICO caminho usado pelas telas (Meu Ponto, Registros e, nas próximas
// etapas, Folha, Frequência, Inconsistências e Fechamento) — assim nenhuma tela
// calcula diferente da outra.

const db = require("../../db");
const { calcularDia, resumirDias, periodoDoMes } = require("./motor");
const { dataLocal, diaSemana, datasEntre } = require("./tempo");
const { listarJornadas, jornadaDo, mapaFeriados } = require("./jornada");
const { mapaOcorrencias, ajustesDeSaldo, listarOcorrencias } = require("./ocorrencias");

const COL_MARCACOES = "pontoMarcacoes";

/**
 * Primeiro dia em que o ponto é cobrado do colaborador: o campo "início do controle
 * de ponto"; sem ele, o dia da primeira marcação; sem marcação, hoje. Nenhum dia
 * anterior vira falta (senão quem começou no meio do mês teria faltas no começo).
 */
function inicioDoPonto(colaborador, marcacoesDoColab, hoje) {
  if (colaborador.dataInicioPonto) return colaborador.dataInicioPonto;
  const primeira = marcacoesDoColab.reduce((min, mk) => (!min || mk.data < min ? mk.data : min), null);
  return primeira || hoje;
}

/**
 * Dias calculados de um colaborador entre duas datas.
 * Cada dia traz também `marcacoesDetalhe` (origem de cada batida: organica / ajuste).
 */
function apurarColaborador(colaborador, inicio, fim, ctx = {}) {
  const hoje = ctx.hoje || dataLocal();
  const todasDoColab = (ctx.marcacoes || db.readCollection(COL_MARCACOES)).filter((mk) => mk.colaboradorId === colaborador.id);
  const inicioPonto = inicioDoPonto(colaborador, todasDoColab, hoje);
  if (inicio < inicioPonto) inicio = inicioPonto;
  if (inicio > fim) return [];
  const jornada = jornadaDo(colaborador.id, ctx.jornadas || listarJornadas());
  const feriados = ctx.feriados || mapaFeriados();
  const ocorrencias = ctx.mapaOcorrencias || mapaOcorrencias();
  const porData = new Map();
  for (const mk of todasDoColab.filter((x) => x.data >= inicio && x.data <= fim)) {
    if (!porData.has(mk.data)) porData.set(mk.data, []);
    porData.get(mk.data).push(mk);
  }

  return datasEntre(inicio, fim).map((data) => {
    const doDia = (porData.get(data) || []).sort((a, b) => a.horaMin - b.horaMin);
    const resultado = calcularDia({
      data,
      marcacoes: doDia.map((mk) => mk.horaMin),
      escalaDia: jornada.dias[diaSemana(data)],
      config: jornada,
      hoje,
      feriado: feriados.get(data) || null,
      ocorrencia: ocorrencias.get(`${colaborador.id}|${data}`) || null,
    });
    return {
      ...resultado,
      diaSemana: diaSemana(data),
      marcacoesDetalhe: doDia.map((mk) => ({
        id: mk.id,
        horaMin: mk.horaMin,
        origem: mk.origem,
        ajuste: !!mk.ajuste,
        dentroZona: mk.dentroZona,
        distanciaMetros: mk.distanciaMetros,
      })),
    };
  });
}

/** Período (mês civil) de um colaborador: dias + resumo (resumo só até o fim fechado). */
function apurarMes(colaborador, ano, mes, ctx = {}) {
  const hoje = ctx.hoje || dataLocal();
  const periodo = periodoDoMes(ano, mes, hoje);
  const ateHoje = periodo.fim < hoje ? periodo.fim : hoje;
  const dias = periodo.inicio <= ateHoje ? apurarColaborador(colaborador, periodo.inicio, ateHoje, { ...ctx, hoje }) : [];
  const ajustes = ajustesDeSaldo(colaborador.id, periodo.inicio, periodo.fimFechado, ctx.ocorrencias);
  const resumo = resumirDias(
    dias.filter((d) => d.data <= periodo.fimFechado),
    ajustes
  );
  return { periodo, dias, resumo };
}

/** Contexto carregado UMA vez para apurar vários colaboradores (telas do Gestor). */
function carregarContexto(hoje = dataLocal()) {
  const ocorrencias = listarOcorrencias();
  return {
    hoje,
    jornadas: listarJornadas(),
    feriados: mapaFeriados(),
    marcacoes: db.readCollection(COL_MARCACOES),
    ocorrencias,
    mapaOcorrencias: mapaOcorrencias(ocorrencias),
  };
}

module.exports = { COL_MARCACOES, apurarColaborador, apurarMes, inicioDoPonto, carregarContexto };
