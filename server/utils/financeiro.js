// Cálculo do valor financeiro de um contrato — usado tanto pela tela de Contratos
// (mostrar o valor total ao lado de cada contrato) quanto pela tela Financeiro
// (faturamento recebido/previsto das vagas em aberto).

/** Valor total (R$) do contrato: valor fixo negociado direto, percentual sobre o(s)
 * salário(s) do(s) cargo(s) cadastrado(s) na(s) vaga(s) do contrato (mais a comissão
 * estimada, para vagas da área comercial), ou valor de permuta (pago em troca de
 * produto/serviço, não em dinheiro). Um contrato normalmente cobre uma única vaga, mas
 * pode agrupar mais de uma do MESMO cliente (ex: o cliente abre duas vagas juntas) —
 * nesse caso o percentual/condições são os mesmos, mas a base de cálculo soma o
 * salário de cada vaga (vagasAdicionais), já que os valores costumam ser diferentes.
 * Se a cobrança for por percentual e QUALQUER uma das vagas ainda não tiver salário
 * preenchido, devolve 0 e sinaliza salarioFaltando — a tela avisa a usuária para
 * completar o cadastro da vaga em vez de fingir que o valor é zero mesmo.
 *
 * Ordem de prioridade dos overrides:
 * 1. valorManualOverride — ajuste feito na tela Financeiro (só Gestor), pensado pra
 *    corrigir contratos antigos/fora do padrão. Só afeta os números do Financeiro,
 *    nunca o texto do contrato em PDF/Word.
 * 2. valorTotalPersonalizado — valor final digitado direto no formulário do Contrato
 *    (qualquer tipo de cobrança). Vale tanto para os números quanto, se a usuária não
 *    tiver escrito uma cláusula própria, para o texto do contrato.
 * 3. Cálculo automático (percentual × soma dos salários+comissão, valor fixo, ou permuta). */
function calcularValorContrato(contrato, vaga, vagasAdicionais = []) {
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
  const todasVagas = [vaga, ...(vagasAdicionais || [])].filter(Boolean);
  if (todasVagas.length === 0 || todasVagas.some((v) => !v.salario)) {
    return { valorTotal: 0, salarioFaltando: true, ehPermuta: false };
  }
  const salarioTotal = todasVagas.reduce((soma, v) => soma + Number(v.salario), 0);
  const comissao = Number(contrato.comissaoEstimada) || 0;
  const valorTotal = Math.round((((salarioTotal + comissao) * (Number(contrato.percentualHonorarios) || 0)) / 100) * 100) / 100;
  return { valorTotal, salarioFaltando: false, ehPermuta: false };
}

/** Divide o valor total do contrato nas duas parcelas (percentuais definidos no
 * próprio contrato), a partir do valor calculado por calcularValorContrato. */
function calcularParcelas(contrato, vaga, vagasAdicionais = []) {
  const { valorTotal, salarioFaltando, ehPermuta } = calcularValorContrato(contrato, vaga, vagasAdicionais);
  const valorParcela1 = Math.round(((valorTotal * (Number(contrato.parcelaInicialPct) || 0)) / 100) * 100) / 100;
  const valorParcela2 = Math.round(((valorTotal * (Number(contrato.parcelaFechamentoPct) || 0)) / 100) * 100) / 100;
  return { valorTotal, valorParcela1, valorParcela2, salarioFaltando, ehPermuta };
}

/** Junta uma lista de nomes de cargo numa frase em português ("A", "A e B", "A, B e C") —
 * usado pra descrever contratos que agrupam mais de uma vaga do mesmo cliente. */
function formatarListaCargos(titulos) {
  const lista = (titulos || []).filter(Boolean);
  if (lista.length <= 1) return lista[0] || "";
  if (lista.length === 2) return `${lista[0]} e ${lista[1]}`;
  return `${lista.slice(0, -1).join(", ")} e ${lista[lista.length - 1]}`;
}

module.exports = { calcularValorContrato, calcularParcelas, formatarListaCargos };
