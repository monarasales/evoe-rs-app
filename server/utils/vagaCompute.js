const { ETAPAS_ENCERRADAS, SLA_DIAS_IDEAL, SLA_DIAS_LIMITE, VALOR_COMISSAO_FECHAMENTO } = require("./constants");

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

/** Comissão por fechamento de vaga: elegível quando a vaga fecha (11. Aprovado) dentro
 * do SLA ideal (SLA_DIAS_IDEAL dias — a mesma faixa "ideal" já usada no ranking de SLA,
 * sem descontar Stand By) e não é uma vaga de Reposição (substituição já paga na
 * colocação original não gera comissão nova). O status de pagamento (`paga`) é o único
 * dado que fica gravado na vaga — o resto é sempre recalculado, então nunca fica
 * desatualizado mesmo em vagas fechadas antes dessa funcionalidade existir.
 *
 * Fluxo de solicitação/aprovação (evita pagar em duplicidade): a Supervisora
 * solicita o pagamento de uma comissão elegível (`solicitada`), o Gestor recebe
 * notificação e aprova (marca como paga) ou recusa (volta para elegível, liberando
 * uma nova solicitação). Enquanto `solicitada` e não `paga`, o sistema não deixa
 * solicitar de novo — só um pedido em aberto por vez. */
function computarComissao(vaga) {
  const sla = classificarSlaFechamento(vaga);
  const elegivel = vaga.etapaAtual === "11. Aprovado" && vaga.tipoVaga !== "Reposição" && !!sla && sla.nivel === "ideal";
  return {
    elegivel,
    valor: elegivel ? VALOR_COMISSAO_FECHAMENTO : 0,
    solicitada: !!vaga.comissaoSolicitada,
    solicitadaEm: vaga.comissaoSolicitadaEm || null,
    solicitadaPorId: vaga.comissaoSolicitadaPorId || null,
    paga: !!vaga.comissaoPaga,
    pagaEm: vaga.comissaoPagaEm || null,
    pagaPorId: vaga.comissaoPagaPorId || null,
  };
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
    comissao: computarComissao(vaga),
    encerrada: ETAPAS_ENCERRADAS.includes(vaga.etapaAtual),
  };
}

/** Para uma vaga de Reposição, verifica se ainda está dentro do prazo de garantia
 * combinado no contrato da vaga de origem (prazoReposicaoDias) — usado para alertar
 * no Financeiro que essa reposição pode não gerar cobrança nova ao cliente. Recebe a
 * vaga de origem e o contrato dela já resolvidos (sem acesso a `db` aqui, para manter
 * este módulo livre de I/O — quem chama busca no banco e repassa). */
function computarReposicaoInfo(vaga, vagaOrigem, contratoOrigem) {
  if (vaga.tipoVaga !== "Reposição" || !vaga.vagaOrigemId) return null;
  if (!vagaOrigem) return { vagaOrigemTitulo: null, prazoReposicaoDias: null, dentroGarantia: null };

  let dentroGarantia = null;
  let prazoReposicaoDias = null;
  if (contratoOrigem && vagaOrigem.dataFechamento) {
    prazoReposicaoDias = contratoOrigem.prazoReposicaoDias;
    const diasDesdeFechamento = diasEntre(vagaOrigem.dataFechamento, hojeStr());
    dentroGarantia = diasDesdeFechamento <= prazoReposicaoDias;
  }
  return {
    vagaOrigemTitulo: vagaOrigem.titulo,
    prazoReposicaoDias,
    dentroGarantia,
  };
}

module.exports = {
  computeVagaFields,
  classificarSlaFechamento,
  contarPareceresEnviados,
  diasPausadosStandBy,
  computarReposicaoInfo,
  computarComissao,
  diasEntre,
  hojeStr,
};
