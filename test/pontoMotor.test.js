// Testes do motor de cálculo do ponto. Rodar com: npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const { calcularDia, resumirDias, periodoDoMes } = require("../server/utils/ponto/motor");
const { hhmmParaMin: m, diaSemana, dataLocal, horaMinLocal, timestampLocal } = require("../server/utils/ponto/tempo");

const ESCALA = { entrada: "09:00", saidaAlmoco: "12:00", voltaAlmoco: "13:00", saida: "16:00" }; // 6h
const SEM_ALMOCO = { entrada: "09:00", saida: "15:00" }; // 6h
const CONFIG = { toleranciaMin: 10, almocoMin: 55, almocoMax: 70 };
const HOJE = "2026-09-30";
const dia = (marcacoes, extra = {}) =>
  calcularDia({ data: "2026-09-28", marcacoes: marcacoes.map(m), escalaDia: ESCALA, config: CONFIG, hoje: HOJE, ...extra });

test("dia completo e pontual: saldo zero", () => {
  const d = dia(["09:00", "12:00", "13:00", "16:00"]);
  assert.equal(d.status, "normal");
  assert.equal(d.cargaEsperada, 360);
  assert.equal(d.cargaCumprida, 360);
  assert.equal(d.saldo, 0);
  assert.equal(d.atrasoMin, 0);
  assert.equal(d.saidaAntecipadaMin, 0);
  assert.equal(d.almoco.classificacao, "adequado");
  assert.equal(d.contaNoTotal, true);
});

test("carga esperada vem da escala (saída - entrada - almoço)", () => {
  assert.equal(dia([]).cargaEsperada, 360);
  const d = calcularDia({ data: "2026-09-28", marcacoes: [], escalaDia: SEM_ALMOCO, config: CONFIG, hoje: HOJE });
  assert.equal(d.cargaEsperada, 360);
});

test("marcações fora de ordem são ordenadas", () => {
  const d = dia(["16:00", "09:00", "13:00", "12:00"]);
  assert.equal(d.cargaCumprida, 360);
});

test("atraso dentro da tolerância não conta", () => {
  assert.equal(dia(["09:10", "12:00", "13:00", "16:00"]).atrasoMin, 0);
});

test("atraso acima da tolerância conta a diferença CHEIA", () => {
  assert.equal(dia(["09:11", "12:00", "13:00", "16:00"]).atrasoMin, 11);
});

test("saída antecipada em dia completo", () => {
  const d = dia(["09:00", "12:00", "13:00", "15:30"]);
  assert.equal(d.saidaAntecipadaMin, 30);
  assert.equal(d.saldo, -30);
});

test("seis marcações (ida ao banco): pausa do banco NÃO conta como trabalho", () => {
  const d = dia(["09:00", "12:00", "13:00", "14:00", "14:30", "16:30"]);
  // 3h + 1h + 2h = 6h trabalhadas; pausas 12-13 e 14-14:30 fora
  assert.equal(d.cargaCumprida, 360);
  assert.equal(d.incompleta, false);
});

test("seis marcações: almoço é a pausa que começa entre 11h e 14h, não a 2ª/3ª marcação", () => {
  // 1ª pausa 10:00-10:15 (banco), almoço 12:00-13:00
  const d = dia(["09:00", "10:00", "10:15", "12:00", "13:00", "16:15"]);
  assert.equal(d.almoco.inicio, m("12:00"));
  assert.equal(d.almoco.classificacao, "adequado");
});

test("almoço curto e longo pelos limites da configuração", () => {
  assert.equal(dia(["09:00", "12:00", "12:30", "15:30"]).almoco.classificacao, "curto");
  assert.equal(dia(["09:00", "12:00", "13:30", "16:30"]).almoco.classificacao, "longo");
});

test("sem pausa na janela: usa a pausa mais longa", () => {
  const d = dia(["08:00", "09:00", "09:10", "10:00", "11:00", "15:50"].slice(0, 6));
  // pausas: 09:00-09:10 (10) e 10:00-11:00 (60) -> nenhuma começa 11h-14h? 10:00 não; usa a mais longa
  assert.equal(d.almoco.duracao, 60);
});

test("esqueceu a saída (3 marcações): INCOMPLETA, sem saída antecipada nem almoço", () => {
  const d = dia(["09:00", "12:00", "13:00"]);
  assert.equal(d.status, "incompleto");
  assert.equal(d.incompleta, true);
  assert.equal(d.saidaAntecipadaMin, 0);
  assert.equal(d.almoco, null);
  assert.equal(d.contaNoTotal, false);
  assert.equal(d.saldo, 0);
});

