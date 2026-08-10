// Cálculo do valor financeiro de um contrato — usado tanto pela tela de Contratos
// (mostrar o valor total ao lado de cada contrato) quanto pela tela Financeiro
// (faturamento recebido/previsto das vagas em aberto).

/** Valor total (R$) do contrato: valor fixo negociado direto, percentual sobre o
 * salário do cargo cadastrado na vaga (mais a comissão estimada, para vagas da área
 * comercial), ou valor de permuta (pago em troca de produto/serviço, não em dinheiro).
 * Se a cobrança for por percentual e a vaga ainda não tiver salário preenchido, devolve
 * 0 e sinaliza salarioFaltando — a tela avisa a usuária para completar o cadastro da
 * vaga em vez de fingir que o valor é zero mesmo.
 *
 * Ordem de prioridade dos overrides:
 * 1. valorManualOverride — ajuste feito na tela Financeiro (só Gestor), pensado pra
 *    corrigir contratos antigos/fora do padrão. Só afeta os números do Financeiro,
 *    nunca o texto do contrato em PDF/Word.
 * 2. valorTotalPersonalizado — valor final digitado direto no formulário do Contrato
 *    (qualquer tipo de cobrança). Vale tanto para os números quanto, se a usuária não
 *    tiver escrito uma cláusula própria, para o texto do contrato.
 * 3. Cálculo automático (percentual × salário+comissão, valor fixo, ou permuta). */
function calcularValorContrato(contrato, vaga) {
  if (!contrato) return { valorTotal: 0, salarioFaltando: false, ehPermuta: false };
  if (contrato.valorManualOverride !== null && contrato.valorManualOverride !== undefined) {
    return { valorTotal: Number(contrato.valorManualOverride) || 0, salarioFaltando: false, ehPermuta: contrato.tipoCobranca === "Permuta" };
  }
  if (contrato.valorTotalPersonalizado !== null && contrato.valorTotalPersonalizado !== undefined) {
    return { valorTotal: Number(contrato.valorTotalPersonalizado) || 0, salarioFaltando: false, ehPermuta: contrato.tipoCobranca === "Permuta" };
  }
  if (contrato.tipoCobranca === "ValorFixo") {
    return { valorTotal: Number(contrato.valorFixo) || 0, salarioFaltando: false, ehPermuta: false };
  }
  if (contrato.tipoCobranca === "Permuta") {
    return { valorTotal: Number(contrato.valorPermuta) || 0, salarioFaltando: false, ehPermuta: true };
  }
  const salario = vaga && vaga.salario ? Number(vaga.salario) : 0;
  if (!salario) return { valorTotal: 0, salarioFaltando: true, ehPermuta: false };
  const comissao = Number(contrato.comissaoEstimada) || 0;
  const valorTotal = Math.round((((salario + comissao) * (Number(contrato.percentualHonorarios) || 0)) / 100) * 100) / 100;
  return { valorTotal, salarioFaltando: false, ehPermuta: false };
}

/** Divide o valor total do contrato nas duas parcelas (percentuais definidos no
 * próprio contrato), a partir do valor calculado por calcularValorContrato. */
function calcularParcelas(contrato, vaga) {
  const { valorTotal, salarioFaltando, ehPermuta } = calcularValorContrato(contrato, vaga);
  const valorParcela1 = Math.round(((valorTotal * (Number(contrato.parcelaInicialPct) || 0)) / 100) * 100) / 100;
  const valorParcela2 = Math.round(((valorTotal * (Number(contrato.parcelaFechamentoPct) || 0)) / 100) * 100) / 100;
  return { valorTotal, valorParcela1, valorParcela2, salarioFaltando, ehPermuta };
}

module.exports = { calcularValorContrato, calcularParcelas };
