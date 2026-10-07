// Testes da pontuação do teste DISC. Rodar com: npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const { GRUPOS, FATORES, perguntas, pontuar, nomePerfil, codigoPalavra } = require("../server/utils/disc");

// Monta respostas escolhendo sempre o fator `mais` como MAIS e `menos` como MENOS.
const responder = (maisFn, menosFn) =>
  GRUPOS.map((_, g) => ({ grupo: g, mais: codigoPalavra(g, maisFn(g)), menos: codigoPalavra(g, menosFn(g)) }));

test("instrumento: 24 grupos, 4 palavras únicas por grupo, nenhuma palavra repetida", () => {
  assert.equal(GRUPOS.length, 24);
  const todas = GRUPOS.flat();
  GRUPOS.forEach((g) => assert.equal(g.length, 4));
  assert.equal(new Set(todas).size, todas.length);
});

test("perfil D puro: D sempre MAIS, C sempre MENOS", () => {
  const r = pontuar(responder(() => "D", () => "C"));
  assert.equal(r.perfil, "D");
  assert.equal(r.bruto.D, 24);
  assert.equal(r.bruto.C, -24);
  assert.equal(r.intensidade.D, 100);
  assert.equal(r.intensidade.C, 0);
  assert.equal(r.intensidade.I, 50);
});

test("perfil combinado DI: metade D, metade I como MAIS", () => {
  const r = pontuar(responder((g) => (g % 2 ? "D" : "I"), () => "S"));
  assert.equal(r.primario, "D"); // empate desempata na ordem D, I, S, C
  assert.equal(r.secundario, "I");
  assert.equal(r.perfil, "DI");
  assert.match(nomePerfil(r), /^DI — Executor \/ Comunicador$/);
});

test("secundário só aparece se for positivo e próximo do primário", () => {
  // S forte (18x MAIS), C fraco (6x MAIS): distância grande -> sem secundário
  const r = pontuar(responder((g) => (g < 18 ? "S" : "C"), () => "D"));
  assert.equal(r.perfil, "S");
  assert.equal(r.secundario, null);
});

test("distribuição soma ~100%", () => {
  const r = pontuar(responder((g) => FATORES[g % 4], (g) => FATORES[(g + 1) % 4]));
  const soma = FATORES.reduce((t, f) => t + r.distribuicao[f], 0);
  assert.ok(soma >= 98 && soma <= 102, `soma=${soma}`);
});

test("rejeita respostas incompletas, repetidas ou com MAIS = MENOS", () => {
  const ok = responder(() => "D", () => "C");
  assert.throws(() => pontuar(ok.slice(1)), /Responda todos/);
  assert.throws(() => pontuar([...ok.slice(1), ok[1]]), /duas vezes/);
  const igual = ok.map((r, i) => (i === 0 ? { ...r, menos: r.mais } : r));
  assert.throws(() => pontuar(igual), /palavras diferentes/);
  const misturado = ok.map((r, i) => (i === 0 ? { ...r, menos: codigoPalavra(1, "C") } : r));
  assert.throws(() => pontuar(misturado), /inválida/);
});

test("perguntas públicas não revelam o fator e têm ordem estável por candidato", () => {
  const a = perguntas("cand-1");
  const b = perguntas("cand-1");
  assert.deepEqual(a, b);
  assert.equal(a.length, 24);
  a.forEach((g) => g.opcoes.forEach((o) => assert.match(o.id, /^g\d+-[0-9a-f]{8}$/)));
  assert.equal(JSON.stringify(a).includes('"D"'), false);
});

test("códigos mudam por candidato: respostas de um não valem no teste de outro", () => {
  const de1 = GRUPOS.map((_, g) => ({ grupo: g, mais: codigoPalavra(g, "D", "token-1"), menos: codigoPalavra(g, "C", "token-1") }));
  assert.equal(pontuar(de1, "token-1").perfil, "D");
  assert.throws(() => pontuar(de1, "token-2"), /inválida/);
  assert.notEqual(perguntas("token-1")[0].opcoes.map((o) => o.id).sort().join(), perguntas("token-2")[0].opcoes.map((o) => o.id).sort().join());
});
