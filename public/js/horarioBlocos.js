// horarioEsperado (Controle de Ponto) é uma LISTA de "blocos", cada um com seu
// próprio conjunto de dias e horário (entrada/saida/pausaAlmocoMinutos) — permite,
// por exemplo, Segunda/Quarta/Sexta num turno e Terça/Quinta em outro, para quem
// tem expediente que varia conforme o dia. Espelha server/utils/pontoCompute.js.
// Mantém compatibilidade com cadastros salvos antes dessa mudança, quando
// horarioEsperado era um único objeto (não uma lista).
export function normalizarBlocos(horarioEsperado) {
  if (!horarioEsperado) return [];
  if (Array.isArray(horarioEsperado)) return horarioEsperado;
  if (horarioEsperado.entrada) return [horarioEsperado];
  return [];
}

// Acha o bloco de horário que vale para um dia da semana específico (ex: "Terça").
export function blocoDoDia(horarioEsperado, diaSemana) {
  return normalizarBlocos(horarioEsperado).find((b) => Array.isArray(b.dias) && b.dias.includes(diaSemana)) || null;
}
