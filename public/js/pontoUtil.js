// Formatação compartilhada pelas telas de ponto (Meu Ponto e Gestão do Ponto).

export function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

export const NOME_DIA = { dom: "Dom", seg: "Seg", ter: "Ter", qua: "Qua", qui: "Qui", sex: "Sex", sab: "Sáb" };
export const NOME_DIA_EXTENSO = { dom: "Domingo", seg: "Segunda", ter: "Terça", qua: "Quarta", qui: "Quinta", sex: "Sexta", sab: "Sábado" };
export const ORDEM_DIAS = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];
export const NOME_MES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/** 485 -> "08:05" */
export function hhmm(min) {
  if (min == null) return "";
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** "08:05" -> 485 */
export function paraMin(hhmmStr) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmmStr || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** 390 -> "6h30" */
export function duracao(min) {
  const abs = Math.abs(min || 0);
  return `${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, "0")}`;
}

/** -75 -> "−1h15", 30 -> "+0h30", 0 -> "0h00" */
export function saldo(min) {
  if (!min) return "0h00";
  return `${min > 0 ? "+" : "−"}${duracao(min)}`;
}

/** "2026-09-27" -> "27/09" */
export function dataCurta(data) {
  const [, m, d] = data.split("-");
  return `${d}/${m}`;
}

/** "2026-09-27" -> "27/09/2026" */
export function dataBr(data) {
  const [a, m, d] = data.split("-");
  return `${d}/${m}/${a}`;
}

/** Célula de saldo/situação do dia, com os estados da documentação. */
export function situacaoDia(d) {
  switch (d.status) {
    case "em_andamento":
      return '<span class="tag tag-standby">em andamento</span>';
    case "incompleto":
      return '<span class="tag tag-prospect-proposta">incompleto — falta marcação</span>';
    case "falta":
      return '<span class="tag tag-atrasada">sem marcação</span>';
    case "abonado":
      return `<span class="tag tag-nprazo">abonado${d.ocorrencia ? ` · ${escapeHtml(d.ocorrencia)}` : ""}</span>${d.saldo ? ` <strong class="saldo-neg">${saldo(d.saldo)}</strong>` : ""}`;
    case "feriado":
      return `<span class="tag tag-encerrada">feriado${d.feriado ? ` · ${escapeHtml(d.feriado)}` : ""}</span>`;
    case "sem_escala":
      return d.foraDaEscala ? '<span class="tag tag-encerrada">fora da escala</span>' : '<span class="tag tag-encerrada">sem expediente</span>';
    case "futuro":
      return "";
    default: {
      const cls = d.saldo < 0 ? "saldo-neg" : d.saldo > 0 ? "saldo-pos" : "";
      return `<strong class="${cls}">${saldo(d.saldo)}</strong>${d.confirmado ? ' <span class="sub">(saída confirmada)</span>' : ""}${d.ocorrencia ? ` <span class="sub">· ${escapeHtml(d.ocorrencia)}</span>` : ""}`;
    }
  }
}

/** Horários do dia; ✎ marca ajuste manual, ⚠️ batida fora do local. */
export function horariosDia(d) {
  if (!d.marcacoesDetalhe || !d.marcacoesDetalhe.length) return '<span class="sub">—</span>';
  return d.marcacoesDetalhe
    .map((mk) => {
      const marca = mk.ajuste ? ' <span title="Ajuste manual">✎</span>' : mk.dentroZona === false ? ' <span title="Fora do local esperado">⚠️</span>' : "";
      return `<span class="marcacao-chip">${hhmm(mk.horaMin)}${marca}</span>`;
    })
    .join(" ");
}

/** Ocorrências do dia (atraso, saída antecipada, almoço) em texto curto. */
export function ocorrenciasDia(d) {
  const itens = [];
  if (d.atrasoMin > 0) itens.push(`atraso ${duracao(d.atrasoMin)}`);
  if (d.atrasoAbonadoMin > 0) itens.push(`atraso abonado ${duracao(d.atrasoAbonadoMin)}`);
  if (d.saidaAntecipadaMin > 0) itens.push(`saída antecipada ${duracao(d.saidaAntecipadaMin)}`);
  if (d.almoco && d.almoco.classificacao !== "adequado") itens.push(`almoço ${d.almoco.classificacao} (${duracao(d.almoco.duracao)})`);
  return itens.length ? `<span class="sub">${itens.join(" · ")}</span>` : "";
}

/** Máscara de data enquanto digita: "30121999" -> "30/12/1999". */
export function mascaraData(valor) {
  const d = String(valor || "").replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** "30/12/1999" -> "1999-12-30"; "" -> ""; data inexistente -> null. */
export function brParaIso(texto) {
  const t = String(texto || "").trim();
  if (!t) return "";
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (!m) return null;
  const [, dia, mes, ano] = m;
  const d = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));
  if (d.getUTCFullYear() !== Number(ano) || d.getUTCMonth() !== Number(mes) - 1 || d.getUTCDate() !== Number(dia)) return null;
  return `${ano}-${mes}-${dia}`;
}

/** Aplica a máscara de data a um campo de texto. */
export function campoData(input) {
  input.addEventListener("input", () => (input.value = mascaraData(input.value)));
}
