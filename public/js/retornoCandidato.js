// Retorno ao candidato (WhatsApp / e-mail / copiar): convites para entrevista, aprovação e
// devolutivas. Funções puras (testes em test/retornoCandidato.test.js).
//
// Boas práticas aplicadas nos modelos:
//  - linguagem neutra ("você", "pessoa candidata"): o mesmo texto serve para qualquer pessoa,
//    sem risco de "selecionada/convidá-la" para um candidato homem;
//  - devolutiva negativa NUNCA traz o motivo da reprovação (fica só no registro interno) —
//    evita discussão e risco trabalhista; agradece, valoriza e mantém no banco de talentos;
//  - convite sempre com data, dia da semana, horário, formato e pedido de confirmação.

export const TIPOS_RETORNO = [
  { id: "convite_evoe", rotulo: "Convite: entrevista com a Evoé", positivo: true, entrevista: true, fase: "Seleção com RH" },
  { id: "convite_gestor", rotulo: "Passou na Evoé: entrevista com o gestor", positivo: true, entrevista: true, fase: "Seleção com gestor" },
  { id: "aprovado", rotulo: "Aprovado(a) pelo gestor", positivo: true, fase: "Aprovado" },
  { id: "reprovado_evoe", rotulo: "Não seguiu na seleção da Evoé", positivo: false, fase: "Reprovado" },
  { id: "reprovado_gestor", rotulo: "Não seguiu na seleção do gestor", positivo: false, fase: "Reprovado" },
];

const ASSINATURA = "{CONSULTOR} | *Evoé Gestão & RH*";

export const MODELOS_RETORNO = {
  convite_evoe: [
    "Olá, {NOME}! Tudo bem? 😊",
    "Agradecemos seu interesse na vaga de *{VAGA}*. Seu perfil chamou a nossa atenção e queremos conhecer você melhor! 🎉",
    "Convidamos você para uma entrevista com a nossa equipe:",
    "{ENTREVISTA}",
    "Pode confirmar sua presença respondendo esta mensagem? Qualquer dúvida, estou à disposição.",
    ASSINATURA,
  ].join("\n\n"),
  convite_gestor: [
    "Olá, {NOME}! Tudo bem? 😊",
    "Temos uma ótima notícia: você avançou para a próxima fase do processo seletivo da vaga de *{VAGA}*! 🎉",
    "A próxima etapa é a entrevista com a empresa:",
    "{ENTREVISTA}",
    "Parabéns por chegar até aqui! Fico no aguardo da sua confirmação. 💜",
    ASSINATURA,
  ].join("\n\n"),
  aprovado: [
    "Olá, {NOME}! Tudo bem? 😊",
    "Que alegria compartilhar esta notícia: você foi a pessoa escolhida para a vaga de *{VAGA}*! 🎉🥳",
    "Parabéns pela dedicação em todo o processo seletivo. Em breve entraremos em contato com as orientações sobre os próximos passos da admissão.",
    "Desejamos muito sucesso nesta nova fase! 💜",
    ASSINATURA,
  ].join("\n\n"),
  reprovado_evoe: [
    "Olá, {NOME}! Tudo bem?",
    "Agradecemos muito o seu interesse e o tempo dedicado ao processo seletivo da vaga de *{VAGA}*.",
    "Após uma análise cuidadosa, neste momento seguiremos com outros perfis mais alinhados aos requisitos desta oportunidade.",
    "Seu currículo continua no nosso banco de talentos e poderemos falar com você em futuras oportunidades. Acompanhe nossas vagas: {VAGAS}",
    "Desejamos muito sucesso na sua trajetória! 💜",
    ASSINATURA,
  ].join("\n\n"),
  reprovado_gestor: [
    "Olá, {NOME}! Tudo bem?",
    "Queremos agradecer sua participação em todas as etapas do processo seletivo da vaga de *{VAGA}*, incluindo a entrevista com a empresa.",
    "Após a avaliação final, a empresa decidiu seguir com outra pessoa candidata nesta oportunidade.",
    "Você chegou à fase final, e isso mostra o valor do seu perfil! Seu currículo continua no nosso banco de talentos e vamos lembrar de você nas próximas oportunidades. Acompanhe nossas vagas: {VAGAS}",
    "Agradecemos pela confiança e desejamos muito sucesso! 💜",
    ASSINATURA,
  ].join("\n\n"),
};

