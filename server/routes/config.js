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

module.exports = router;
module.exports.getParamContratos = getParamContratos;
