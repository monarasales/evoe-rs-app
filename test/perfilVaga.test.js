// Testes do perfil da vaga enviado pelo cliente. Rodar com: npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizarPerfil, pendencias, resumoJornada, montarVaga } = require("../server/utils/perfilVaga");

const exemplo = () =>
  normalizarPerfil({
    empresa: { nome: "Padaria Sol", bairro: "Aldeota", cidade: "Fortaleza" },
    contato: { nome: "Carla Mendes", email: "Carla@Sol.com", whatsapp: "(85) 99999-0000" },
    vaga: { cargo: "Atendente", quantidade: "2", tipoContratacao: "CLT", modeloTrabalho: "Presencial", motivo: "Aumento de quadro" },
    cultura: { valores: "Acolhimento", ritmo: "Moderado e organizado" },
    comportamentais: ["Comunicação", "Empatia", "Inventada"],
    naoContratar: "Quem não gosta de lidar com público",
    tecnicas: { atividades: ["Atender no balcão", "Operar caixa"], escolaridade: "Ensino médio", experiencia: "6 meses" },
    jornada: {
      dias: {
        seg: { ativo: true, inicio: "08:00", fim: "17:00" },
        ter: { ativo: true, inicio: "08:00", fim: "17:00" },
        qua: { ativo: true, inicio: "08:00", fim: "17:00" },
        qui: { ativo: true, inicio: "08:00", fim: "17:00" },
        sex: { ativo: true, inicio: "08:00", fim: "17:00" },
        sab: { ativo: true, inicio: "08:00", fim: "12:00" },
        dom: { ativo: false },
      },
      intervalo: "1 hora",
    },
    remuneracao: {
      salario: "1.800,00",
      comissao: { tem: true, descricao: "2% das vendas" },
      alimentacao: { tipo: "Vale-refeição", valor: "25", periodicidade: "por dia" },
      valeTransporte: true,
      planoSaude: { tem: true, operadora: "Hapvida" },
      outros: ["Fardamento", "Carro da empresa"],
    },
  });

test("normaliza: lista fechada de competências/benefícios, valores em reais, e-mail minúsculo", () => {
  const p = exemplo();
  assert.deepEqual(p.comportamentais, ["Comunicação", "Empatia"]);
  assert.deepEqual(p.remuneracao.outros, ["Fardamento"]);
  assert.equal(p.remuneracao.salario, 1800);
  assert.equal(p.contato.email, "carla@sol.com");
  assert.equal(p.vaga.quantidade, 2);
  assert.deepEqual(pendencias(p), []);
});

test("jornada agrupa dias com o mesmo horário e soma as horas", () => {
  const j = resumoJornada(exemplo().jornada);
  assert.equal(j.texto, "Seg a Sex, 08:00 às 17:00 · Sáb, 08:00 às 12:00");
  assert.equal(j.horasSemana, 49);
});

test("vaga montada: página pública sem o 'perfil que não contrata'; interno completo", () => {
  const v = montarVaga(exemplo());
  assert.equal(v.titulo, "Atendente");
  assert.match(v.perfilVaga, /não divulgar/);
  assert.match(v.perfilVaga, /lidar com público/);
  assert.doesNotMatch(JSON.stringify(v.pagina), /lidar com público/);
  assert.match(v.pagina.salario, /R\$\s?1\.800,00 \+ comissão \(2% das vendas\)/);
  assert.deepEqual(v.pagina.beneficios.slice(0, 3).map((x) => x.replace(/\u00a0/g, " ")), ["Vale-refeição de R$ 25,00 por dia", "Vale-transporte", "Plano de saúde (Hapvida)"]);
  assert.deepEqual(v.pagina.responsabilidades.map((r) => r.texto), ["Atender no balcão", "Operar caixa"]);
  assert.equal(v.pagina.bairro, "Aldeota");
});

test("pendências mostram o que falta em linguagem simples", () => {
  const f = pendencias(normalizarPerfil({ jornada: { dias: { seg: { ativo: true, inicio: "08:00" } } } }));
  assert.ok(f.includes("Nome da empresa"));
  assert.ok(f.includes("Seu WhatsApp com DDD"));
  assert.ok(f.includes("Horário de entrada e saída de cada dia marcado"));
  assert.ok(f.includes("Salário"));
});
