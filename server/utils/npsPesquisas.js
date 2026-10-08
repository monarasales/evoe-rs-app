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

// Mensagem padrão definida pela diretora (Monara): os clientes falam com ela, então a
// pesquisa vai em nome dela. Só o nome do contato e o link mudam por cliente.
function mensagemPadrao(p) {
  const saudacao = p.contatoNome ? `Olá, ${primeiroNome(p.contatoNome)}! Tudo bem?` : "Olá! Tudo bem?";
  return [
    saudacao,
    "Aqui é a Monara, diretora da Evoé Gestão & RH.",
    "Concluímos mais uma etapa do nosso trabalho com vocês e gostaria muito de ouvir a sua percepção sobre a experiência com a nossa consultoria. Esse retorno é muito importante para continuarmos aprimorando nossas entregas e fortalecendo cada vez mais a nossa parceria.",
    "Preparamos uma pesquisa bem rápida, com apenas 6 perguntas e duração média de 1 minuto:",
    linkPesquisa(p),
    "Agradeço pela confiança na Evoé e, principalmente, pela parceria conosco.",
  ].join("\n\n");
}

const mensagemWhatsapp = mensagemPadrao;

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
      assunto: `${lembrete ? "Lembrete: " : ""}Sua opinião sobre a Evoé — vaga ${p.vagaTitulo}`,
      texto: `${mensagemPadrao(p)}\n\nMonara\nDiretora — Evoé Gestão & RH`,
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
async function criarParaVaga(vaga, { por = "Sistema", base, enviarEmail = true, notificar = true, campanha = null }) {
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
    ...(campanha ? { campanha } : {}),
    envios: [],
    respondidaEm: null,
    respostas: null,
  });
  const email = enviarEmail ? await enviarPorEmail(p) : { ok: false, erro: "Envio por e-mail desmarcado no disparo." };
  if (enviarEmail) p = registrarEnvio(p, { canal: "email", para: p.emails.join(", "), ...email });
  if (!notificar) return p;

  // Só a gestão recebe o pedido de envio: a mensagem é em nome da Monara e deve sair do
  // WhatsApp dela (quem clica em "Enviar" envia do WhatsApp conectado no próprio aparelho).
  const destinos = new Set(
    db
      .readCollection("consultores")
      .filter((c) => c.perfil === "Gestor" && c.ativo !== false)
      .map((c) => c.id)
  );
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
const emailJaEntregue = (p) => (p.envios || []).some((e) => e.canal.startsWith("email") && e.ok);

/**
 * 3 dias após a criação, se o cliente não respondeu: manda por e-mail. Se o primeiro
 * e-mail nunca saiu (ex.: senha do Gmail recusada), este vira o PRIMEIRO envio — sem
 * a palavra "Lembrete". Só marca como feito quando o e-mail realmente sai; enquanto o
 * e-mail estiver com problema, tenta de novo na hora seguinte (sem poluir o histórico).
 */
async function checarLembretes() {
  const limite = Date.now() - 3 * 24 * 3600 * 1000;
  for (const p of db.readCollection(COL)) {
    if (p.teste || p.respondidaEm || p.lembreteEm || !(p.emails || []).length || Date.parse(p.createdAt) > limite) continue;
    const lembrete = emailJaEntregue(p);
    const r = await enviarPorEmail(p, lembrete);
    if (!r.ok) {
      console.warn(`[nps] Lembrete não enviado (${p.empresaNome}): ${r.erro}`);
      continue;
    }
    registrarEnvio(p, { canal: lembrete ? "email-lembrete" : "email", para: p.emails.join(", "), ...r });
    db.update(COL, p.id, { lembreteEm: new Date().toISOString() });
  }
}

/** Reenvia o e-mail das pesquisas sem resposta cujo e-mail nunca foi entregue. */
async function reenviarFalhas(por) {
  const resultado = { enviados: 0, falhas: 0, ultimoErro: null };
  for (const p of db.readCollection(COL)) {
    if (p.teste || p.respondidaEm || !(p.emails || []).length || emailJaEntregue(p)) continue;
    const r = await enviarPorEmail(p);
    registrarEnvio(p, { canal: "email", para: p.emails.join(", "), por, ...r });
    if (r.ok) resultado.enviados++;
    else {
      resultado.falhas++;
      resultado.ultimoErro = r.erro;
    }
  }
  return resultado;
}

function startLembretesNps(intervaloMin = 60) {
  setTimeout(() => checarLembretes().catch((e) => console.error("[nps]", e.message)), 30 * 1000);
  setInterval(() => checarLembretes().catch((e) => console.error("[nps]", e.message)), intervaloMin * 60 * 1000);
}

module.exports = { mensagemPadrao, reenviarFalhas, emailJaEntregue, COL, contatosDaVaga, criarParaVaga, enviarPorEmail, registrarEnvio, linkWhatsapp, linkPesquisa, startLembretesNps };
