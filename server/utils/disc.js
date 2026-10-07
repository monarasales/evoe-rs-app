// Teste de perfil comportamental DISC da Evoé.
//
// Base teórica: modelo DISC de William Moulton Marston ("Emotions of Normal People",
// 1928), de domínio público — Dominância, Influência, eStabilidade e Conformidade.
// O questionário abaixo é PRÓPRIO da Evoé (não reproduz instrumentos comerciais).
// Formato de escolha forçada "mais / menos", o mais usado no mercado: em cada grupo
// de 4 palavras (uma de cada fator), a pessoa marca a que MAIS e a que MENOS a descreve.
//
// Importante: DISC é ferramenta de autoconhecimento e perfil comportamental, não é
// teste psicológico do SATEPSI/CFP. Deve ser usado como informação complementar,
// nunca como critério único de aprovação ou eliminação.
//
// As funções de pontuação são PURAS (testes em test/disc.test.js).

const crypto = require("crypto");

const VERSAO = "evoe-disc-1";
const FATORES = ["D", "I", "S", "C"];

// Cada grupo: [D, I, S, C]. A ordem exibida ao candidato é embaralhada e os códigos
// enviados à página pública não revelam o fator de cada palavra.
const GRUPOS = [
  ["Decidido", "Comunicativo", "Paciente", "Cuidadoso"],
  ["Direto", "Entusiasmado", "Calmo", "Preciso"],
  ["Ousado", "Persuasivo", "Leal", "Organizado"],
  ["Competitivo", "Otimista", "Prestativo", "Detalhista"],
  ["Determinado", "Sociável", "Tranquilo", "Analítico"],
  ["Assertivo", "Expressivo", "Compreensivo", "Metódico"],
  ["Exigente", "Inspirador", "Estável", "Criterioso"],
  ["Corajoso", "Animado", "Gentil", "Disciplinado"],
  ["Independente", "Carismático", "Conciliador", "Perfeccionista"],
  ["Firme", "Falante", "Constante", "Lógico"],
  ["Objetivo", "Espontâneo", "Bom ouvinte", "Sistemático"],
  ["Enérgico", "Popular", "Cooperativo", "Reservado"],
  ["Desafiador", "Motivador", "Acolhedor", "Planejador"],
  ["Prático", "Alegre", "Amável", "Rigoroso"],
  ["Autoconfiante", "Convincente", "Sereno", "Exato"],
  ["Ágil", "Divertido", "Confiável", "Cauteloso"],
  ["Persistente", "Criativo", "Harmonioso", "Questionador"],
  ["Arrojado", "Envolvente", "Modesto", "Ponderado"],
  ["Focado em resultados", "Extrovertido", "Dedicado", "Formal"],
  ["Impaciente", "Impulsivo", "Acomodado", "Crítico"],
  ["Teimoso", "Desorganizado", "Indeciso", "Desconfiado"],
  ["Autoritário", "Exagerado", "Resistente a mudanças", "Inflexível com regras"],
  ["Ambicioso", "Empolgado", "Sossegado", "Minucioso"],
  ["Pioneiro", "Influente", "Equilibrado", "Correto"],
];

const PERFIS = {
  D: {
    nome: "Dominância",
    titulo: "Executor",
    resumo: "Foco em resultados, desafios e ação. Decide rápido, assume o comando e gosta de autonomia.",
    candidato: "Você tende a ser direto(a), determinado(a) e movido(a) por desafios e resultados.",
    fortes: ["Tomada de decisão rápida", "Foco em metas e resultados", "Coragem para assumir riscos", "Iniciativa e senso de urgência"],
    atencao: ["Pode soar impaciente ou autoritário", "Tende a ouvir pouco sob pressão", "Pode passar por cima de detalhes e processos"],
    comunicacao: "Seja breve, objetivo e focado no resultado. Apresente opções e deixe a decisão com ele(a).",
    ambiente: "Desafios, autonomia, metas claras e espaço para liderar.",
  },
  I: {
    nome: "Influência",
    titulo: "Comunicador",
    resumo: "Foco em pessoas, entusiasmo e persuasão. Cria conexões com facilidade e motiva o grupo.",
    candidato: "Você tende a ser comunicativo(a), otimista e a se conectar facilmente com as pessoas.",
    fortes: ["Comunicação e persuasão", "Entusiasmo e otimismo", "Facilidade de relacionamento e networking", "Criatividade e energia para o grupo"],
    atencao: ["Pode se dispersar e perder prazos", "Tende a evitar detalhes e rotinas", "Pode prometer mais do que consegue entregar"],
    comunicacao: "Seja amistoso e aberto, dê espaço para ideias e reconheça as conquistas em público.",
    ambiente: "Interação com pessoas, reconhecimento, variedade e clima leve.",
  },
  S: {
    nome: "Estabilidade",
    titulo: "Planejador",
    resumo: "Foco em cooperação, constância e segurança. Paciente, leal e ótimo para manter o time unido.",
    candidato: "Você tende a ser paciente, colaborativo(a) e confiável, valorizando um ambiente harmonioso.",
    fortes: ["Constância e confiabilidade", "Trabalho em equipe e cooperação", "Escuta ativa e empatia", "Paciência e lealdade"],
    atencao: ["Pode resistir a mudanças bruscas", "Tende a evitar conflitos necessários", "Pode demorar a decidir sob pressão"],
    comunicacao: "Seja calmo e sincero, explique o porquê das mudanças com antecedência e ofereça apoio.",
    ambiente: "Estabilidade, papéis claros, rotina previsível e clima de colaboração.",
  },
  C: {
    nome: "Conformidade",
    titulo: "Analista",
    resumo: "Foco em qualidade, precisão e regras. Analítico, organizado e criterioso nos detalhes.",
    candidato: "Você tende a ser analítico(a), organizado(a) e cuidadoso(a) com qualidade e precisão.",
    fortes: ["Precisão e atenção aos detalhes", "Pensamento analítico e lógico", "Organização e método", "Compromisso com qualidade e normas"],
    atencao: ["Pode ser perfeccionista e lento para concluir", "Tende a ser crítico consigo e com os outros", "Pode evitar exposição e riscos"],
    comunicacao: "Traga dados, fatos e detalhes por escrito; dê tempo para análise e evite pressionar.",
    ambiente: "Processos claros, padrões de qualidade, tempo para analisar e pouca improvisação.",
  },
};

