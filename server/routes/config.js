const express = require("express");
const db = require("../db");
const { requireAuth, requireGestor } = require("../middleware/auth");
const {
  SLA_DIAS_IDEAL,
  SLA_DIAS_LIMITE,
  DIAS_ALERTA_SLA_PROXIMO,
  DIAS_ALERTA_PRAZO,
  META_VAGAS_FECHADAS_MES,
} = require("../utils/constants");
const { gerarBackup, enviarBackupPorEmail, statusBackup } = require("../utils/backup");

const router = express.Router();

function getParamContratos() {
  const parametros = db.readCollection("parametros");
  let param = parametros.find((p) => p.chave === "contratos");
  if (!param) {
    param = db.insert("parametros", { chave: "contratos", proximoNumero: 1, anoBase: new Date().getFullYear() });
  }
  return param;
}

// Parâmetros de negócio do sistema. A maior parte é fixa no código
// (server/utils/constants.js) — mas o próximo número de contrato é editável
// pelo Gestor, para poder continuar a numeração real já usada pela Evoé.
router.get("/", requireAuth, (req, res) => {
  const paramContratos = getParamContratos();
  res.json({
    slaDiasIdeal: SLA_DIAS_IDEAL,
    slaDiasLimite: SLA_DIAS_LIMITE,
    diasAlertaSlaProximo: DIAS_ALERTA_SLA_PROXIMO,
    diasAlertaPrazo: DIAS_ALERTA_PRAZO,
    metaVagasFechadasMes: META_VAGAS_FECHADAS_MES,
    proximoNumeroContrato: paramContratos.proximoNumero,
  });
});

router.patch("/proximo-numero-contrato", requireAuth, requireGestor, (req, res) => {
  const valor = Number(req.body && req.body.proximoNumero);
  if (!Number.isInteger(valor) || valor < 1) {
    return res.status(400).json({ erro: "Informe um número inteiro válido (maior que zero)." });
  }
  const paramContratos = getParamContratos();
  const atualizado = db.update("parametros", paramContratos.id, { proximoNumero: valor });
  res.json({ proximoNumeroContrato: atualizado.proximoNumero });
});

// ---------- Backup dos dados (só Gestor) ----------
router.get("/backup/status", requireAuth, requireGestor, (req, res) => {
  res.json(statusBackup());
});

router.get("/backup/download", requireAuth, requireGestor, (req, res) => {
  const backup = gerarBackup();
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${backup.nomeArquivo}"`);
  res.send(backup.buffer);
});

router.post("/backup/enviar", requireAuth, requireGestor, async (req, res) => {
  try {
    await enviarBackupPorEmail();
    res.json(statusBackup());
  } catch (err) {
    res.status(err.naoConfigurado ? 400 : 500).json({ erro: err.message });
  }
});

// ---------- Modelo padrão da mensagem de convite ao candidato ----------
// Marcadores: {VAGA}, {DETALHES}, {PERFIL}, {LINK}. Vazio = modelo de fábrica do sistema.
const paramMensagem = () => db.readCollection("parametros").find((p) => p.chave === "mensagemConvite");

router.get("/mensagem-convite", requireAuth, (req, res) => {
  const p = paramMensagem();
  res.json({ modelo: (p && p.modelo) || null, atualizadoPor: p ? p.atualizadoPor : null, atualizadoEm: p ? p.updatedAt : null });
});

router.put("/mensagem-convite", requireAuth, requireGestor, (req, res) => {
  const modelo = String((req.body || {}).modelo || "").trim().slice(0, 3000);
  if (modelo && !modelo.includes("{LINK}")) return res.status(400).json({ erro: "O modelo precisa ter o marcador {LINK} (onde entra o link da vaga)." });
  const p = paramMensagem();
  const dados = { modelo: modelo || null, atualizadoPor: req.consultor.nome };
  const salvo = p ? db.update("parametros", p.id, dados) : db.insert("parametros", { chave: "mensagemConvite", ...dados });
  res.json({ modelo: salvo.modelo });
});

// Modelos do "Retorno ao candidato" (convites, aprovação, devolutivas). Só os tipos
// alterados ficam salvos; os demais usam o texto padrão de public/js/retornoCandidato.js.
const TIPOS_RETORNO = ["convite_evoe", "convite_gestor", "aprovado", "reprovado_evoe", "reprovado_gestor"];
const paramRetorno = () => db.readCollection("parametros").find((p) => p.chave === "modelosRetorno");

router.get("/modelos-retorno", requireAuth, (req, res) => {
  const p = paramRetorno();
  res.json({ modelos: (p && p.modelos) || {}, atualizadoPor: p ? p.atualizadoPor : null, atualizadoEm: p ? p.updatedAt : null });
});

router.put("/modelos-retorno/:tipo", requireAuth, requireGestor, (req, res) => {
  const { tipo } = req.params;
  if (!TIPOS_RETORNO.includes(tipo)) return res.status(400).json({ erro: "Tipo de retorno inválido." });
  const modelo = String((req.body || {}).modelo || "").trim().slice(0, 3000);
  if (modelo && tipo.startsWith("convite") && !modelo.includes("{ENTREVISTA}")) {
    return res.status(400).json({ erro: "O convite precisa ter o marcador {ENTREVISTA} (data, horário e local)." });
  }
  const p = paramRetorno();
  const modelos = { ...((p && p.modelos) || {}) };
  if (modelo) modelos[tipo] = modelo;
  else delete modelos[tipo]; // vazio = volta ao texto padrão
  const dados = { modelos, atualizadoPor: req.consultor.nome };
  const salvo = p ? db.update("parametros", p.id, dados) : db.insert("parametros", { chave: "modelosRetorno", ...dados });
  res.json({ modelos: salvo.modelos });
});

module.exports = router;
module.exports.getParamContratos = getParamContratos;
