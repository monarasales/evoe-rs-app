// Pesquisa de satisfação (NPS) — rotas internas.
//  - Por vaga (consultor responsável ou gestão): status, link do WhatsApp, (re)enviar e-mail.
//  - Painel (só Gestor): NPS geral, mensal, por critério e por consultor.

const express = require("express");
const db = require("../db");
const { requireAuth, requireGestor } = require("../middleware/auth");
const { CRITERIOS, resumir, zona } = require("../utils/nps");
const crypto = require("crypto");
const { reenviarFalhas, emailJaEntregue } = require("../utils/npsPesquisas");
const { COL, criarParaVaga, enviarPorEmail, registrarEnvio, linkWhatsapp, linkPesquisa, contatosDaVaga } = require("../utils/npsPesquisas");

const router = express.Router();
router.use(requireAuth);

const baseUrl = (req) => `${req.protocol}://${req.get("host")}`;

/** Telefone comparável (sem +55, zero ou máscara). */
const chaveTel = (t) => {
  let d = String(t || "").replace(/\D/g, "").replace(/^0+/, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  return d.length >= 10 ? d : "";
};
/** Pesquisa REAL sem resposta ligada a este telefone (na pesquisa ou no cadastro da empresa). */
function pesquisaRealDoTelefone(tel) {
  const k = chaveTel(tel);
  if (!k) return null;
  const empresas = new Map(db.readCollection("empresas").map((e) => [e.id, e]));
  return (
    db
      .readCollection(COL)
      .filter((p) => !p.teste && !p.respondidaEm)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .find((p) => chaveTel(p.whatsapp) === k || (p.empresaId && chaveTel((empresas.get(p.empresaId) || {}).whatsappContato) === k)) || null
  );
}
const podeEditar = (req, vaga) =>
  ["Gestor", "Supervisora"].includes(req.consultor.perfil) || (vaga && vaga.consultorId === req.consultor.id);

function paraTela(p) {
  return {
    id: p.id,
    vagaId: p.vagaId,
    teste: !!p.teste,
    vagaTitulo: p.vagaTitulo,
    empresaNome: p.empresaNome,
    consultorNome: p.consultorNome,
    consultorId: p.consultorId || null,
    contatoNome: p.contatoNome,
    emails: p.emails,
    whatsapp: p.whatsapp,
    criadaEm: p.createdAt,
    envios: p.envios || [],
    respondidaEm: p.respondidaEm,
    respostas: p.respostas,
    respostaManual: !!p.respostaManual,
    respostaTransferida: !!p.respostaTransferida,
    transferidaPara: p.transferidaPara || null,
    empresaId: p.empresaId || null,
    link: linkPesquisa(p),
    linkWhatsapp: linkWhatsapp(p),
  };
}

// ---------- Por vaga ----------
router.get("/vaga/:vagaId", (req, res) => {
  const vaga = db.findById("vagas", req.params.vagaId);
  if (!vaga) return res.status(404).json({ erro: "Vaga não encontrada." });
  if (!podeEditar(req, vaga)) return res.status(403).json({ erro: "Sem acesso a esta vaga." });
  const p = db.readCollection(COL).find((x) => x.vagaId === vaga.id);
  res.json({ pesquisa: p ? paraTela(p) : null, contatos: contatosDaVaga(vaga), fechada: vaga.etapaAtual === "11. Aprovado" });
});

// Cria (se não existir) e envia/reenvia o e-mail.
router.post("/vaga/:vagaId/enviar", async (req, res) => {
  const vaga = db.findById("vagas", req.params.vagaId);
  if (!vaga) return res.status(404).json({ erro: "Vaga não encontrada." });
  if (!podeEditar(req, vaga)) return res.status(403).json({ erro: "Sem acesso a esta vaga." });
  let p = db.readCollection(COL).find((x) => x.vagaId === vaga.id);
  if (!p) {
    p = await criarParaVaga(vaga, { por: req.consultor.nome, base: baseUrl(req) });
  } else {
    // Contatos podem ter sido atualizados no CRM depois da criação.
    p = db.update(COL, p.id, contatosDaVaga(vaga));
    const r = await enviarPorEmail(p);
    p = registrarEnvio(p, { canal: "email", para: p.emails.join(", "), por: req.consultor.nome, ...r });
  }
  const ultimo = (p.envios || []).slice(-1)[0] || {};
  res.json({ pesquisa: paraTela(p), email: { ok: !!ultimo.ok, erro: ultimo.erro || null } });
});

// Registra que o consultor abriu o WhatsApp para enviar (histórico de envios).
router.post("/:id/whatsapp", (req, res) => {
  const p = db.findById(COL, req.params.id);
  if (!p) return res.status(404).json({ erro: "Pesquisa não encontrada." });
  if (!podeEditar(req, db.findById("vagas", p.vagaId))) return res.status(403).json({ erro: "Sem acesso." });
  res.json(paraTela(registrarEnvio(p, { canal: "whatsapp", para: p.whatsapp || "(número escolhido no WhatsApp)", por: req.consultor.nome, ok: true })));
});

// Cadastrar/corrigir o contato do cliente direto na fila (sem ir ao CRM): grava na pesquisa
// e no cadastro da empresa. O contato anterior da empresa fica em historicoContatos.
router.patch("/:id/contato", requireGestor, async (req, res) => {
  const p = db.findById(COL, req.params.id);
  if (!p) return res.status(404).json({ erro: "Pesquisa não encontrada." });
  const b = req.body || {};
  const whatsapp = String(b.whatsapp || "").replace(/\D/g, "");
  const email = String(b.email || "").trim().toLowerCase();
  const nome = String(b.contatoNome || "").trim().slice(0, 120);
  if (whatsapp && whatsapp.length < 10) return res.status(400).json({ erro: "WhatsApp com DDD, ex.: (85) 98862-0412." });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ erro: "E-mail inválido." });
  if (!whatsapp && !email) return res.status(400).json({ erro: "Informe o WhatsApp ou o e-mail do cliente." });
  const dados = {};
  if (whatsapp) dados.whatsapp = whatsapp;
  if (email) dados.emails = [...new Set([email, ...(p.emails || [])])];
  if (nome) dados.contatoNome = nome;
  let atual = db.update(COL, p.id, dados);

  const empresa = p.empresaId ? db.findById("empresas", p.empresaId) : null;
  if (empresa) {
    const novo = {};
    if (whatsapp && String(empresa.whatsappContato || "").replace(/\D/g, "") !== whatsapp) novo.whatsappContato = b.whatsapp;
    if (email && String(empresa.emailContato || "").toLowerCase() !== email) novo.emailContato = email;
    if (nome && !empresa.contatoResponsavel) novo.contatoResponsavel = nome;
    if (Object.keys(novo).length) {
      novo.historicoContatos = [
        ...(empresa.historicoContatos || []),
        { em: new Date().toISOString(), por: req.consultor.nome, origem: "Fila do NPS", anterior: { whatsappContato: empresa.whatsappContato || "", emailContato: empresa.emailContato || "", contatoResponsavel: empresa.contatoResponsavel || "" } },
      ];
      db.update("empresas", empresa.id, novo);
    }
  }
  // Outras pesquisas pendentes da mesma empresa sem contato recebem o mesmo contato.
  const outras = p.empresaId
    ? db.readCollection(COL).filter((x) => x.id !== p.id && x.empresaId === p.empresaId && !x.respondidaEm && !x.teste)
    : [];
  const atualizadas = outras.map((x) => {
    const d2 = {};
    if (whatsapp && String(x.whatsapp || "").length < 10) d2.whatsapp = whatsapp;
    if (email && !(x.emails || []).length) d2.emails = [email];
    if (nome && !x.contatoNome) d2.contatoNome = nome;
    return Object.keys(d2).length ? paraTela(db.update(COL, x.id, d2)) : null;
  }).filter(Boolean);
  // E-mail novo: já tenta enviar a pesquisa por e-mail também.
  let envioEmail = null;
  if (email && !emailJaEntregue(atual)) {
    envioEmail = await enviarPorEmail(atual);
    atual = registrarEnvio(atual, { canal: "email", para: atual.emails.join(", "), por: req.consultor.nome, ...envioEmail });
  }
  res.json({ pesquisa: paraTela(atual), email: envioEmail, atualizadas });
});

