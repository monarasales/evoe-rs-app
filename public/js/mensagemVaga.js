// Mensagem de convite enviada ao candidato (WhatsApp) e alertas de termos discriminatórios.
//
// Anti-preconceito por construção: o texto livre da vaga NUNCA é copiado para a mensagem.
// O sistema só reconhece competências/comportamentos de uma lista aprovada (abaixo) e
// monta a frase com eles — idade, gênero, aparência, estado civil etc. não têm como entrar.
// Funções puras (testes em test/mensagemVaga.test.js).

// [padrão procurado no texto da vaga, como aparece na mensagem]
const COMPETENCIAS = [
  [/organiza/i, "organização"],
  [/comunica/i, "boa comunicação"],
  [/proativ/i, "proatividade"],
  [/anal[ií]tic/i, "perfil analítico"],
  [/equipe|colaborativ|coopera/i, "trabalho em equipe"],
  [/atendimento|relacionamento|lidar com (o )?p[uú]blico|lidar com pessoas/i, "gosto por lidar com pessoas"],
  [/negocia/i, "habilidade de negociação"],
  [/lideran|liderar/i, "liderança"],
  [/detalh|precis[aã]o|minuci/i, "atenção aos detalhes"],
  [/resultado|metas/i, "foco em resultados"],
  [/criativ|inova/i, "criatividade"],
  [/empat/i, "empatia"],
  [/resili/i, "resiliência"],
  [/aprend|curios/i, "vontade de aprender"],
  [/autonom|independ/i, "autonomia"],
  [/din[aâ]mic|agilidade/i, "dinamismo"],
  [/comprometi|responsabilidade|disciplin/i, "comprometimento"],
  [/flexib|adapta/i, "flexibilidade"],
  [/persuas/i, "poder de persuasão"],
  [/planejamento|planejar/i, "planejamento"],
  [/[eé]tica|integridade/i, "ética"],
];

/** Até `max` competências reconhecidas, na ordem em que aparecem no texto. */
export function competenciasDaVaga(pagina = {}, max = 3) {
  const texto = [pagina.perfilComportamental, ...(pagina.requisitos || []), ...(pagina.diferenciais || [])].filter(Boolean).join(" \n ");
  if (!texto) return [];
  return COMPETENCIAS.map(([re, nome]) => ({ nome, pos: texto.search(re) }))
    .filter((c) => c.pos >= 0)
    .sort((a, b) => a.pos - b.pos)
    .map((c) => c.nome)
    .filter((n, i, arr) => arr.indexOf(n) === i)
    .slice(0, max);
}

const juntar = (lista) => (lista.length <= 1 ? lista.join("") : `${lista.slice(0, -1).join(", ")} e ${lista[lista.length - 1]}`);

/** Convite para o WhatsApp (negrito do WhatsApp = *texto*). */
export function mensagemConvite(vaga, link) {
  const p = vaga.pagina || {};
  const local = [p.bairro, p.cidade].filter(Boolean).join(", ");
  const detalhes = [local && `📍 ${local}`, p.modeloTrabalho, p.tipoContratacao].filter(Boolean).join(" · ");
  const comp = competenciasDaVaga(p);
  const gancho = comp.length
    ? `Buscamos alguém com ${juntar(comp)}. Se você se identifica, vamos adorar conhecer você!`
    : "Se você busca um novo desafio para crescer profissionalmente, vamos adorar conhecer você!";
  return [
    "Olá! Tudo bem? 😊",
    "A *Evoé Gestão & RH* está com uma nova oportunidade profissional que pode combinar com o seu perfil!",
    `💼 *Vaga: ${vaga.titulo}*${detalhes ? `\n${detalhes}` : ""}`,
    gancho,
    `Convidamos você a conhecer os detalhes da oportunidade e realizar sua candidatura pelo link:\n${link}`,
    "A inscrição é simples e leva poucos minutos. 💜",
    "*Evoé Gestão & RH | Conectando talentos às oportunidades certas.*",
  ].join("\n\n");
}

// ---------- Alerta de termos que podem ser discriminatórios em anúncio de vaga ----------
// (CLT art. 373-A e Lei 9.029/95). Não bloqueia: orienta quem escreve a vaga.
const TERMOS_SENSIVEIS = [
  [/\bidade\b|\bat[eé]\s*\d{2}\s*anos\b|\bentre\s*\d{2}\s*e\s*\d{2}\s*anos\b|\bmaior(es)? de \d{2}\b|\bmenor(es)? de \d{2}\b|\bjove(m|ns)\b/i, "idade"],
  [/\bsexo\b|\bmasculin[oa]s?\b|\bfeminin[oa]s?\b|\bhomens?\b|\bmulher(es)?\b|\bg[eê]nero\b/i, "sexo/gênero"],
  [/apar[eê]ncia|\bmagr[oa]s?\b|\bbonit[oa]s?\b|\baltura\b|\bpeso\b|\bestatura\b/i, "aparência física"],
  [/solteir|\bcasad[oa]s?\b|sem filhos|\bfilhos\b|gestante|gr[aá]vid|estado civil/i, "estado civil/família"],
  [/\bra[cç]a\b|cor da pele|etnia/i, "raça/cor"],
  [/religi|evang[eé]lic|cat[oó]lic|esp[ií]rita/i, "religião"],
  [/orienta[cç][aã]o sexual|heterossexual|homossexual/i, "orientação sexual"],
  [/nacionalidade|naturalidade|\bnatural de\b/i, "origem"],
];

/** Lista de { termo, tipo } encontrados no conteúdo da página da vaga. */
export function termosSensiveis(texto) {
  // "Jovem Aprendiz" é modalidade de contrato prevista em lei — não é discriminação.
  const t = String(texto || "").replace(/jovem aprendiz/gi, "");
  const achados = [];
  for (const [re, tipo] of TERMOS_SENSIVEIS) {
    const m = t.match(re);
    if (m) achados.push({ termo: m[0], tipo });
  }
  return achados;
}
