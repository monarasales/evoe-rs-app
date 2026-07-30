// Cálculo do valor financeiro de um contrato — usado tanto pela tela de Contratos
// (mostrar o valor total ao lado de cada contrato) quanto pela tela Financeiro
// (faturamento recebido/previsto das vagas em aberto).

/** Valor total (R$) do contrato: valor fixo negociado direto, percentual sobre o
 * salário do cargo cadastrado na vaga, ou valor de permuta (pago em troca de produto/
 * serviço, não em dinheiro). Se a cobrança for por percentual e a vaga ainda não tiver
 * salário preenchido, devolve 0 e sinaliza salarioFaltando — a tela avisa a usuária
 * para completar o cadastro da vaga em vez de fingir que o valor é zero mesmo.
 *
 * Se o contrato tiver um ajuste manual (valorManualOverride, definido pela tela de
 * Financeiro), esse valor vale sempre, por cima do cálculo automático — útil para
 * contratos antigos ou negociados fora do padrão, onde o cálculo automático não
 * reflete o que realmente foi cobrado. O ajuste só afeta os números do Financeiro,
 * não o texto do contrato gerado em PDF/Word. */
function calcularValorContrato(contrato, vaga) {
  if (!contrato) return { valorTotal: 0, salarioFaltando: false, ehPermuta: false };
  if (contrato.valorManualOverride !== null && contrato.valorManualOverride !== undefined) {
    return { valorTotal: Number(contrato.valorManualOverride) || 0, salarioFaltando: false, ehPermuta: contrato.tipoCobranca === "Permuta" };
  }
  if (contrato.tipoCobranca === "ValorFixo") {
    return { valorTotal: Number(contrato.valorFixo) || 0, salarioFaltando: false, ehPermuta: false };
  }
  if (contrato.tipoCobranca === "Permuta") {
    return { valorTotal: Number(contrato.valorPermuta) || 0, salarioFaltando: false, ehPermuta: true };
  }
  const salario = vaga && vaga.salario ? Number(vaga.salario) : 0;
  if (!salario) return { valorTotal: 0, salarioFaltando: true, ehPermuta: false };
  const valorTotal = Math.round(((salario * (Number(contrato.percentualHonorarios) || 0)) / 100) * 100) / 100;
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