// Resposta dada numa pesquisa de TESTE por um cliente: transfere para a pesquisa real da vaga.
// A pesquisa de teste continua guardada (marcada com transferidaPara).
router.post("/:id/transferir", requireGestor, (req, res) => {
  const teste = db.findById(COL, req.params.id);
  if (!teste || !teste.teste) return res.status(404).json({ erro: "Pesquisa de teste não encontrada." });
  if (!teste.respondidaEm) return res.status(400).json({ erro: "Esta pesquisa de teste ainda não foi respondida." });
  if (teste.transferidaPara) return res.status(400).json({ erro: "Esta resposta já foi transferida." });
  const real = db.findById(COL, (req.body || {}).paraId);
  if (!real || real.teste) return res.status(400).json({ erro: "Escolha a pesquisa da vaga do cliente." });
  if (real.respondidaEm) return res.status(400).json({ erro: "A pesquisa desta vaga já tem resposta." });
  const agora = new Date().toISOString();
  const respondente = teste.respostas.respondente && teste.respostas.respondente !== teste.consultorNome ? teste.respostas.respondente : real.contatoNome || "";
  const atualizada = db.update(COL, real.id, {
    respostas: { ...teste.respostas, respondente, transferidaDeTeste: teste.id, transferidaPor: req.consultor.nome },
    respondidaEm: teste.respondidaEm,
    respostaTransferida: true,
  });
  db.update(COL, teste.id, { transferidaPara: real.id, transferidaEm: agora, transferidaPor: req.consultor.nome });
  res.json(paraTela(atualizada));
});

