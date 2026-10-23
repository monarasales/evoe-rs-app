// Perfil da vaga preenchido pelo CLIENTE (link enviado pela Evoé): empresa, vaga, cultura,
// competências, jornada por dia da semana e remuneração/benefícios.
// Coleção "solicitacoesVaga". Status: Link enviado → Aguardando validação →
// (Ajuste solicitado → Aguardando validação) → Validado | Arquivado.
// Funções puras de normalização e de montagem da vaga (testes em test/perfilVaga.test.js).

const crypto = require("crypto");

const STATUS = ["Link enviado", "Aguardando validação", "Ajuste solicitado", "Validado", "Arquivado"];
const DIAS = [
  ["seg", "Seg"],
  ["ter", "Ter"],
  ["qua", "Qua"],
  ["qui", "Qui"],
  ["sex", "Sex"],
  ["sab", "Sáb"],
  ["dom", "Dom"],
];
const OPCOES = {
  motivos: ["Aumento de quadro", "Substituição", "Nova função na empresa"],
  tiposContratacao: ["CLT", "PJ", "Estágio", "Temporário", "Jovem Aprendiz", "Freelancer"],
  modelosTrabalho: ["Presencial", "Híbrido", "Remoto"],
  ritmos: ["Acelerado, com muitas demandas ao mesmo tempo", "Moderado e organizado", "Tranquilo, com rotina bem definida"],
  liderancas: ["Próxima, acompanha de perto", "Dá autonomia e cobra resultado", "Mais diretiva, com regras claras"],
  ambientes: ["Formal", "Equilibrado", "Descontraído"],
  comportamentais: [
    "Comunicação",
    "Proatividade",
    "Organização",
    "Trabalho em equipe",
    "Foco em resultados",
    "Atenção aos detalhes",
    "Resiliência",
    "Empatia",
    "Liderança",
    "Negociação",
    "Flexibilidade",
    "Autonomia",
    "Criatividade",
    "Ética",
    "Comprometimento",
    "Vontade de aprender",
    "Relacionamento com clientes",
    "Planejamento",
  ],
  escolaridades: ["Ensino fundamental", "Ensino médio", "Técnico", "Superior em andamento", "Superior completo", "Pós-graduação"],
  alimentacao: ["Não oferece", "Vale-refeição", "Vale-alimentação", "VR e VA", "Refeição no local"],
  periodicidades: ["por dia", "por mês"],
  outrosBeneficios: ["Seguro de vida", "Gympass / Wellhub", "PLR / bônus", "Day off no aniversário", "Auxílio home office", "Convênio farmácia", "Estacionamento", "Auxílio educação", "Cesta básica", "Fardamento"],
};

const t = (v, max = 300) => String(v == null ? "" : v).trim().slice(0, max);
const umDe = (v, lista) => (lista.includes(v) ? v : "");
const listaTxt = (v, max = 30, tam = 200) =>
  (Array.isArray(v) ? v : [])
    .map((x) => t(x, tam))
    .filter(Boolean)
    .slice(0, max);