test("duas marcações em escala com almoço é incompleta", () => {
  assert.equal(dia(["09:00", "16:00"]).status, "incompleto");
});

test("duas marcações em escala SEM almoço é dia completo", () => {
  const d = calcularDia({ data: "2026-09-28", marcacoes: [m("09:00"), m("15:00")], escalaDia: SEM_ALMOCO, config: CONFIG, hoje: HOJE });
  assert.equal(d.status, "normal");
  assert.equal(d.saldo, 0);
  assert.equal(d.almoco, null);
});

test("carga abaixo de 60% é incompleta mesmo com 4 marcações", () => {
  const d = dia(["09:00", "10:00", "11:00", "12:00"]); // 2h de 6h
  assert.equal(d.status, "incompleto");
});

test("atraso é avaliado mesmo em dia incompleto", () => {
  assert.equal(dia(["09:30", "12:00", "13:00"]).atrasoMin, 30);
});

test("incompleto CONFIRMADO ('saí mais cedo mesmo') entra no total com saldo negativo", () => {
  const d = dia(["09:00", "12:00"], { confirmado: true });
  assert.equal(d.contaNoTotal, true);
  assert.equal(d.saldo, 180 - 360);
});

test("nenhuma marcação em dia de escala é falta e conta no total", () => {
  const d = dia([]);
  assert.equal(d.status, "falta");
  assert.equal(d.falta, true);
  assert.equal(d.saldo, -360);
  assert.equal(d.contaNoTotal, true);
});

test("dia sem escala (fim de semana) não é falta", () => {
  const d = dia([], { escalaDia: null });
  assert.equal(d.status, "sem_escala");
  assert.equal(d.falta, false);
  assert.equal(d.contaNoTotal, false);
});

test("marcação em dia sem escala é trabalho fora da escala, fora do total", () => {
  const d = dia(["09:00", "12:00"], { escalaDia: null });
  assert.equal(d.foraDaEscala, true);
  assert.equal(d.contaNoTotal, false);
});

test("feriado não é falta", () => {
  const d = dia([], { feriado: { nome: "Independência" } });
  assert.equal(d.status, "feriado");
  assert.equal(d.falta, false);
  assert.equal(d.contaNoTotal, false);
});

test("o dia de HOJE nunca entra no total, mesmo sem marcação", () => {
  const d = dia([], { data: HOJE });
  assert.equal(d.status, "em_andamento");
  assert.equal(d.falta, false);
  assert.equal(d.contaNoTotal, false);
});

test("dia futuro não é avaliado", () => {
  assert.equal(dia([], { data: "2026-10-05" }).status, "futuro");
});

test("resumo exclui dias pendentes do saldo, mas conta falta", () => {
  const dias = [
    dia(["09:00", "12:00", "13:00", "16:30"]), // +30
    dia(["09:00", "12:00", "13:00"]), // incompleto: fora
    dia([]), // falta: -360
    dia(["09:20", "12:00", "13:00", "16:00"]), // atraso 20, -20
  ];
  const r = resumirDias(dias);
  assert.equal(r.saldo, 30 - 360 - 20);
  assert.equal(r.pendentes, 1);
  assert.equal(r.faltas, 1);
  assert.equal(r.atrasos, 1);
  assert.equal(r.atrasoMin, 20);
  assert.equal(r.diasApurados, 3);
});

test("período de mês civil: fim fechado é ontem no mês em aberto", () => {
  assert.deepEqual(periodoDoMes(2026, 9, "2026-09-27"), {
    inicio: "2026-09-01",
    fim: "2026-09-30",
    fimFechado: "2026-09-26",
    aberto: true,
  });
  assert.equal(periodoDoMes(2026, 8, "2026-09-27").fimFechado, "2026-08-31");
  assert.equal(periodoDoMes(2026, 2, "2026-09-27").fim, "2026-02-28");
});

test("tempo: dia da semana e horário de Fortaleza independem do fuso do servidor", () => {
  assert.equal(diaSemana("2026-09-27"), "dom");
  assert.equal(diaSemana("2026-09-28"), "seg");
  const utc = new Date("2026-09-28T02:30:00Z"); // 23:30 do dia 27 em Fortaleza
  assert.equal(dataLocal(utc), "2026-09-27");
  assert.equal(horaMinLocal(utc), 23 * 60 + 30);
  assert.equal(timestampLocal(utc), "2026-09-27T23:30:00-03:00");
});