// Resposta recebida fora do link (ex.: o cliente respondeu por mensagem no WhatsApp):
// a gestão registra a nota. Fica marcada como "registrada pela Evoé".
router.post("/:id/resposta-manual", requireGestor, (req, res) => {
  const p = db.findById(COL, req.params.id);
  if (!p) return res.status(404).json({ erro: "Pesquisa não encontrada." });
  if (p.respondidaEm) return res.status(400).json({ erro: "Esta pesquisa já tem resposta." });
  const b = req.body || {};
  const nps = Number(b.nps);
  if (!Number.isInteger(nps) || nps < 0 || nps > 10) return res.status(400).json({ erro: "Informe a nota de 0 a 10 que o cliente deu." });
  const criterios = {};
  for (const c of CRITERIOS) {
    const n = Number((b.criterios || {})[c.id]);
    if (Number.isInteger(n) && n >= 1 && n <= 5) criterios[c.id] = n;
  }
  const respostas = {
    criterios,
    nps,
    feedback: String(b.feedback || "").trim().slice(0, 3000),
    respondente: String(b.respondente || p.contatoNome || "").trim().slice(0, 120),
    registradaPor: req.consultor.nome,
    canal: String(b.canal || "WhatsApp").slice(0, 30),
  };
  res.json(paraTela(db.update(COL, p.id, { respostas, respondidaEm: new Date().toISOString(), respostaManual: true })));
});

