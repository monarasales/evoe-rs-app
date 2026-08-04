const express = require("express");
const db = require("../db");
const { requireAuth, requireGestor } = require("../middleware/auth");
const {
  SLA_DIAS_IDEAL,
  SLA_DIAS_LIMITE,
  DIAS_ALERTA_SLA_PROXIMO,
  DIAS_ALERTA_PRAZO,
  META_VAGAS_FECHADAS_MES,
  TOLERANCIA_PONTO_METROS,
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

// Raio de tolerância (em metros) usado no Controle de Ponto para avisar quando uma
// batida foi longe demais dos dois endereços cadastrados. Editável pelo Gestor, já
// que a precisão do GPS varia bastante (celular x notebook, endereço mais ou menos
// completo) e o valor ideal pode precisar de ajuste na prática.
function getParamPonto() {
  const parametros = db.readCollection("parametros");
  let param = parametros.find((p) => p.chave === "ponto");
  if (!param) {
    param = db.insert("parametros", { chave: "ponto", toleranciaMetros: TOLERANCIA_PONTO_METROS });
  }
  return param;
}

// Parâmetros de negócio do sistema. A maior parte é fixa no código
// (server/utils/constants.js) — mas o próximo número de contrato e o raio de
// tolerância do ponto são editáveis pelo Gestor.
router.get("/", requireAuth, (req, res) => {
  const paramContratos = getParamContratos();
  const paramPonto = getParamPonto();
  res.json({
    slaDiasIdeal: SLA_DIAS_IDEAL,
    slaDiasLimite: SLA_DIAS_LIMITE,
    diasAlertaSlaProximo: DIAS_ALERTA_SLA_PROXIMO,
    diasAlertaPrazo: DIAS_ALERTA_PRAZO,
    metaVagasFechadasMes: META_VAGAS_FECHADAS_MES,
    proximoNumeroContrato: paramContratos.proximoNumero,
    toleranciaPontoMetros: paramPonto.toleranciaMetros,
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

router.patch("/tolerancia-ponto", requireAuth, requireGestor, (req, res) => {
  const valor = Number(req.body && req.body.toleranciaMetros);
  if (!Number.isInteger(valor) || valor < 50) {
    return res.status(400).json({ erro: "Informe um raio em metros válido (mínimo 50)." });
  }
  const paramPonto = getParamPonto();
  const atualizado = db.update("parametros", paramPonto.id, { toleranciaMetros: valor });
  res.json({ toleranciaPontoMetros: atualizado.toleranciaMetros });
});

module.exports = router;
module.exports.getParamContratos = getParamContratos;
module.exports.getParamPonto = getParamPonto;
