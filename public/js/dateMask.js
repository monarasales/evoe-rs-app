// Campo de data digitado (dd/mm/aaaa) em vez do <input type="date"> nativo.
//
// Motivo: em alguns navegadores/sistemas, o input type="date" nativo apaga o campo
// inteiro quando a usuária termina de digitar o ano dentro dele (um bug conhecido de
// como esses navegadores validam o valor enquanto ainda está sendo digitado). Aqui a
// gente usa um campo de texto comum com máscara própria — só números, insere as
// barras sozinho — que nunca perde o que já foi digitado, e escreve/lê no mesmo
// formato ISO (AAAA-MM-DD) que o resto do sistema já usa.

/** Converte "AAAA-MM-DD" (formato salvo no banco) para "dd/mm/aaaa" (formato exibido). */
export function isoParaBr(iso) {
  if (!iso) return "";
  const [ano, mes, dia] = String(iso).slice(0, 10).split("-");
  if (!ano || !mes || !dia) return "";
  return `${dia}/${mes}/${ano}`;
}

/** Converte "dd/mm/aaaa" (ou os dígitos digitados) para "AAAA-MM-DD". Devolve "" se
 * ainda não tiver os 8 dígitos (data incompleta). */
export function brParaIso(br) {
  const digitos = (br || "").replace(/\D/g, "");
  if (digitos.length !== 8) return "";
  const dia = digitos.slice(0, 2);
  const mes = digitos.slice(2, 4);
  const ano = digitos.slice(4, 8);
  return `${ano}-${mes}-${dia}`;
}

/** Confere se uma data "AAAA-MM-DD" realmente existe no calendário (rejeita, por
 * exemplo, 31/02 ou 00/13). */
export function isoValida(iso) {
  if (!iso) return false;
  const [ano, mes, dia] = iso.split("-").map(Number);
  if (!ano || !mes || !dia) return false;
  const d = new Date(ano, mes - 1, dia);
  return d.getFullYear() === ano && d.getMonth() === mes - 1 && d.getDate() === dia && ano > 1900 && ano < 2100;
}

/** Liga a máscara dd/mm/aaaa num <input type="text">: formata enquanto digita e nunca
 * apaga o campo sozinho. Use com um <input type="text" inputmode="numeric" placeholder="dd/mm/aaaa">. */
export function aplicarMascaraData(input) {
  input.addEventListener("input", () => {
    const digitos = input.value.replace(/\D/g, "").slice(0, 8);
    let formatado = digitos;
    if (digitos.length > 4) {
      formatado = `${digitos.slice(0, 2)}/${digitos.slice(2, 4)}/${digitos.slice(4)}`;
    } else if (digitos.length > 2) {
      formatado = `${digitos.slice(0, 2)}/${digitos.slice(2)}`;
    }
    input.value = formatado;
  });
}