// ---------- Ocorrências (Etapa 2) ----------
const { statusPresenca } = require("../server/utils/ponto/motor");
const { TIPOS } = require("../server/utils/ponto/ocorrencias");
const oc = (id) => ({ nome: TIPOS.get(id).nome, ...TIPOS.get(id) });

test("atestado abona a falta: dia sai do denominador, sem saldo negativo", () => {
  const d = dia([], { ocorrencia: oc("atestado_medico") });
  assert.equal(d.status, "abonado");
  assert.equal(d.falta, false);
  assert.equal(d.saldo, 0);
  assert.equal(d.cargaEsperada, 0);
  assert.equal(d.contaNoTotal, true);
});

test("falta injustificada NÃO abona: continua falta", () => {
  const d = dia([], { ocorrencia: oc("falta_injustificada") });
  assert.equal(d.status, "falta");
  assert.equal(d.saldo, -360);
});

test("home office credita a jornada sem marcação", () => {
  const d = dia([], { ocorrencia: oc("home_office") });
  assert.equal(d.status, "abonado");
  assert.equal(d.cargaCumprida, 360);
  assert.equal(d.cargaEsperada, 360);
  assert.equal(d.saldo, 0);
});

test("home office com dia completo e hora extra: vale o que foi marcado", () => {
  const d = dia(["09:00", "12:00", "13:00", "16:30"], { ocorrencia: oc("home_office") });
  assert.equal(d.status, "normal");
  assert.equal(d.saldo, 30);
});

test("folga compensatória: não é falta, mas desconta do banco", () => {
  const d = dia([], { ocorrencia: oc("folga_compensatoria") });
  assert.equal(d.status, "abonado");
  assert.equal(d.falta, false);
  assert.equal(d.saldo, -360);
});

test("atestado de meio período resolve o dia incompleto (sai da pendência)", () => {
  const d = dia(["09:00", "12:00"], { ocorrencia: oc("atestado_medico") });
  assert.equal(d.status, "abonado");
  assert.equal(d.contaNoTotal, true);
  assert.equal(d.saldo, 0);
});

test("atraso justificado zera o atraso e devolve os minutos ao saldo", () => {
  const d = dia(["09:40", "12:00", "13:00", "16:00"], { ocorrencia: oc("atraso_justificado") });
  assert.equal(d.atrasoMin, 0);
  assert.equal(d.atrasoAbonadoMin, 40);
  assert.equal(d.saldo, 0);
});

test("atraso justificado não transforma saída antecipada em saldo positivo", () => {
  const d = dia(["09:40", "12:00", "13:00", "15:30"], { ocorrencia: oc("atraso_justificado") });
  assert.equal(d.saldo, -30); // 40 de atraso abonados, 30 de saída antecipada continuam
});

test("ocorrência não muda feriado nem dia sem escala", () => {
  assert.equal(dia([], { ocorrencia: oc("atestado_medico"), escalaDia: null }).status, "sem_escala");
});

test("resumo soma ajustes de saldo, horas extras e abonados", () => {
  const dias = [dia(["09:00", "12:00", "13:00", "16:30"]), dia([], { ocorrencia: oc("atestado_medico") })];
  const r = resumirDias(dias, -60);
  assert.equal(r.horasExtras, 30);
  assert.equal(r.abonados, 1);
  assert.equal(r.ajustesSaldo, -60);
  assert.equal(r.saldo, 30 - 60);
});

test("presença: atrasado conta como presente, aguardando dentro da tolerância, ausente depois", () => {
  const base = { escalaDia: ESCALA, config: CONFIG };
  assert.equal(statusPresenca({ ...base, marcacoes: [m("09:05")], agoraMin: m("10:00") }), "presente");
  assert.equal(statusPresenca({ ...base, marcacoes: [m("09:30")], agoraMin: m("10:00") }), "atrasado");
  assert.equal(statusPresenca({ ...base, marcacoes: [], agoraMin: m("09:08") }), "aguardando");
  assert.equal(statusPresenca({ ...base, marcacoes: [], agoraMin: m("09:30") }), "ausente");
  assert.equal(statusPresenca({ ...base, marcacoes: [], agoraMin: m("09:30"), ocorrencia: oc("ferias") }), "afastado");
  assert.equal(statusPresenca({ ...base, marcacoes: [], agoraMin: m("09:30"), ocorrencia: oc("home_office") }), "externo");
  assert.equal(statusPresenca({ ...base, escalaDia: null, marcacoes: [], agoraMin: m("09:30") }), "sem_expediente");
});
