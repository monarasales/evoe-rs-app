// Verificação periódica de vencimento da 2ª parcela dos contratos: roda quando o
// servidor sobe e depois a cada intervalo fixo, avisando o(s) Gestor(es) para cobrar
// o cliente quando a data de vencimento da 2ª parcela está próxima ou já chegou.
// Cada contrato só dispara o lembrete uma vez (flag lembreteParcela2Enviado) — se a
// usuária editar a data de vencimento, o lembrete volta a poder disparar (ver contratos.js).

const db = require("../db");
const { notify } = require("./notify");
const { DIAS_ALERTA_PARCELA_CONTRATO } = require("./constants");
const { hojeStr } = require("./vagaCompute");

function diasAte(dataStr) {
  const hoje = new Date(hojeStr() + "T00:00:00");
  const alvo = new Date(dataStr + "T00:00:00");
  return Math.round((alvo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
}

function checkParcelasContrato() {
  const contratos = db.readCollection("contratos");
  const gestoresAtivos = db.readCollection("consultores").filter((c) => c.perfil === "Gestor" && c.ativo);
  let alterou = false;

  for (const contrato of contratos) {
    if (!contrato.dataVencimentoParcela2 || contrato.lembreteParcela2Enviado) continue;

    const dias = diasAte(contrato.dataVencimentoParcela2);
    if (dias > DIAS_ALERTA_PARCELA_CONTRATO) continue;

    const empresa = db.findById("empresas", contrato.empresaId);
    const nomeEmpresa = empresa ? empresa.nome : "cliente";
    const mensagem =
      dias < 0
        ? `A 2ª parcela do contrato nº ${contrato.numero} (${nomeEmpresa}) venceu em ${contrato.dataVencimentoParcela2} e ainda não foi cobrada. Hora de cobrar o cliente.`
        : dias === 0
        ? `A 2ª parcela do contrato nº ${contrato.numero} (${nomeEmpresa}) vence hoje. Hora de cobrar o cliente.`
        : `A 2ª parcela do contrato nº ${contrato.numero} (${nomeEmpresa}) vence em ${dias} dia(s) (${contrato.dataVencimentoParcela2}). Prepare a cobrança do cliente.`;

    gestoresAtivos.forEach((g) =>
      notify({
        tipo: "Cobrança de Parcela de Contrato",
        vagaId: null,
        destinatarioId: g.id,
        assunto: `Cobrar 2ª parcela — Contrato ${contrato.numero}`,
        mensagem,
      })
    );

    contrato.lembreteParcela2Enviado = true;
    alterou = true;
  }

  if (alterou) db.writeCollection("contratos", contratos);
}

function startContratoChecker(intervalMinutos = 60) {
  checkParcelasContrato();
  setInterval(checkParcelasContrato, intervalMinutos * 60 * 1000);
}

module.exports = { checkParcelasContrato, startContratoChecker };
