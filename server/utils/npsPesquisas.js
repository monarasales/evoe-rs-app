// Pesquisas NPS: criação (quando a vaga é fechada), contatos do cliente, envio por
// e-mail (automático) e link pronto de WhatsApp (envio em 1 clique pelo consultor).
// Coleção "pesquisasNps" — uma pesquisa por vaga; respostas nunca são apagadas.

const crypto = require("crypto");
const db = require("../db");
const { notify } = require("./notify");
const { enviarEmail, emailConfigurado } = require("./mailer");

const COL = "pesquisasNps";

const primeiroNome = (n) => String(n || "").trim().split(/\s+/)[0] || "";
const soDigitos = (t) => String(t || "").replace(/\D/g, "");

/** Contatos do cliente: cadastro da empresa no CRM + e-mails usados nos contratos da vaga/empresa. */
function contatosDaVaga(vaga) {
  const empresa = db.findById("empresas", vaga.empresaId) || {};
  const contratos = db.readCollection("contratos").filter((c) => c.vagaId === vaga.id || c.empresaId === vaga.empresaId);
  const emails = [empresa.emailContato, ...contratos.map((c) => c.emailEnviadoPara)]
    .map((e) => String(e || "").trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  return {
    empresaNome: empresa.nome || "",
    contatoNome: empresa.contatoResponsavel || "",
    emails: [...new Set(emails)],
    whatsapp: soDigitos(empresa.whatsappContato),
  };
}

const linkPesquisa = (p) => `${p.base}/avaliacao/${p.token}`;

function mensagemWhatsapp(p) {
  return (
    `Olá${p.contatoNome ? `, ${primeiroNome(p.contatoNome)}` : ""}! Aqui é da Evoé Gestão e RH. ` +
    `Concluímos o processo seletivo da vaga *${p.vagaTitulo}* e queremos muito ouvir você. ` +
    `São 6 perguntas rápidas (1 minuto): ${linkPesquisa(p)} — Obrigado pela parceria!`
  );
}

function linkWhatsapp(p) {
  const tel = p.whatsapp && p.whatsapp.length >= 10 ? (p.whatsapp.startsWith("55") ? p.whatsapp : `55${p.whatsapp}`) : "";
  return `https://wa.me/${tel}?text=${encodeURIComponent(mensagemWhatsapp(p))}`;
}

async function enviarPorEmail(p, lembrete = false) {
  if (!p.emails.length) return { ok: false, erro: "Empresa sem e-mail de contato no CRM/contrato." };
  if (!emailConfigurado()) return { ok: false, erro: "Envio de e-mail não configurado no servidor." };
  try {
    await enviarEmail({
      para: p.emails.join(", "),
      assunto: `${lembrete ? "Lembrete: " : ""}Como foi o processo seletivo da vaga ${p.vagaTitulo}? — Evoé Gestão e RH`,
      texto:
        `Olá${p.contatoNome ? `, ${primeiroNome(p.contatoNome)}` : ""}!\n\n` +
        `Concluímos o processo seletivo da vaga "${p.vagaTitulo}"${p.empresaNome ? ` para a ${p.empresaNome}` : ""}. ` +
        `Sua opinião é muito importante para melhorarmos sempre.\n\n` +
        `Responda à pesquisa em 1 minuto (6 perguntas):\n${linkPesquisa(p)}\n\n` +
        `Muito obrigado pela parceria!\nEquipe Evoé Gestão e RH`,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

function registrarEnvio(p, envio) {
  const atual = db.findById(COL, p.id);
  return db.update(COL, p.id, { envios: [...(atual.envios || []), { em: new Date().toISOString(), ...envio }] });
}

/**
 * Cria a pesquisa da vaga (se ainda não existir), envia o e-mail e avisa consultor e gestão
 * para enviar pelo WhatsApp. Nunca lança erro: falha no envio fica registrada na pesquisa.
 */
async function criarParaVaga(vaga, { por = "Sistema", base }) {
  const existente = db.readCollection(COL).find((p) => p.vagaId === vaga.id);
  if (existente) return existente;
  const consultor = db.findById("consultores", vaga.consultorId) || {};
  let p = db.insert(COL, {
    token: crypto.randomBytes(12).toString("base64url"),
    vagaId: vaga.id,
    vagaTitulo: vaga.titulo,
    empresaId: vaga.empresaId,
    consultorId: vaga.consultorId || null,
    consultorNome: consultor.nome || "",
    ...contatosDaVaga(vaga),
    base,
    criadaPor: por,
    envios: [],
    respondidaEm: null,
    respostas: null,
  });
  const email = await enviarPorEmail(p);
  p = registrarEnvio(p, { canal: "email", para: p.emails.join(", "), ...email });

  const destinos = new Set([vaga.consultorId]);
  db.readCollection("consultores")
    .filter((c) => c.perfil === "Gestor" && c.ativo !== false)
    .forEach((c) => destinos.add(c.id));
  destinos.forEach((id) =>
    notify({
      tipo: "Pesquisa NPS",
      vagaId: vaga.id,
      destinatarioId: id,
      assunto: `Envie a pesquisa de satisfação: ${vaga.titulo}`,
      mensagem:
        `Vaga fechada! A pesquisa NPS de ${p.empresaNome || "cliente"} foi criada${email.ok ? " e enviada por e-mail" : ` (e-mail não enviado: ${email.erro})`}. ` +
        `Envie também pelo WhatsApp em Satisfação (NPS) ou no cadastro da vaga.`,
    })
  );
  return p;
}

/** Lembrete único por e-mail 3 dias após o envio, se o cliente ainda não respondeu. */
async function checarLembretes() {
  const limite = Date.now() - 3 * 24 * 3600 * 1000;
  for (const p of db.readCollection(COL)) {
    if (p.respondidaEm || p.lembreteEm || Date.parse(p.createdAt) > limite) continue;
    const r = await enviarPorEmail(p, true);
    registrarEnvio(p, { canal: "email-lembrete", para: p.emails.join(", "), ...r });
    db.update(COL, p.id, { lembreteEm: new Date().toISOString() });
  }
}

function startLembretesNps(intervaloMin = 60) {
  setTimeout(() => checarLembretes().catch((e) => console.error("[nps]", e.message)), 30 * 1000);
  setInterval(() => checarLembretes().catch((e) => console.error("[nps]", e.message)), intervaloMin * 60 * 1000);
}

module.exports = { COL, contatosDaVaga, criarParaVaga, enviarPorEmail, registrarEnvio, linkWhatsapp, linkPesquisa, startLembretesNps };
