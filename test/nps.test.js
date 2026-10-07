// Testes do cálculo do NPS. Rodar com: npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const { categoria, validarRespostas, resumir, zona } = require("../server/utils/nps");

const resp = (nps, nota = 5) => ({ nps, criterios: { atendimento: nota, qualidade: nota, prazo: nota, atualizacao: nota, consultor: nota } });

test("categorias de mercado: 9–10 promotor, 7–8 neutro, 0–6 detrator", () => {
  assert.equal(categoria(10), "promotor");
  assert.equal(categoria(9), "promotor");
  assert.equal(categoria(8), "neutro");
  assert.equal(categoria(7), "neutro");
  assert.equal(categoria(6), "detrator");
  assert.equal(categoria(0), "detrator");
});

test("NPS = % promotores − % detratores", () => {
  // 6 promotores, 2 neutros, 2 detratores -> 60% - 20% = 40
  const r = resumir([10, 9, 9, 10, 9, 10, 8, 7, 5, 3].map((n) => resp(n)));
  assert.equal(r.nps, 40);
  assert.equal(r.pctPromotores, 60);
  assert.equal(r.pctDetratores, 20);
  assert.equal(r.respostas, 10);
});

test("NPS pode ser negativo e vai de -100 a +100", () => {
  assert.equal(resumir([0, 3, 6].map((n) => resp(n))).nps, -100);
  assert.equal(resumir([9, 10].map((n) => resp(n))).nps, 100);
  assert.equal(resumir([10, 2].map((n) => resp(n))).nps, 0);
});

test("sem respostas: NPS nulo (não zero)", () => {
  const r = resumir([]);
  assert.equal(r.nps, null);
  assert.equal(r.mediaGeral, null);
});

test("médias por critério e média geral", () => {
  const r = resumir([resp(10, 5), resp(8, 3)]);
  assert.equal(r.medias.atendimento, 4);
  assert.equal(r.mediaGeral, 4);
});

test("zonas do NPS", () => {
  assert.equal(zona(80), "Excelência");
  assert.equal(zona(60), "Qualidade");
  assert.equal(zona(10), "Aperfeiçoamento");
  assert.equal(zona(-5), "Crítica");
  assert.equal(zona(null), null);
});

test("validação: exige todas as notas de 1 a 5 e NPS de 0 a 10", () => {
  const ok = { nps: 9, criterios: { atendimento: 5, qualidade: 4, prazo: 3, atualizacao: 5, consultor: 5 }, feedback: " ótimo " };
  assert.equal(validarRespostas(ok).feedback, "ótimo");
  assert.throws(() => validarRespostas({ ...ok, nps: 11 }), /0 a 10/);
  assert.throws(() => validarRespostas({ ...ok, criterios: { ...ok.criterios, prazo: 0 } }), /Prazo/);
  assert.throws(() => validarRespostas({ ...ok, criterios: { ...ok.criterios, consultor: undefined } }), /Consultor/);
});