const hora = (v) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || "")) ? String(v) : "");
const dinheiro = (v) => {
  let s = String(v == null ? "" : v).replace(/[^\d,.]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};
const sim = (v) => v === true || v === "sim" || v === "true";

/** Normaliza tudo o que veio do formulário do cliente (campos desconhecidos são ignorados). */
function normalizarPerfil(b = {}) {
  const e = b.empresa || {};
  const c = b.contato || {};
  const v = b.vaga || {};
  const cu = b.cultura || {};
  const te = b.tecnicas || {};
  const jo = b.jornada || {};
  const re = b.remuneracao || {};
  const dias = {};
  for (const [k] of DIAS) {
    const d = (jo.dias || {})[k];
    if (d && d.ativo) dias[k] = { ativo: true, inicio: hora(d.inicio), fim: hora(d.fim) };
  }
  return {
    empresa: { nome: t(e.nome, 150), cnpj: t(e.cnpj, 20), segmento: t(e.segmento, 120), endereco: t(e.endereco, 200), bairro: t(e.bairro, 100), cidade: t(e.cidade, 100) },
    contato: { nome: t(c.nome, 120), cargo: t(c.cargo, 100), email: t(c.email, 160).toLowerCase(), whatsapp: t(c.whatsapp, 25) },
    vaga: {
      cargo: t(v.cargo, 150),
      quantidade: Math.max(1, Math.min(99, parseInt(v.quantidade, 10) || 1)),
      motivo: umDe(v.motivo, OPCOES.motivos),
      tipoContratacao: umDe(v.tipoContratacao, OPCOES.tiposContratacao),
      modeloTrabalho: umDe(v.modeloTrabalho, OPCOES.modelosTrabalho),
      localTrabalho: t(v.localTrabalho, 200),
      inicioDesejado: t(v.inicioDesejado, 60),
    },
    cultura: {
      valores: t(cu.valores, 1500),
      ritmo: umDe(cu.ritmo, OPCOES.ritmos),
      lideranca: umDe(cu.lideranca, OPCOES.liderancas),
      ambiente: umDe(cu.ambiente, OPCOES.ambientes),
      valoriza: t(cu.valoriza, 1500),
    },
    comportamentais: listaTxt(b.comportamentais, 20, 60).filter((x) => OPCOES.comportamentais.includes(x)),
    comportamentaisOutros: t(b.comportamentaisOutros, 500),
    naoContratar: t(b.naoContratar, 1500),
    tecnicas: {
      atividades: listaTxt(te.atividades, 30, 300),
      escolaridade: umDe(te.escolaridade, OPCOES.escolaridades),
      formacao: t(te.formacao, 200),
      experiencia: t(te.experiencia, 300),
      ferramentas: t(te.ferramentas, 500),
      cnh: t(te.cnh, 60),
      outros: t(te.outros, 800),
    },
    jornada: { dias, intervalo: t(jo.intervalo, 80), observacao: t(jo.observacao, 300) },
    remuneracao: {
      salario: dinheiro(re.salario),
      salarioACombinar: sim(re.salarioACombinar),
      comissao: { tem: sim(re.comissao && re.comissao.tem), descricao: t(re.comissao && re.comissao.descricao, 300) },
      alimentacao: {
        tipo: umDe(re.alimentacao && re.alimentacao.tipo, OPCOES.alimentacao),
        valor: dinheiro(re.alimentacao && re.alimentacao.valor),
        // sem escolha explícita, vale o padrão mostrado na tela ("por dia")
        periodicidade: umDe(re.alimentacao && re.alimentacao.periodicidade, OPCOES.periodicidades) || (dinheiro(re.alimentacao && re.alimentacao.valor) ? "por dia" : ""),
      },
      valeTransporte: sim(re.valeTransporte),
      planoSaude: { tem: sim(re.planoSaude && re.planoSaude.tem), operadora: t(re.planoSaude && re.planoSaude.operadora, 100), detalhes: t(re.planoSaude && re.planoSaude.detalhes, 200) },
      planoOdonto: { tem: sim(re.planoOdonto && re.planoOdonto.tem), operadora: t(re.planoOdonto && re.planoOdonto.operadora, 100) },
      outros: listaTxt(re.outros, 15, 60).filter((x) => OPCOES.outrosBeneficios.includes(x)),
      outrosTexto: t(re.outrosTexto, 500),
    },
    observacoes: t(b.observacoes, 2000),
  };
}

/** O que falta para o cliente conseguir enviar (mensagens amigáveis). */
function pendencias(p) {
  const f = [];
  if (!p.empresa.nome) f.push("Nome da empresa");
  if (!p.contato.nome) f.push("Seu nome");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.contato.email)) f.push("Seu e-mail");
  if (String(p.contato.whatsapp).replace(/\D/g, "").length < 10) f.push("Seu WhatsApp com DDD");
  if (!p.vaga.cargo) f.push("Cargo da vaga");
  if (!Object.keys(p.jornada.dias).length) f.push("Dias e horários de trabalho");
  else if (Object.values(p.jornada.dias).some((d) => !d.inicio || !d.fim)) f.push("Horário de entrada e saída de cada dia marcado");
  if (!p.remuneracao.salario && !p.remuneracao.salarioACombinar) f.push("Salário");
  return f;
}

