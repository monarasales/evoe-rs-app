// Datas e horas do ponto — SEMPRE no horário de Fortaleza.
// O servidor roda em UTC; por isso nenhuma data/hora do ponto sai de new Date()
// "cru". A hora exibida sai sempre de (data, horaMin), nunca do timestamp.
// Fortaleza não tem horário de verão, então o deslocamento é fixo em -03:00.

const FUSO = "America/Fortaleza";
const OFFSET = "-03:00";

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
const DIAS_NOME = {
  dom: "Domingo",
  seg: "Segunda",
  ter: "Terça",
  qua: "Quarta",
  qui: "Quinta",
  sex: "Sexta",
  sab: "Sábado",
};

function partesLocais(date = new Date()) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return p; // { year, month, day, hour, minute, second }
}

/** AAAA-MM-DD no fuso local. */
function dataLocal(date = new Date()) {
  const p = partesLocais(date);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Minutos desde a meia-noite no fuso local. */
function horaMinLocal(date = new Date()) {
  const p = partesLocais(date);
  return Number(p.hour) * 60 + Number(p.minute);
}

/** Timestamp ISO com o deslocamento local explícito (ex.: 2026-09-27T08:05:12-03:00). */
function timestampLocal(date = new Date()) {
  const p = partesLocais(date);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${OFFSET}`;
}

/** "08:05" -> 485. Retorna null para vazio/inválido. */
function hhmmParaMin(hhmm) {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm).trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** 485 -> "08:05". */
function minParaHhmm(min) {
  if (min == null) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "2026-09-27" -> "dom". Cálculo em UTC puro para não depender do fuso do servidor. */
function diaSemana(data) {
  return DIAS[new Date(`${data}T12:00:00Z`).getUTCDay()];
}

/** Soma dias a uma data AAAA-MM-DD. */
function somarDias(data, n) {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Lista de datas de inicio a fim (inclusive). */
function datasEntre(inicio, fim) {
  const datas = [];
  for (let d = inicio; d <= fim; d = somarDias(d, 1)) datas.push(d);
  return datas;
}

module.exports = {
  FUSO,
  DIAS,
  DIAS_NOME,
  dataLocal,
  horaMinLocal,
  timestampLocal,
  hhmmParaMin,
  minParaHhmm,
  diaSemana,
  somarDias,
  datasEntre,
};
