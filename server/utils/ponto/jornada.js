// Escalas de trabalho (configuração de jornada) e feriados.
// Uma escala sem colaborador é a PADRÃO da empresa; escalas com colaborador são
// exceções individuais (ex.: estagiário com horário diferente). A busca é sempre
// "exceção do colaborador, senão a padrão" — e a padrão sempre existe.

const db = require("../../db");
const { DIAS, hhmmParaMin } = require("./tempo");
const { normalizarEscala } = require("./motor");

const COL_JORNADAS = "pontoJornadas";
const COL_FERIADOS = "pontoFeriados";

// Escala padrão da Evoé: seg–sex 09h–16h com 1h de almoço = 6h/dia, 30h/semana.
const DIA_PADRAO = { entrada: "09:00", saidaAlmoco: "12:00", voltaAlmoco: "13:00", saida: "16:00" };
const PADRAO_INICIAL = {
  colaboradorId: null,
  dias: { seg: DIA_PADRAO, ter: DIA_PADRAO, qua: DIA_PADRAO, qui: DIA_PADRAO, sex: DIA_PADRAO, sab: null, dom: null },
  toleranciaMin: 10,
  almocoMin: 55,
  almocoMax: 70,
};

function garantirJornadaPadrao() {
  const padrao = db.readCollection(COL_JORNADAS).find((j) => !j.colaboradorId);
  return padrao || db.insert(COL_JORNADAS, PADRAO_INICIAL);
}

function listarJornadas() {
  garantirJornadaPadrao();
  return db.readCollection(COL_JORNADAS);
}

/** Escala aplicável ao colaborador (exceção individual ou padrão). */
function jornadaDo(colaboradorId, jornadas = listarJornadas()) {
  return jornadas.find((j) => j.colaboradorId && j.colaboradorId === colaboradorId) || jornadas.find((j) => !j.colaboradorId);
}

/** Carga semanal em minutos (para exibição). */
function cargaSemanal(jornada) {
  return DIAS.reduce((total, d) => {
    const e = normalizarEscala(jornada.dias && jornada.dias[d]);
    return total + (e ? e.cargaEsperada : 0);
  }, 0);
}

/** Valida e normaliza a escala enviada pela tela. Retorna { dados } ou { erro }. */
function validarJornada(body) {
  const dias = {};
  for (const d of DIAS) {
    const dia = body.dias && body.dias[d];
    if (!dia || !dia.entrada) {
      dias[d] = null;
      continue;
    }
    const campos = {
      entrada: String(dia.entrada || ""),
      saidaAlmoco: String(dia.saidaAlmoco || ""),
      voltaAlmoco: String(dia.voltaAlmoco || ""),
      saida: String(dia.saida || ""),
    };
    const e = normalizarEscala(campos);
    if (!e) return { erro: `Horários inválidos em ${d}: a saída deve ser depois da entrada.` };
    const informouAlmoco = campos.saidaAlmoco || campos.voltaAlmoco;
    if (informouAlmoco && !e.temAlmoco) {
      return { erro: `Almoço inválido em ${d}: precisa ficar entre a entrada e a saída (ou deixe os dois campos vazios).` };
    }
    if (!e.temAlmoco) campos.saidaAlmoco = campos.voltaAlmoco = "";
    dias[d] = campos;
  }
  const num = (v, padrao, min, max) => {
    const n = v === undefined || v === "" ? padrao : Number(v);
    return Number.isInteger(n) && n >= min && n <= max ? n : NaN;
  };
  const toleranciaMin = num(body.toleranciaMin, 10, 0, 60);
  const almocoMin = num(body.almocoMin, 55, 0, 240);
  const almocoMax = num(body.almocoMax, 70, 0, 300);
  if ([toleranciaMin, almocoMin, almocoMax].some(Number.isNaN)) {
    return { erro: "Tolerância e limites de almoço devem ser números inteiros de minutos." };
  }
  if (almocoMax < almocoMin) return { erro: "O almoço máximo deve ser maior que o mínimo." };
  return { dados: { dias, toleranciaMin, almocoMin, almocoMax } };
}

// ---------- Feriados ----------
function listarFeriados() {
  return db.readCollection(COL_FERIADOS);
}

/** Mapa data -> feriado, para consulta rápida. */
function mapaFeriados(feriados = listarFeriados()) {
  return new Map(feriados.map((f) => [f.data, f]));
}

module.exports = {
  COL_JORNADAS,
  COL_FERIADOS,
  garantirJornadaPadrao,
  listarJornadas,
  jornadaDo,
  cargaSemanal,
  validarJornada,
  listarFeriados,
  mapaFeriados,
  hhmmParaMin,
};