// ---------- Disparo para vagas JÁ FECHADAS (Gestor valida antes) ----------
// Lista as vagas fechadas (11. Aprovado) que ainda não têm pesquisa, com os contatos.
// Sugestão padrão: só a vaga fechada mais recente de cada empresa (evita mandar várias
// pesquisas ao mesmo cliente de uma vez) e só quem tem WhatsApp ou e-mail.
router.get("/campanha/candidatas", requireGestor, (req, res) => {
  const comPesquisa = new Set(db.readCollection(COL).map((p) => p.vagaId).filter(Boolean));
  const consultores = db.readCollection("consultores");
  const vagas = db
    .readCollection("vagas")
    .filter((v) => v.etapaAtual === "11. Aprovado" && !comPesquisa.has(v.id))
    .map((v) => {
      const c = contatosDaVaga(v);
      return {
        vagaId: v.id,
        vagaTitulo: v.titulo,
        empresaId: v.empresaId,
        empresaNome: c.empresaNome || "(empresa removida)",
        contatoNome: c.contatoNome,
        whatsapp: c.whatsapp,
        emails: c.emails,
        consultorNome: (consultores.find((x) => x.id === v.consultorId) || {}).nome || "",
        dataFechamento: v.dataFechamento || null,
      };
    })
    .sort((a, b) => String(b.dataFechamento || "").localeCompare(String(a.dataFechamento || "")));
  const vistas = new Set();
  vagas.forEach((v) => {
    v.sugerida = !vistas.has(v.empresaId) && (v.whatsapp.length >= 10 || v.emails.length > 0);
    vistas.add(v.empresaId);
  });
  res.json(vagas);
});

// Cria as pesquisas das vagas escolhidas (e envia os e-mails, se marcado).
router.post("/campanha", requireGestor, async (req, res) => {
  const ids = Array.isArray((req.body || {}).vagaIds) ? req.body.vagaIds : [];
  if (!ids.length) return res.status(400).json({ erro: "Escolha pelo menos uma vaga." });
  if (ids.length > 200) return res.status(400).json({ erro: "Máximo de 200 vagas por disparo." });
  const enviarEmail = (req.body || {}).enviarEmail !== false;
  const campanha = { id: crypto.randomBytes(6).toString("hex"), em: new Date().toISOString(), por: req.consultor.nome };
  const criadas = [];
  for (const id of ids) {
    const vaga = db.findById("vagas", id);
    if (!vaga || vaga.etapaAtual !== "11. Aprovado") continue;
    const p = await criarParaVaga(vaga, { por: req.consultor.nome, base: baseUrl(req), enviarEmail, notificar: false, campanha });
    criadas.push(paraTela(db.findById(COL, p.id)));
  }
  res.status(201).json({ campanha, pesquisas: criadas });
});

// Reenvia, de uma vez, os e-mails que nunca foram entregues (ex.: depois de corrigir a senha do Gmail).
router.post("/reenviar-falhas", requireGestor, async (req, res) => {
  res.json(await reenviarFalhas(req.consultor.nome));
});

// ---------- Pesquisa de TESTE (Gestor) ----------
// Cria uma pesquisa marcada como teste (não entra nos indicadores) e devolve o link
// do WhatsApp para o número informado — para conferir a experiência do cliente.
router.post("/teste", requireGestor, (req, res) => {
  const tel = String((req.body || {}).telefone || "").replace(/\D/g, "");
  if (tel.length < 10) return res.status(400).json({ erro: "Informe o WhatsApp com DDD, ex.: (85) 98862-0412." });
  // Número de um cliente com pesquisa pendente: a resposta de TESTE não contaria no NPS.
  const real = pesquisaRealDoTelefone(tel);
  if (real && !(req.body || {}).forcar) {
    return res.status(409).json({
      erro: `Este número é de ${real.empresaNome}, que tem a pesquisa da vaga "${real.vagaTitulo}" aguardando resposta. Envie a pesquisa real — a de teste não entra nos indicadores.`,
      pesquisaReal: paraTela(real),
    });
  }
  const p = db.insert(COL, {
    token: crypto.randomBytes(12).toString("base64url"),
    teste: true,
    vagaId: null,
    vagaTitulo: "Vaga de teste (pesquisa NPS)",
    empresaId: null,
    empresaNome: "Teste Evoé",
    consultorId: req.consultor.id,
    consultorNome: req.consultor.nome,
    contatoNome: req.consultor.nome,
    emails: [],
    whatsapp: tel,
    base: baseUrl(req),
    criadaPor: req.consultor.nome,
    envios: [{ em: new Date().toISOString(), canal: "whatsapp", para: tel, ok: true, por: req.consultor.nome }],
    respondidaEm: null,
    respostas: null,
  });
  res.status(201).json(paraTela(p));
});