// Código opaco de cada palavra, diferente para cada candidato (semente = token do teste):
// quem olha a página não consegue deduzir o fator pelo código.
const codigoPalavra = (g, f, semente = "") =>
  `g${g}-${crypto.createHash("sha256").update(`${semente}|${g}|${f}|evoe-disc`).digest("hex").slice(0, 8)}`;

/** Embaralhamento determinístico (mesmo candidato vê sempre a mesma ordem). */
function embaralhar(lista, semente) {
  let x = 0;
  for (const ch of String(semente)) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    x = (x * 1103515245 + 12345) >>> 0;
    const j = x % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Perguntas para a página pública: palavras com códigos opacos e ordem embaralhada. */
function perguntas(semente = "") {
  return GRUPOS.map((palavras, g) => ({
    grupo: g,
    opcoes: embaralhar(
      FATORES.map((f, i) => ({ id: codigoPalavra(g, f, semente), texto: palavras[i] })),
      `${semente}-${g}`
    ),
  }));
}

function fatorDoCodigo(codigo, semente) {
  const m = /^g(\d{1,2})-[0-9a-f]{8}$/.exec(String(codigo || ""));
  if (!m || Number(m[1]) >= GRUPOS.length) return null;
  const grupo = Number(m[1]);
  const fator = FATORES.find((f) => codigoPalavra(grupo, f, semente) === codigo);
  return fator ? { grupo, fator } : null;
}

/**
 * Valida as respostas e calcula o perfil. Lança Error se incompleto/inválido.
 * respostas: [{ grupo, mais: codigo, menos: codigo }] — uma por grupo.
 * semente: a mesma usada em perguntas() (token do teste do candidato).
 */
function pontuar(respostas, semente = "") {
  if (!Array.isArray(respostas) || respostas.length !== GRUPOS.length) {
    throw new Error(`Responda todos os ${GRUPOS.length} grupos.`);
  }
  const mais = { D: 0, I: 0, S: 0, C: 0 };
  const menos = { D: 0, I: 0, S: 0, C: 0 };
  const vistos = new Set();
  for (const r of respostas) {
    const a = fatorDoCodigo(r && r.mais, semente);
    const b = fatorDoCodigo(r && r.menos, semente);
    if (!a || !b || a.grupo !== b.grupo) throw new Error("Resposta inválida.");
    if (vistos.has(a.grupo)) throw new Error("Grupo respondido duas vezes.");
    if (a.fator === b.fator) throw new Error("Em cada grupo, escolha palavras diferentes para MAIS e MENOS.");
    vistos.add(a.grupo);
    mais[a.fator]++;
    menos[b.fator]++;
  }
  const n = GRUPOS.length;
  const bruto = Object.fromEntries(FATORES.map((f) => [f, mais[f] - menos[f]])); // -24..+24
  // Intensidade 0–100 de cada fator (independente) e distribuição % que soma 100.
  const intensidade = Object.fromEntries(FATORES.map((f) => [f, Math.round(((bruto[f] + n) / (2 * n)) * 100)]));
  const somaInt = FATORES.reduce((t, f) => t + intensidade[f], 0) || 1;
  const distribuicao = Object.fromEntries(FATORES.map((f) => [f, Math.round((intensidade[f] / somaInt) * 100)]));

  const ordem = [...FATORES].sort((x, y) => bruto[y] - bruto[x] || FATORES.indexOf(x) - FATORES.indexOf(y));
  const [primario, segundo] = ordem;
  // Secundário só quando é relevante: acima da média e perto do primário.
  const secundario = bruto[segundo] > 0 && bruto[primario] - bruto[segundo] <= 8 ? segundo : null;
  const codigo = primario + (secundario || "");
  return { mais, menos, bruto, intensidade, distribuicao, primario, secundario, perfil: codigo };
}

/** Nome do perfil para exibição, ex.: "DI — Executor / Comunicador". */
function nomePerfil(resultado) {
  const p = PERFIS[resultado.primario];
  const s = resultado.secundario ? PERFIS[resultado.secundario] : null;
  return `${resultado.perfil} — ${p.titulo}${s ? ` / ${s.titulo}` : ""}`;
}

module.exports = { VERSAO, FATORES, GRUPOS, PERFIS, perguntas, pontuar, nomePerfil, codigoPalavra };
