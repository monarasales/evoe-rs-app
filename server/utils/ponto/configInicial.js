// Configuração inicial do ponto, aplicada sozinha na subida do servidor (idempotente:
// cada parte grava um marcador em "parametros" e não roda de novo). Tudo continua
// editável depois pela tela (Configurações e Gestão do Ponto).
//  1. Endereço do escritório da Evoé (validação do ponto presencial)
//  2. Feriados de 2026 e 2027: nacionais (BrasilAPI, sem Carnaval — ponto facultativo),
//     estaduais do Ceará e municipais de Fortaleza
//  3. Vínculo colaborador -> login quando e-mail ou nome batem com alguém da equipe

const db = require("../../db");
const { geocodificarEndereco } = require("../cep");
const { COL_FERIADOS, listarFeriados } = require("./jornada");

const CHAVE = "pontoConfigInicial";

const ESCRITORIO = {
  cepEmpresa: "60822070",
  logradouroEmpresa: "Rua Walter de Castro",
  numeroEmpresa: "425",
  bairroEmpresa: "Cidade dos Funcionários",
  cidadeEmpresa: "Fortaleza",
  estadoEmpresa: "CE",
};
// Coordenadas obtidas do endereço acima (usadas se o serviço de mapa estiver fora do ar).
const ESCRITORIO_COORDS = { lat: -3.7923393, long: -38.4928861 };

const ANOS_FERIADOS = [2026, 2027];
const FERIADOS_LOCAIS = [
  { mmdd: "03-19", nome: "Dia de São José", tipo: "estadual" },
  { mmdd: "03-25", nome: "Data Magna do Ceará", tipo: "estadual" },
  { mmdd: "04-13", nome: "Aniversário de Fortaleza", tipo: "municipal" },
  { mmdd: "08-15", nome: "Nossa Senhora da Assunção", tipo: "municipal" },
];

function lerMarcador() {
  return db.readCollection("parametros").find((p) => p.chave === CHAVE) || db.insert("parametros", { chave: CHAVE });
}
function marcar(campo, valor) {
  db.update("parametros", lerMarcador().id, { [campo]: valor });
}

async function configurarEscritorio() {
  if (lerMarcador().escritorio) return;
  const existente = db.readCollection("configuracao").find((c) => c.tipo === "empresa");
  if (existente && existente.localizacaoEmpresa && existente.localizacaoEmpresa.lat != null) {
    marcar("escritorio", "já configurado");
    return;
  }
  const coords =
    (await geocodificarEndereco({
      logradouro: ESCRITORIO.logradouroEmpresa,
      numero: ESCRITORIO.numeroEmpresa,
      cidade: ESCRITORIO.cidadeEmpresa,
      estado: ESCRITORIO.estadoEmpresa,
      cep: ESCRITORIO.cepEmpresa,
    })) || ESCRITORIO_COORDS;
  const dados = {
    ...ESCRITORIO,
    enderecoEmpresa: `${ESCRITORIO.logradouroEmpresa}, ${ESCRITORIO.numeroEmpresa} - ${ESCRITORIO.bairroEmpresa}`,
    localizacaoEmpresa: { ...coords, origem: "endereco" },
  };
  if (existente) db.update("configuracao", existente.id, dados);
  else db.insert("configuracao", { tipo: "empresa", nome: "Evoé Gestão e RH", raioTolerancia: 500, ...dados });
  marcar("escritorio", new Date().toISOString());
  console.log("[ponto] Endereço do escritório configurado.");
}

async function configurarFeriados() {
  const feitos = lerMarcador().feriadosAnos || [];
  for (const ano of ANOS_FERIADOS.filter((a) => !feitos.includes(a))) {
    let nacionais;
    try {
      const r = await fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      nacionais = await r.json();
    } catch (err) {
      console.warn(`[ponto] Feriados de ${ano} não importados agora (${err.message}); nova tentativa na próxima subida.`);
      continue;
    }
    const existentes = new Set(listarFeriados().map((f) => f.data));
    const novos = [
      ...nacionais
        .filter((f) => f.date && !/carnaval/i.test(f.name))
        .map((f) => ({ data: f.date, nome: f.name, tipo: "nacional" })),
      ...FERIADOS_LOCAIS.map((f) => ({ data: `${ano}-${f.mmdd}`, nome: f.nome, tipo: f.tipo })),
    ].filter((f) => !existentes.has(f.data) && existentes.add(f.data));
    novos.forEach((f) => db.insert(COL_FERIADOS, f));
    marcar("feriadosAnos", [...(lerMarcador().feriadosAnos || []), ano]);
    console.log(`[ponto] ${novos.length} feriado(s) de ${ano} cadastrado(s).`);
  }
}

const normalizar = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

/** Vincula colaboradores sem login a um consultor com mesmo e-mail (ou mesmo nome), se houver só um. */
function vincularColaboradores() {
  if (lerMarcador().vinculoAuto) return;
  const consultores = db.readCollection("consultores").filter((c) => c.ativo !== false);
  const users = db.readCollection("users");
  const comLogin = consultores.filter((c) => users.some((u) => u.consultorId === c.id));
  const colaboradores = db.readCollection("colaboradores");
  const jaVinculados = new Set(colaboradores.map((c) => c.consultorId).filter(Boolean));
  let vinculados = 0;
  for (const colab of colaboradores.filter((c) => !c.consultorId)) {
    const porEmail = colab.email ? comLogin.filter((c) => normalizar(c.email) === normalizar(colab.email)) : [];
    const porNome = comLogin.filter((c) => normalizar(c.nome) === normalizar(colab.nome));
    const candidatos = porEmail.length === 1 ? porEmail : porNome.length === 1 ? porNome : [];
    const alvo = candidatos[0];
    if (!alvo || jaVinculados.has(alvo.id)) continue;
    db.update("colaboradores", colab.id, { consultorId: alvo.id });
    jaVinculados.add(alvo.id);
    vinculados++;
  }
  marcar("vinculoAuto", new Date().toISOString());
  console.log(`[ponto] ${vinculados} colaborador(es) vinculado(s) ao login automaticamente.`);
}

async function aplicarConfiguracaoInicial() {
  try {
    await configurarEscritorio();
    await configurarFeriados();
    vincularColaboradores();
  } catch (err) {
    console.error("[ponto] Falha na configuração inicial (o sistema segue funcionando):", err.message);
  }
}

module.exports = { aplicarConfiguracaoInicial, vincularColaboradores };
