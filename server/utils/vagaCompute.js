const { ETAPAS_ENCERRADAS, SLA_DIAS_IDEAL, SLA_DIAS_LIMITE } = require("./constants");

function diasEntre(dataInicioStr, dataFimStr) {
  const inicio = new Date(dataInicioStr + "T00:00:00");
  const fim = new Date(dataFimStr + "T00:00:00");
  const diffMs = fim.getTime() - inicio.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

function hojeStr() {
  return new Date().toISOString().slice(0, 10);
}

/** Classifica o SLA de fechamento de uma vaga já Aprovada, com base nos dias entre
 * abertura e fechamento. Dois "pesos": até SLA_DIAS_IDEAL dias pesa mais (2), até
 * SLA_DIAS_LIMITE ainda conta como dentro do combinado (1), acima disso fica fora (0).
 * Retorna null para vagas que ainda não foram fechadas. */
function classificarSlaFechamento(vaga) {
  if (vaga.etapaAtual !== "11. Aprovado" || !vaga.dataFechamento) return null;
  const dias = diasEntre(vaga.dataAbertura, vaga.dataFechamento);

  if (dias <= SLA_DIAS_IDEAL) {
    return { nivel: "ideal", peso: 2, rotulo: `SLA Ideal (até ${SLA_DIAS_IDEAL} dias)`, dias };
  }
  if (dias <= SLA_DIAS_LIMITE) {
    return { nivel: "dentro", peso: 1, rotulo: `Dentro do SLA (${SLA_DIAS_IDEAL + 1} a ${SLA_DIAS_LIMITE} dias)`, dias };
  }
  return { nivel: "fora", peso: 0, rotulo: `Fora do SLA (mais de ${SLA_DIAS_LIMITE} dias)`, dias };
}

function contarPareceresEnviados(candidatosDaVaga) {
  return candidatosDaVaga.filter((c) => (c.parecerComportamental || "").trim().length > 0).length;
}

/** Quantos dias uma vaga já acumulou em Stand By, somando pausas já encerradas
 * (diasStandByAcumulados) com a pausa em andamento, se a vaga estiver em Stand By
 * neste momento. Usado para "descontar" o tempo parado da contagem de dias em aberto. */
function diasPausadosStandBy(vaga) {
  const acumulado = vaga.diasStandByAcumulados || 0;
  if (vaga.emStandBy && vaga.dataInicioStandBy) {
    return acumulado + diasEntre(vaga.dataInicioStandBy, hojeStr());
  }
  return acumulado;
}

/** Adiciona campos calculados (Dias em Aberto, Status do Prazo, Qtd Candidatos, SLA de
 * fechamento, pareceres enviados) a uma vaga, espelhando as fórmulas que existiam na
 * versão Airtable e estendendo com os indicadores de desempenho por consultor.
 * Vagas em Stand By têm o relógio de prazo/SLA pausado: os dias parados não contam
 * como "dias em aberto" e o status de prazo fica congelado em "Em Stand By". */
function computeVagaFields(vaga, candidatosDaVaga = []) {
  const hoje = hojeStr();
  const fimParaCalculo = vaga.dataFechamento || hoje;
  const diasCorridos = diasEntre(vaga.dataAbertura, fimParaCalculo);
  const diasPausados = vaga.dataFechamento ? (vaga.diasStandByAcumulados || 0) : diasPausadosStandBy(vaga);
  const diasEmAberto = Math.max(0, diasCorridos - diasPausados);

  let statusPrazo;
  if (vaga.etapaAtual === "11. Aprovado") {
    statusPrazo = vaga.dataFechamento && vaga.dataFechamento <= vaga.prazoFechamento
      ? "Concluída no Prazo"
      : "Concluída com Atraso";
  } else if (vaga.etapaAtual === "12. Cancelada/Encerrada") {
    statusPrazo = "Encerrada";
  } else if (vaga.emStandBy) {
    statusPrazo = "Em Stand By";
  } else if (hoje > vaga.prazoFechamento) {
    statusPrazo = "Atrasada";
  } else {
    statusPrazo = "No Prazo";
  }

  return {
    ...vaga,
    diasEmAberto,
    statusPrazo,
    qtdCandidatos: candidatosDaVaga.length,
    qtdPareceresEnviados: contarPareceresEnviados(candidatosDaVaga),
    slaFechamento: classificarSlaFechamento(vaga),
    encerrada: ETAPAS_ENCERRADAS.includes(vaga.etapaAtual),
  };
}

module.exports = {
  computeVagaFields,
  classificarSlaFechamento,
  contarPareceresEnviados,
  diasPausadosStandBy,
  diasEntre,
  hojeStr,
};