export const MARCADORES_RETORNO = [
  ["{NOME}", "primeiro nome do candidato"],
  ["{VAGA}", "nome da vaga"],
  ["{ENTREVISTA}", "data, dia da semana, horário e local/link (só nos convites)"],
  ["{CONSULTOR}", "primeiro nome de quem envia"],
  ["{VAGAS}", "link da página com todas as vagas abertas"],
];

const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
export const primeiroNome = (n) => {
  const p = String(n || "").trim().split(/\s+/)[0] || "";
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : "";
};

/** "2026-10-08" → "08/10 (quinta-feira)". */
export function dataComDia(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return "";
  const dia = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
  return `${m[3]}/${m[2]} (${DIAS[dia]})`;
}

/** Bloco da entrevista: { data (ISO), horario "15:00", formato "Online"|"Presencial", local }. */
export function blocoEntrevista(e = {}) {
  const linhas = [];
  if (e.data) linhas.push(`📅 Data: ${dataComDia(e.data)}`);
  if (e.horario) linhas.push(`🕐 Horário: ${e.horario}`);
  if (e.formato === "Presencial") linhas.push(`📍 Presencial${e.local ? `: ${e.local}` : ""}`);
  else if (e.formato) linhas.push(`💻 Online${e.local ? `, pelo link:\n${e.local}` : ""}`);
  return linhas.join("\n");
}

/** Monta a mensagem final. `modelos` = modelos editados em Configurações (opcional). */
export function montarRetorno(tipo, dados = {}, modelos = {}) {
  const modelo = (modelos && modelos[tipo]) || MODELOS_RETORNO[tipo] || "";
  return modelo
    .replace(/\{NOME\}/g, primeiroNome(dados.nome))
    .replace(/\{VAGA\}/g, dados.vaga || "")
    .replace(/\{ENTREVISTA\}/g, blocoEntrevista(dados.entrevista))
    .replace(/\{CONSULTOR\}/g, primeiroNome(dados.consultor))
    .replace(/\{VAGAS\}/g, dados.linkVagas || "")
    .replace(/^ \| /gm, "") // sem nome de consultor: assinatura só "Evoé"
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Situação sugerida conforme a fase atual do candidato. */
export function tipoSugerido(c = {}) {
  const fase = c.fase || "Recrutamento";
  if (fase === "Reprovado") return c.reprovacao && c.reprovacao.fase === "Seleção com gestor" ? "reprovado_gestor" : "reprovado_evoe";
  if (fase === "Aprovado") return "aprovado";
  if (fase === "Seleção com gestor") return "aprovado";
  if (fase === "Seleção com RH" || fase === "Checagem de referência") return "convite_gestor";
  return "convite_evoe";
}

/**
 * Lê o telefone como foi gravado (com ou sem +55, zero na frente, dois números colados)
 * e devolve { numero: DDD+número (10/11 dígitos) ou "", problema: texto ou "" }.
 * "incompleto" = 11 dígitos começando com 55 mas sem o 9 do celular: o candidato digitou
 * +55 e o formulário antigo cortou os últimos dígitos (não dá para recuperar).
 */
export function lerTelefone(tel) {
  let d = String(tel || "").replace(/\D/g, "").replace(/^0+/, "");
  if (!d) return { numero: "", problema: "" };
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (d.length > 11) d = d.slice(0, d[2] === "9" ? 11 : 10); // dois números colados: usa o primeiro
  if (d.length === 11 && d[2] !== "9") {
    return { numero: "", problema: d.startsWith("55") ? "Número incompleto (o +55 entrou no lugar do DDD e o final foi cortado). Fale por e-mail e peça o número correto." : "Número inválido." };
  }
  if (d.length < 10) return { numero: "", problema: "Número sem DDD ou incompleto." };
  return { numero: d, problema: "" };
}

/** Telefone para o wa.me (com DDI 55) ou "" se inválido. */
export function telefoneWhatsapp(tel) {
  const { numero } = lerTelefone(tel);
  return numero ? `55${numero}` : "";
}
