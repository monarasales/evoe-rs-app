// Formulário PÚBLICO do perfil da vaga (o cliente preenche pelo link enviado pela Evoé).
// Sem login. Cada envio tem um código próprio (token): o cliente volta pelo mesmo link para
// acompanhar a validação ou ajustar enquanto o perfil não foi validado.

const express = require("express");
const db = require("../db");
const { notify } = require("../utils/notify");
const { enviarEmail, emailConfigurado } = require("../utils/mailer");
const { OPCOES, DIAS, normalizarPerfil, pendencias, novoToken } = require("../utils/perfilVaga");

const router = express.Router();
const COL = "solicitacoesVaga";
const baseUrl = (req) => `${req.protocol}://${req.get("host")}`;
const acharPorToken = (token) => db.readCollection(COL).find((s) => s.token && s.token === token);

// Limite simples contra abuso: até 30 envios por hora por endereço.
const envios = new Map();
function limiteOk(req) {
  const ip = req.ip || "?";
  const agora = Date.now();
  const lista = (envios.get(ip) || []).filter((t) => agora - t < 3600 * 1000);
  if (lista.length >= 30) return false;
  lista.push(agora);
  envios.set(ip, lista);
  return true;
}

function avisarGestao(s, reenvio) {
  db.readCollection("consultores")
    .filter((c) => c.perfil === "Gestor" && c.ativo !== false)
    .forEach((g) =>
      notify({
        tipo: "Perfil de vaga do cliente",
        destinatarioId: g.id,
        assunto: `${reenvio ? "Perfil ajustado" : "Novo perfil de vaga"}: ${s.dados.vaga.cargo} — ${s.dados.empresa.nome}`,
        mensagem: `${s.dados.contato.nome} (${s.dados.empresa.nome}) ${reenvio ? "atualizou" : "enviou"} o perfil da vaga de ${s.dados.vaga.cargo}. Revise e valide em "Perfis de vaga (clientes)".`,
      })
    );
}

async function confirmarRecebimento(req, s) {
  if (!emailConfigurado() || !s.dados.contato.email) return;
  try {
    await enviarEmail({
      para: s.dados.contato.email,
      assunto: `Recebemos o perfil da vaga de ${s.dados.vaga.cargo} — Evoé Gestão & RH`,
      texto:
        `Olá, ${s.dados.contato.nome.split(" ")[0]}!\n\nRecebemos o perfil da vaga de ${s.dados.vaga.cargo}. Nossa equipe vai revisar as informações e você receberá a confirmação assim que validarmos.\n\n` +
        `Acompanhe ou ajuste pelo link: ${baseUrl(req)}/perfil-vaga/${s.token}\n\nEvoé Gestão & RH`,
    });
  } catch (e) {
    console.warn("[perfil-vaga] e-mail de recebimento não enviado:", e.message);
  }
}

const publico = (s) => ({
  status: s.status,
  editavel: !["Validado", "Arquivado"].includes(s.status),
  dados: s.dados,
  mensagemCliente: s.mensagemCliente || "",
  validadoEm: s.validadoEm || null,
  enviadoEm: s.enviadoEm || null,
});

router.get("/opcoes", (req, res) => res.json({ opcoes: OPCOES, dias: DIAS }));

router.get("/:token", (req, res) => {
  const s = acharPorToken(req.params.token);
  if (!s) return res.status(404).json({ erro: "Link não encontrado. Confira com a Evoé o link recebido." });
  res.json(publico(s));
});

router.post("/", async (req, res) => {
  const b = req.body || {};
  if (b.site) return res.status(400).json({ erro: "Envio inválido." }); // campo-isca contra robôs
  if (!limiteOk(req)) return res.status(429).json({ erro: "Muitos envios em pouco tempo. Tente novamente mais tarde." });
  const dados = normalizarPerfil(b.dados);
  const falta = pendencias(dados);
  if (falta.length) return res.status(400).json({ erro: `Preencha: ${falta.join(", ")}.`, falta });
  const agora = new Date().toISOString();
  const s = db.insert(COL, {
    token: novoToken(),
    status: "Aguardando validação",
    origem: "Link geral",
    dados,
    enviadoEm: agora,
    historico: [{ em: agora, acao: "Enviado pelo cliente" }],
  });
  avisarGestao(s, false);
  await confirmarRecebimento(req, s);
  res.status(201).json({ ok: true, token: s.token });
});

router.put("/:token", async (req, res) => {
  const s = acharPorToken(req.params.token);
  if (!s) return res.status(404).json({ erro: "Link não encontrado." });
  if ((req.body || {}).site) return res.status(400).json({ erro: "Envio inválido." });
  if (["Validado", "Arquivado"].includes(s.status)) return res.status(409).json({ erro: "Este perfil já foi validado pela Evoé. Para alterar, fale com a sua consultora." });
  if (!limiteOk(req)) return res.status(429).json({ erro: "Muitos envios em pouco tempo. Tente novamente mais tarde." });
  const dados = normalizarPerfil((req.body || {}).dados);
  const falta = pendencias(dados);
  if (falta.length) return res.status(400).json({ erro: `Preencha: ${falta.join(", ")}.`, falta });
  const agora = new Date().toISOString();
  const reenvio = !!s.enviadoEm;
  const atualizado = db.update(COL, s.id, {
    dados,
    status: "Aguardando validação",
    enviadoEm: agora,
    // versão anterior fica guardada (nada se perde)
    ...(s.enviadoEm ? { versoesAnteriores: [...(s.versoesAnteriores || []), { em: s.enviadoEm, dados: s.dados }].slice(-20) } : {}),
    historico: [...(s.historico || []), { em: agora, acao: reenvio ? "Ajustado pelo cliente" : "Enviado pelo cliente" }],
  });
  avisarGestao(atualizado, reenvio);
  await confirmarRecebimento(req, atualizado);
  res.json({ ok: true, token: atualizado.token });
});

module.exports = router;
