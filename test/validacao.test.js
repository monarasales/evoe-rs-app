// Testes das validações de dados pessoais. Rodar com: npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const { cpfValido, dataIso, idade, lerDadosPessoaisObrigatorios } = require("../server/utils/validacao");

const base = { cpf: "529.982.247-25", dataNascimento: "30/12/1999", cep: "60822-070", endereco: "Rua Walter de Castro", numero: "425", bairro: "Cidade dos Funcionários", cidade: "Fortaleza", uf: "ce" };

test("CPF: dígitos verificadores", () => {
  assert.equal(cpfValido("529.982.247-25"), true);
  assert.equal(cpfValido("529.982.247-24"), false);
  assert.equal(cpfValido("111.111.111-11"), false);
  assert.equal(cpfValido("123"), false);
});

test("datas: aceita dd/mm/aaaa e ISO; recusa data inexistente", () => {
  assert.equal(dataIso("30/12/1999"), "1999-12-30");
  assert.equal(dataIso("1999-12-30"), "1999-12-30");
  assert.equal(dataIso("31/02/1999"), null);
  assert.equal(idade("2000-10-09", new Date(2026, 9, 8)), 25);
  assert.equal(idade("2000-10-08", new Date(2026, 9, 8)), 26);
});

test("inscrição pública: dados completos são aceitos e normalizados", () => {
  const { dados, erro } = lerDadosPessoaisObrigatorios(base);
  assert.equal(erro, undefined);
  assert.equal(dados.dataNascimento, "1999-12-30");
  assert.equal(dados.cep, "60822-070");
  assert.equal(dados.uf, "CE");
  assert.equal(dados.cpf, "529.982.247-25");
});

test("inscrição pública: cada campo obrigatório é exigido", () => {
  for (const [campo, msg] of [["cpf", /CPF/], ["dataNascimento", /nascimento/], ["cep", /CEP/], ["endereco", /rua/], ["numero", /número/], ["bairro", /bairro/], ["cidade", /cidade/], ["uf", /UF/]]) {
    assert.match(lerDadosPessoaisObrigatorios({ ...base, [campo]: "" }).erro, msg, campo);
  }
  assert.match(lerDadosPessoaisObrigatorios({ ...base, dataNascimento: "01/01/2020" }).erro, /Confira/);
});
