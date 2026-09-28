// Motor de cálculo do ponto — funções PURAS (entra dado, sai resultado, sem ler
// nem gravar nada). Todas as telas e o fechamento usam estas mesmas funções, para
// nunca haver dois cálculos que possam divergir. Testes: test/pontoMotor.test.js.
//
// Regras (documentação "Controle de Ponto Próprio"):
//  - carga cumprida soma só os intervalos PAR->ÍMPAR (entrada->pausa, volta->saída);
//  - dia com marcações faltando / abaixo de 60% da carga = JORNADA INCOMPLETA
//    (pendência, não infração): não avalia saída antecipada nem almoço;
//  - atraso: tolerância decide SE conta; o valor é a diferença cheia;
//  - almoço: a pausa que COMEÇA entre 11h e 14h; senão a mais longa;
//  - o dia de hoje nunca entra em total (fica "em andamento");
//  - dia pendente (incompleto, sem confirmação/ocorrência) fica FORA dos totais.

const { hhmmParaMin } = require("./tempo");

const JANELA_ALMOCO = { inicio: 11 * 60, fim: 14 * 60 };
const PERCENTUAL_MINIMO = 0.6;

/** Escala de um dia ({ entrada, saidaAlmoco, voltaAlmoco, saida } em "HH:MM") -> minutos. */
function normalizarEscala(escalaDia) {
  if (!escalaDia) return null;
  const entrada = hhmmParaMin(escalaDia.entrada);
  const saida = hhmmParaMin(escalaDia.saida);
  if (entrada == null || saida == null || saida <= entrada) return null;
  let saidaAlmoco = hhmmParaMin(escalaDia.saidaAlmoco);
  let voltaAlmoco = hhmmParaMin(escalaDia.voltaAlmoco);
  const temAlmoco =
    saidaAlmoco != null && voltaAlmoco != null && saidaAlmoco > entrada && voltaAlmoco > saidaAlmoco && voltaAlmoco < saida;
  if (!temAlmoco) saidaAlmoco = voltaAlmoco = null;
  const cargaEsperada = saida - entrada - (temAlmoco ? voltaAlmoco - saidaAlmoco : 0);
  return { entrada, saidaAlmoco, voltaAlmoco, saida, temAlmoco, cargaEsperada };
}

/**
 * Avalia um dia.
 * @param {object} p
 * @param {string} p.data          AAAA-MM-DD
 * @param {number[]} p.marcacoes   horários em minutos (qualquer ordem)
 * @param {object|null} p.escalaDia escala do dia em "HH:MM" (null = sem expediente)
 * @param {object} p.config         { toleranciaMin, almocoMin, almocoMax }
 * @param {string} p.hoje           AAAA-MM-DD (data local de hoje)
 * @param {object|null} p.feriado   { nome } quando o dia é feriado
 * @param {boolean} p.confirmado    colaborador confirmou "saí mais cedo mesmo"
 */
function calcularDia({ data, marcacoes = [], escalaDia, config = {}, hoje, feriado = null, confirmado = false }) {
  const tolerancia = config.toleranciaMin ?? 10;
  const almocoMin = config.almocoMin ?? 55;
  const almocoMax = config.almocoMax ?? 70;
  const horarios = [...marcacoes].sort((a, b) => a - b);
  const escala = normalizarEscala(escalaDia);

  const base = {
    data,
    horarios,
    cargaEsperada: 0,
    cargaCumprida: somarTrabalhado(horarios),
    saldo: 0,
    atrasoMin: 0,
    saidaAntecipadaMin: 0,
    almoco: null, // { inicio, fim, duracao, classificacao: "curto" | "adequado" | "longo" }
    falta: false,
    incompleta: false,
    confirmado: false,
    foraDaEscala: false,
    feriado: feriado ? feriado.nome : null,
    status: "normal", // normal | incompleto | falta | em_andamento | futuro | feriado | sem_escala
    contaNoTotal: false,
  };

  if (data > hoje) return { ...base, status: "futuro" };

  // Passo 1 — há escala nesse dia? (feriado conta como "sem escala")
  if (!escala || feriado) {
    return {
      ...base,
      status: feriado ? "feriado" : "sem_escala",
      foraDaEscala: horarios.length > 0,
    };
  }

  base.cargaEsperada = escala.cargaEsperada;

  // Dia corrente: calculado à parte, nunca entra em indicador de fechamento.
  if (data === hoje) {
    const atrasoMin = calcularAtraso(horarios, escala, tolerancia);
    return { ...base, atrasoMin, status: "em_andamento" };
  }

  // Passo 2 — nenhuma marcação: falta (fato consumado, conta no total).
  if (horarios.length === 0) {
    return { ...base, falta: true, saldo: -escala.cargaEsperada, status: "falta", contaNoTotal: true };
  }

  // Passo 4 — jornada incompleta?
  const marcacoesEsperadas = escala.temAlmoco ? 4 : 2;
  const incompleta =
    horarios.length % 2 === 1 ||
    horarios.length < marcacoesEsperadas ||
    base.cargaCumprida < PERCENTUAL_MINIMO * escala.cargaEsperada;

  // Passo 5 — atraso (avaliado mesmo em dia incompleto).
  const atrasoMin = calcularAtraso(horarios, escala, tolerancia);

  if (incompleta) {
    // Pendência: só entra no total se o colaborador confirmou que saiu mais cedo.
    const saldo = base.cargaCumprida - escala.cargaEsperada;
    return {
      ...base,
      atrasoMin,
      incompleta: true,
      confirmado: !!confirmado,
      saldo: confirmado ? saldo : 0,
      status: confirmado ? "normal" : "incompleto",
      contaNoTotal: !!confirmado,
    };
  }

  // Passo 6 — saída antecipada (só em dia completo).
  const ultima = horarios[horarios.length - 1];
  const saidaAntecipadaMin = ultima < escala.saida ? escala.saida - ultima : 0;

  // Passo 7 — almoço (só em dia completo e se a escala prevê almoço).
  const almoco = escala.temAlmoco ? avaliarAlmoco(horarios, almocoMin, almocoMax) : null;

  return {
    ...base,
    atrasoMin,
    saidaAntecipadaMin,
    almoco,
    saldo: base.cargaCumprida - escala.cargaEsperada,
    status: "normal",
    contaNoTotal: true,
  };
}

