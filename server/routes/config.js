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
  TOLERANCIA_BANCO_HORAS_MINUTOS,
  LIMITE_SALDO_SEMANAL_HORAS,
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
    param = db.insert("parametros", {
      chave: "ponto",
      toleranciaMetros: TOLERANCIA_PONTO_METROS,
      toleranciaBancoHorasMinutos: TOLERANCIA_BANCO_HORAS_MINUTOS,
      limiteSaldoSemanalHoras: LIMITE_SALDO_SEMANAL_HORAS,
    });
  } else if (param.toleranciaBancoHorasMinutos === undefined || param.limiteSaldoSemanalHoras === undefined) {
    // Instalações anteriores ao Banco de Horas não tinham esses dois campos —
    // preenche com o padrão na primeira leitura, sem exigir ação manual do Gestor.
    param = db.update("parametros", param.id, {
      toleranciaBancoHorasMinutos:
        param.toleranciaBancoHorasMinutos === undefined ? TOLERANCIA_BANCO_HORAS_MINUTOS : param.toleranciaBancoHorasMinutos,
      limiteSaldoSemanalHoras:
        param.limiteSaldoSemanalHoras === undefined ? LIMITE_SALDO_SEMANAL_HORAS : param.limiteSaldoSemanalHoras,
    });
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
    toleranciaBancoHorasMinutos: paramPonto.toleranciaBancoHorasMinutos,
    limiteSaldoSemanalHoras: paramPonto.limiteSaldoSemanalHoras,
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

// Banco de Horas: tolerância diária (minutos ignorados no saldo) e limite semanal de
// saldo (aviso visual no Controle de Ponto) — editáveis pelo Gestor.
router.patch("/banco-horas", requireAuth, requireGestor, (req, res) => {
  const toleranciaMinutos = Number(req.body && req.body.toleranciaMinutos);
  const limiteSemanalHoras = Number(req.body && req.body.limiteSemanalHoras);
  if (!Number.isInteger(toleranciaMinutos) || toleranciaMinutos < 0 || toleranciaMinutos > 60) {
    return res.status(400).json({ erro: "Informe uma tolerância em minutos válida (entre 0 e 60)." });
  }
  if (!Number.isFinite(limiteSemanalHoras) || limiteSemanalHoras <= 0) {
    return res.status(400).json({ erro: "Informe um limite semanal de horas válido (maior que zero)." });
  }
  const paramPonto = getParamPonto();
  const atualizado = db.update("parametros", paramPonto.id, {
    toleranciaBancoHorasMinutos: toleranciaMinutos,
    limiteSaldoSemanalHoras: limiteSemanalHoras,
  });
  res.json({
    toleranciaBancoHorasMinutos: atualizado.toleranciaBancoHorasMinutos,
    limiteSaldoSemanalHoras: atualizado.limiteSaldoSemanalHoras,
  });
});

module.exports = router;
module.exports.getParamContratos = getParamContratos;
module.exports.getParamPonto = getParamPonto;