const minutos = (h) => {
  const [a, b] = h.split(":").map(Number);
  return a * 60 + b;
};
const brl = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** "Seg a Sex, 08:00 às 17:00 · Sáb, 08:00 às 12:00" + total semanal (descontando intervalo informado em minutos/horas). */
function resumoJornada(jornada = {}) {
  const dias = jornada.dias || {};
  const grupos = [];
  for (const [k, rot] of DIAS) {
    const d = dias[k];
    if (!d || !d.ativo || !d.inicio || !d.fim) continue;
    const faixa = `${d.inicio} às ${d.fim}`;
    const ult = grupos[grupos.length - 1];
    const idx = DIAS.findIndex(([x]) => x === k);
    if (ult && ult.faixa === faixa && ult.ultimoIdx === idx - 1) {
      ult.fim = rot;
      ult.ultimoIdx = idx;
    } else grupos.push({ ini: rot, fim: rot, faixa, ultimoIdx: idx });
  }
  const texto = grupos.map((g) => `${g.ini === g.fim ? g.ini : `${g.ini} a ${g.fim}`}, ${g.faixa}`).join(" · ");
  let total = 0;
  for (const d of Object.values(dias)) if (d.ativo && d.inicio && d.fim) total += Math.max(0, minutos(d.fim) - minutos(d.inicio));
  return { texto, horasSemana: Math.round((total / 60) * 10) / 10 };
}

/** Lista de benefícios em texto curto (usada na página pública da vaga e no resumo interno). */
function listaBeneficios(r) {
  const b = [];
  const a = r.alimentacao || {};
  if (a.tipo && a.tipo !== "Não oferece") b.push(`${a.tipo}${a.valor ? ` de ${brl(a.valor)}${a.periodicidade ? ` ${a.periodicidade}` : ""}` : ""}`);
  if (r.valeTransporte) b.push("Vale-transporte");
  if (r.planoSaude && r.planoSaude.tem) b.push(`Plano de saúde${r.planoSaude.operadora ? ` (${r.planoSaude.operadora})` : ""}`);
  if (r.planoOdonto && r.planoOdonto.tem) b.push(`Plano odontológico${r.planoOdonto.operadora ? ` (${r.planoOdonto.operadora})` : ""}`);
  (r.outros || []).forEach((x) => b.push(x));
  return b;
}

function textoSalario(r) {
  if (r.salarioACombinar && !r.salario) return "A combinar";
  return `${r.salario ? brl(r.salario) : ""}${r.comissao && r.comissao.tem ? `${r.salario ? " + " : ""}comissão${r.comissao.descricao ? ` (${r.comissao.descricao})` : ""}` : ""}`;
}

/**
 * Monta a vaga a partir do perfil validado:
 *  - perfilVaga (interno, completo — inclui "perfil que não contrata", que NUNCA vai para a página pública);
 *  - pagina (pública: responsabilidades, requisitos, competências, salário, benefícios, horário, local).
 */
