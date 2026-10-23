// Testes da proposta comercial. Rodar com: npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const { MODELO_PADRAO, calcularVagas, trocarMarcadores, blocos } = require("../server/utils/proposta");

test("valor por vaga = salário × taxa, nunca abaixo do salário mínimo", () => {
  const c = calcularVagas({ percentual: 78, salarioMinimo: 1518, vagas: [{ cargo: "Vendedor", salario: 3000, quantidade: 2 }, { cargo: "Auxiliar", salario: 1600 }] });
  assert.equal(c.linhas[0].unitario, 2340);
  assert.equal(c.linhas[0].total, 4680);
  assert.equal(c.linhas[1].unitario, 1518);
  assert.equal(c.linhas[1].aplicouMinimo, true);
  assert.equal(c.total, 6198);
});

test("marcadores são preenchidos com os dados da proposta", () => {
  const p = { ...MODELO_PADRAO, clienteNome: "Padaria Sol", contatoNome: "Carla Mendes", data: "2026-10-23" };
  const inv = MODELO_PADRAO.secoes.find((s) => s.id === "investimento").texto;
  const t = trocarMarcadores(inv, p);
  assert.match(t, /90% do salário/);
  assert.match(t, /fazer 78% em cima/);
  assert.doesNotMatch(t, /\{/);
  assert.equal(trocarMarcadores("Olá, {CONTATO}!", p), "Olá, Carla!");
  assert.equal(trocarMarcadores("Olá, {CONTATO}!", { ...p, contatoNome: "" }), "Olá!");
  assert.equal(trocarMarcadores("válida até {DATA}", p), "válida até 23/10/2026");
});

test("texto vira parágrafos e itens de lista", () => {
  assert.deepEqual(blocos("Intro\n• um\n- dois\n\nFim").map((b) => b.tipo), ["par", "item", "item", "espaco", "par"]);
});
