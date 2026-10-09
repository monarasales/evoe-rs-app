// Testes do retorno ao candidato. Rodar com: npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { pathToFileURL } = require("url");

const carregar = () => import(pathToFileURL(path.join(__dirname, "..", "public", "js", "retornoCandidato.js")).href);

test("convite para entrevista com o gestor: data com dia da semana, horário e link", async () => {
  const { montarRetorno } = await carregar();
  const msg = montarRetorno("convite_gestor", {
    nome: "MARCELO silva",
    vaga: "Analista Financeiro",
    consultor: "Monara Sales",
    entrevista: { data: "2026-10-08", horario: "15:00", formato: "Online", local: "https://meet.google.com/abc" },
  });
  assert.match(msg, /^Olá, Marcelo! Tudo bem\?/);
  assert.match(msg, /📅 Data: 08\/10 \(quinta-feira\)\n🕐 Horário: 15:00\n💻 Online, pelo link:\nhttps:\/\/meet\.google\.com\/abc/);
  assert.match(msg, /Monara \| \*Evoé Gestão & RH\*$/);
  // linguagem neutra: nada de "selecionada", "convidá-la", "aprovado(a)"
  assert.doesNotMatch(msg, /selecionad|convidá-l|\(a\)/i);
});

test("devolutiva negativa nunca expõe o motivo e mantém no banco de talentos", async () => {
  const { montarRetorno } = await carregar();
  for (const tipo of ["reprovado_evoe", "reprovado_gestor"]) {
    const msg = montarRetorno(tipo, { nome: "Ana", vaga: "Vendedor", motivo: "Pretensão salarial acima", linkVagas: "https://x/vagas" });
    assert.doesNotMatch(msg, /pretens|motivo/i);
    assert.match(msg, /banco de talentos/);
    assert.match(msg, /https:\/\/x\/vagas/);
    assert.match(msg, /^\*Evoé Gestão & RH\*$/m); // sem consultor: assinatura só da Evoé
  }
});

test("modelo editado em Configurações substitui o padrão; presencial com endereço", async () => {
  const { montarRetorno } = await carregar();
  const msg = montarRetorno("convite_evoe", { nome: "Ana", entrevista: { data: "2026-10-12", horario: "09:30", formato: "Presencial", local: "Rua X, 1" } }, { convite_evoe: "Oi {NOME}!\n{ENTREVISTA}" });
  assert.equal(msg, "Oi Ana!\n📅 Data: 12/10 (segunda-feira)\n🕐 Horário: 09:30\n📍 Presencial: Rua X, 1");
});

test("situação sugerida pela fase e telefone do WhatsApp", async () => {
  const { tipoSugerido, telefoneWhatsapp } = await carregar();
  assert.equal(tipoSugerido({ fase: "Triagem" }), "convite_evoe");
  assert.equal(tipoSugerido({ fase: "Seleção com RH" }), "convite_gestor");
  assert.equal(tipoSugerido({ fase: "Seleção com gestor" }), "aprovado");
  assert.equal(tipoSugerido({ fase: "Reprovado", reprovacao: { fase: "Seleção com gestor" } }), "reprovado_gestor");
  assert.equal(tipoSugerido({ fase: "Reprovado", reprovacao: { fase: "Triagem" } }), "reprovado_evoe");
  assert.equal(telefoneWhatsapp("(85) 98862-0412"), "5585988620412");
  assert.equal(telefoneWhatsapp("5585988620412"), "5585988620412");
  assert.equal(telefoneWhatsapp("85"), "");
});

test("telefone: +55, zero na frente, números colados e número cortado pelo +55", async () => {
  const { lerTelefone, telefoneWhatsapp } = await carregar();
  assert.equal(telefoneWhatsapp("+55 (85) 99247-0160"), "5585992470160");
  assert.equal(telefoneWhatsapp("558596314223"), "558596314223"); // fixo/antigo com 55
  assert.equal(telefoneWhatsapp("085 99247-0160"), "5585992470160");
  assert.equal(telefoneWhatsapp("8598410646585996774779"), "5585984106465");
  assert.equal(telefoneWhatsapp("(55) 99123-4567"), "5555991234567"); // DDD 55 (RS) de verdade
  assert.equal(telefoneWhatsapp("(55) 75998-7021"), "");
  assert.match(lerTelefone("(55) 85987-2338").problema, /incompleto/);
  assert.equal(lerTelefone("").problema, "");
});