function montarVaga(p) {
  const j = resumoJornada(p.jornada);
  const r = p.remuneracao;
  const beneficios = listaBeneficios(r);
  const comp = [...p.comportamentais, ...(p.comportamentaisOutros ? [p.comportamentaisOutros] : [])];
  const sec = (titulo, linhas) => {
    const l = linhas.filter(Boolean);
    return l.length ? `${titulo}\n${l.map((x) => `• ${x}`).join("\n")}` : "";
  };
  const perfilVaga = [
    `PERFIL ENVIADO PELO CLIENTE — ${p.empresa.nome}${p.contato.nome ? ` (${p.contato.nome}${p.contato.cargo ? `, ${p.contato.cargo}` : ""})` : ""}`,
    sec("VAGA", [
      `${p.vaga.cargo} — ${p.vaga.quantidade} vaga(s)`,
      p.vaga.motivo && `Motivo: ${p.vaga.motivo}`,
      [p.vaga.tipoContratacao, p.vaga.modeloTrabalho].filter(Boolean).join(" · "),
      p.vaga.localTrabalho && `Local: ${p.vaga.localTrabalho}`,
      p.vaga.inicioDesejado && `Início desejado: ${p.vaga.inicioDesejado}`,
    ]),
    sec("CULTURA DA EMPRESA", [
      p.cultura.valores && `Valores: ${p.cultura.valores}`,
      p.cultura.ritmo && `Ritmo: ${p.cultura.ritmo}`,
      p.cultura.lideranca && `Liderança: ${p.cultura.lideranca}`,
      p.cultura.ambiente && `Ambiente: ${p.cultura.ambiente}`,
      p.cultura.valoriza && `O que mais valorizam: ${p.cultura.valoriza}`,
    ]),
    sec("COMPETÊNCIAS COMPORTAMENTAIS DESEJÁVEIS", comp),
    sec("PERFIL QUE A EMPRESA NÃO CONTRATA (uso interno — não divulgar)", [p.naoContratar]),
    sec("COMPETÊNCIAS TÉCNICAS / O QUE PRECISA SABER FAZER", [
      ...p.tecnicas.atividades,
      p.tecnicas.escolaridade && `Escolaridade: ${p.tecnicas.escolaridade}${p.tecnicas.formacao ? ` (${p.tecnicas.formacao})` : ""}`,
      p.tecnicas.experiencia && `Experiência: ${p.tecnicas.experiencia}`,
      p.tecnicas.ferramentas && `Ferramentas/sistemas: ${p.tecnicas.ferramentas}`,
      p.tecnicas.cnh && `CNH: ${p.tecnicas.cnh}`,
      p.tecnicas.outros,
    ]),
    sec("JORNADA", [j.texto && `${j.texto} (${j.horasSemana}h/semana)`, p.jornada.intervalo && `Intervalo: ${p.jornada.intervalo}`, p.jornada.observacao]),
    sec("REMUNERAÇÃO E BENEFÍCIOS", [textoSalario(r) && `Salário: ${textoSalario(r)}`, ...beneficios, p.remuneracao.planoSaude.detalhes && `Plano de saúde: ${p.remuneracao.planoSaude.detalhes}`, r.outrosTexto]),
    sec("OBSERVAÇÕES DO CLIENTE", [p.observacoes]),
  ]
    .filter(Boolean)
    .join("\n\n");

  const requisitos = [
    p.tecnicas.escolaridade && `${p.tecnicas.escolaridade}${p.tecnicas.formacao ? ` em ${p.tecnicas.formacao}` : ""}`,
    p.tecnicas.experiencia && `Experiência: ${p.tecnicas.experiencia}`,
    p.tecnicas.cnh && `CNH ${p.tecnicas.cnh}`,
  ].filter(Boolean);
  const local = p.vaga.localTrabalho || [p.empresa.bairro, p.empresa.cidade].filter(Boolean).join(", ");
  return {
    titulo: p.vaga.cargo,
    perfilVaga,
    salario: r.salario || 0,
    pagina: {
      missao: "",
      objetivos: [],
      responsabilidades: p.tecnicas.atividades.map((a) => ({ texto: a, frequencia: "" })),
      requisitos,
      diferenciais: [],
      perfilComportamental: comp.length ? `Buscamos alguém com: ${comp.join(", ")}.` : "",
      ferramentas: p.tecnicas.ferramentas,
      salario: textoSalario(r),
      beneficios,
      horario: [j.texto, p.jornada.intervalo && `intervalo de ${p.jornada.intervalo}`].filter(Boolean).join(" · "),
      bairro: p.empresa.bairro || "",
      cidade: p.empresa.cidade || "",
      tipoContratacao: p.vaga.tipoContratacao,
      modeloTrabalho: p.vaga.modeloTrabalho,
    },
    local,
  };
}

/** Mensagem padrão ao cliente quando o perfil é validado (editável antes de enviar). */
function mensagemValidacao(s) {
  const nome = String((s.dados && s.dados.contato && s.dados.contato.nome) || "").trim().split(/\s+/)[0];
  const cargo = (s.dados && s.dados.vaga && s.dados.vaga.cargo) || "a vaga";
  return [
    `Olá${nome ? `, ${nome}` : ""}! Tudo bem? 😊`,
    `Aqui é a Monara, da Evoé Gestão & RH. Recebemos e validamos o perfil da vaga de *${cargo}*. ✅`,
    "Já iniciamos o processo de recrutamento e seleção e vamos manter você informado(a) a cada etapa.",
    "Obrigada pela confiança e pela parceria! 💜",
  ].join("\n\n");
}

const novoToken = () => crypto.randomBytes(12).toString("base64url");

module.exports = { STATUS, DIAS, OPCOES, normalizarPerfil, pendencias, resumoJornada, listaBeneficios, textoSalario, montarVaga, mensagemValidacao, novoToken };
