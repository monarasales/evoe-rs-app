// Testes da mensagem de convite e do alerta de termos sensíveis. Rodar com: npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { pathToFileURL } = require("url");

const carregar = () => import(pathToFileURL(path.join(__dirname, "..", "public", "js", "mensagemVaga.js")).href);

test("competências reconhecidas na ordem do texto, no máximo 3", async () => {
  const { competenciasDaVaga } = await carregar();
  const p = { perfilComportamental: "Pessoa organizada, com boa comunicação, proativa e analítica." };
  assert.deepEqual(competenciasDaVaga(p), ["organização", "boa comunicação", "proatividade"]);
});

test("texto livre NUNCA vai para a mensagem — só competências da lista", async () => {
  const { mensagemConvite } = await carregar();
  const vaga = {
    titulo: "Assistente Administrativo",
    pagina: { perfilComportamental: "Mulher jovem, solteira, boa aparência, organizada e comunicativa.", bairro: "Aldeota", cidade: "Fortaleza/CE" },
  };
  const msg = mensagemConvite(vaga, "https://x/vaga/abc");
  assert.match(msg, /Buscamos alguém com organização e boa comunicação\./);
  for (const proibido of [/mulher/i, /jovem/i, /solteir/i, /apar[eê]ncia/i]) assert.doesNotMatch(msg, proibido);
  assert.match(msg, /\*Vaga: Assistente Administrativo\*/);
  assert.match(msg, /📍 Aldeota, Fortaleza\/CE/);
  assert.match(msg, /https:\/\/x\/vaga\/abc/);
});

test("sem perfil preenchido: frase acolhedora genérica", async () => {
  const { mensagemConvite } = await carregar();
  const msg = mensagemConvite({ titulo: "Vendedor" }, "L");
  assert.match(msg, /novo desafio para crescer profissionalmente/);
  assert.doesNotMatch(msg, /Buscamos alguém com/);
});

test("alerta de termos sensíveis (CLT 373-A / Lei 9.029/95)", async () => {
  const { termosSensiveis } = await carregar();
  const tipos = (t) => termosSensiveis(t).map((x) => x.tipo);
  assert.deepEqual(tipos("Até 25 anos, sexo feminino, boa aparência"), ["idade", "sexo/gênero", "aparência física"]);
  assert.deepEqual(tipos("Preferência por solteiros e sem filhos"), ["estado civil/família"]);
  assert.deepEqual(tipos("Vaga de Jovem Aprendiz, organizado e comunicativo"), []);
  assert.deepEqual(tipos("Excel avançado, boa comunicação"), []);
});

test("modelo editado em Configurações e mensagem personalizada na vaga", async () => {
  const { mensagemConvite } = await carregar();
  const vaga = { titulo: "Vendedor", pagina: { perfilComportamental: "proativo" } };
  assert.equal(mensagemConvite(vaga, "L", "Oi! {VAGA} — {PERFIL} {LINK}"), "Oi! Vendedor — Buscamos alguém com proatividade. Se você se identifica, vamos adorar conhecer você! L");
  assert.equal(mensagemConvite({ ...vaga, mensagemConvite: "Texto próprio da vaga: {LINK}" }, "L", "ignorado {LINK}"), "Texto próprio da vaga: L");
  // vaga sem detalhes: a linha {DETALHES} some sem deixar buraco
  assert.doesNotMatch(mensagemConvite({ titulo: "X" }, "L"), /\n\n\n/);
});
