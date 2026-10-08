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
    contatoNome: p.contatoNome,
    emails: p.emails,
    whatsapp: p.whatsapp,
    criadaEm: p.createdAt,
    envios: p.envios || [],
    respondidaEm: p.respondidaEm,
    respostas: p.respostas,
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

  res.json({
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