/** Soma apenas os intervalos de índice PAR -> ÍMPAR (trabalho); ímpar -> par são pausas. */
function somarTrabalhado(horarios) {
  let total = 0;
  for (let i = 0; i + 1 < horarios.length; i += 2) total += horarios[i + 1] - horarios[i];
  return total;
}

function calcularAtraso(horarios, escala, tolerancia) {
  if (!horarios.length) return 0;
  const primeira = horarios[0];
  return primeira > escala.entrada + tolerancia ? primeira - escala.entrada : 0;
}

function avaliarAlmoco(horarios, almocoMin, almocoMax) {
  const pausas = [];
  for (let i = 1; i + 1 < horarios.length; i += 2) {
    pausas.push({ inicio: horarios[i], fim: horarios[i + 1], duracao: horarios[i + 1] - horarios[i] });
  }
  if (!pausas.length) return null;
  const naJanela = pausas.find((p) => p.inicio >= JANELA_ALMOCO.inicio && p.inicio <= JANELA_ALMOCO.fim);
  const escolhida = naJanela || pausas.reduce((a, b) => (b.duracao > a.duracao ? b : a));
  const classificacao =
    escolhida.duracao < almocoMin ? "curto" : escolhida.duracao > almocoMax ? "longo" : "adequado";
  return { ...escolhida, classificacao };
}

/**
 * Totais de um conjunto de dias já calculados. ÚNICA função que soma saldo —
 * aplica o filtro de dias pendentes (contaNoTotal) para todas as telas.
 */
function resumirDias(dias) {
  const r = {
    cargaEsperada: 0,
    cargaCumprida: 0,
    saldo: 0,
    faltas: 0,
    atrasos: 0,
    atrasoMin: 0,
    saidasAntecipadas: 0,
    saidaAntecipadaMin: 0,
    pendentes: 0,
    diasApurados: 0,
  };
  for (const d of dias) {
    if (d.status === "incompleto") r.pendentes++;
    if (!d.contaNoTotal) continue;
    r.diasApurados++;
    r.cargaEsperada += d.cargaEsperada;
    r.cargaCumprida += d.cargaCumprida;
    r.saldo += d.saldo;
    if (d.falta) r.faltas++;
    if (d.atrasoMin > 0) {
      r.atrasos++;
      r.atrasoMin += d.atrasoMin;
    }
    if (d.saidaAntecipadaMin > 0) {
      r.saidasAntecipadas++;
      r.saidaAntecipadaMin += d.saidaAntecipadaMin;
    }
  }
  return r;
}

/** Período de apuração = mês civil. "fimFechado" nunca inclui hoje (é no máximo ontem). */
function periodoDoMes(ano, mes, hoje) {
  const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const fim = `${ano}-${String(mes).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;
  const ontem = somarDiasSimples(hoje, -1);
  const fimFechado = fim < hoje ? fim : ontem;
  return { inicio, fim, fimFechado, aberto: fim >= hoje };
}

function somarDiasSimples(data, n) {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

module.exports = { calcularDia, resumirDias, periodoDoMes, normalizarEscala, somarTrabalhado };
