// Cálculo do valor financeiro de um contrato — usado tanto pela tela de Contratos
// (mostrar o valor total ao lado de cada contrato) quanto pela tela Financeiro
// (faturamento recebido/previsto das vagas em aberto).

/** Valor total (R$) do contrato: valor fixo negociado direto, ou percentual sobre o
 * salário do cargo cadastrado na vaga. Se a cobrança for por percentual e a vaga ainda
 * não tiver salário preenchido, devolve 0 e sinaliza salarioFaltando — a tela avisa a
 * usuária para completar o cadastro da vaga em vez de fingir que o valor é zero mesmo. */
function calcularValorContrato(contrato, vaga) {
  if (!contrato) return { valorTotal: 0, salarioFaltando: false };
  if (contrato.tipoCobranca === "ValorFixo") {
    return { valorTotal: Number(contrato.valorFixo) || 0, salarioFaltando: false };
  }
  const salario = vaga && vaga.salario ? Number(vaga.salario) : 0;
  if (!salario) return { valorTotal: 0, salarioFaltando: true };
  const valorTotal = Math.round(((salario * (Number(contrato.percentualHonorarios) || 0)) / 100) * 100) / 100;
  return { valorTotal, salarioFaltando: false };
}

/** Divide o valor total do contrato nas duas parcelas (percentuais definidos no
 * próprio contrato), a partir do valor calculado por calcularValorContrato. */
function calcularParcelas(contrato, vaga) {
  const { valorTotal, salarioFaltando } = calcularValorContrato(contrato, vaga);
  const valorParcela1 = Math.round(((valorTotal * (Number(contrato.parcelaInicialPct) || 0)) / 100) * 100) / 100;
  const valorParcela2 = Math.round(((valorTotal * (Number(contrato.parcelaFechamentoPct) || 0)) / 100) * 100) / 100;
  return { valorTotal, valorParcela1, valorParcela2, salarioFaltando };
}

module.exports = { calcularValorContrato, calcularParcelas };