// ---------- Painel (Gestor) ----------
const mesLocal = (iso) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Fortaleza" }).slice(0, 7);

router.get("/painel", requireGestor, (req, res) => {
  const meses = Math.min(24, Math.max(3, Number(req.query.meses) || 12));
  const agora = new Date();
  const listaMeses = [];
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - i, 15));
    listaMeses.push(d.toISOString().slice(0, 7));
  }
  const inicio = listaMeses[0];
  // Pesquisas de teste ficam fora dos indicadores (aparecem só na lista, marcadas).
  const todasComTeste = db.readCollection(COL);
  const todas = todasComTeste.filter((p) => !p.teste);
  const doPeriodo = todas.filter((p) => mesLocal(p.createdAt) >= inicio);
  const respondidas = todas.filter((p) => p.respondidaEm && mesLocal(p.respondidaEm) >= inicio);
  const respostas = (lista) => lista.map((p) => p.respostas);

  const mensal = listaMeses.map((mes) => {
    const r = resumir(respostas(respondidas.filter((p) => mesLocal(p.respondidaEm) === mes)));
    return { mes, enviadas: doPeriodo.filter((p) => mesLocal(p.createdAt) === mes).length, ...r };
  });
  const geral = resumir(respostas(respondidas));
  const consultores = [...new Set(respondidas.map((p) => p.consultorNome || "—"))]
    .map((nome) => ({ nome, ...resumir(respostas(respondidas.filter((p) => (p.consultorNome || "—") === nome))) }))
    .sort((a, b) => b.respostas - a.respostas);

  // Diagnóstico de envio para o painel: e-mails que não saíram e o último erro.
  const semResposta = todas.filter((p) => !p.respondidaEm);
  const ultimoErroEmail = todas
    .flatMap((p) => (p.envios || []).filter((e) => e.canal.startsWith("email") && !e.ok && e.para))
    .sort((a, b) => String(b.em).localeCompare(String(a.em)))[0];
  const diagnostico = {
    emailsComFalha: semResposta.filter((p) => (p.emails || []).length && !emailJaEntregue(p)).length,
    semEmail: semResposta.filter((p) => !(p.emails || []).length).length,
    erroEmail: ultimoErroEmail ? ultimoErroEmail.erro : null,
    senhaRecusada: !!(ultimoErroEmail && /535|BadCredentials|Username and Password/i.test(ultimoErroEmail.erro || "")),
  };

  // Respostas de teste que parecem ser de clientes (mesmo número de uma pesquisa real pendente).
  const sugestoesTransferencia = todasComTeste
    .filter((p) => p.teste && p.respondidaEm && !p.transferidaPara)
    .map((p) => ({ teste: paraTela(p), para: pesquisaRealDoTelefone(p.whatsapp) }))
    .filter((s) => s.para)
    .map((s) => ({ teste: s.teste, para: paraTela(s.para) }));

  res.json({
    sugestoesTransferencia,
    diagnostico,
    meses: listaMeses,
    criterios: CRITERIOS,
    geral: { ...geral, zona: zona(geral.nps), enviadas: doPeriodo.length, taxaResposta: doPeriodo.length ? Math.round((doPeriodo.filter((p) => p.respondidaEm).length / doPeriodo.length) * 100) : null },
    mensal,
    consultores,
    pesquisas: todasComTeste.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 200).map(paraTela),
  });
});

module.exports = router;
