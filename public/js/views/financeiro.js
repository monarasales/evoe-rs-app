import { api } from "../api.js";
import { formatarData, isGestor } from "../state.js";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function formatarReal(valor) {
  return (Number(valor) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function tagVencimento(dias) {
  if (dias === null) return '<span class="tag tag-encerrada">sem data</span>';
  if (dias < 0) return `<span class="tag tag-atrasada">vencida há ${Math.abs(dias)}d</span>`;
  if (dias === 0) return '<span class="tag tag-atraso">vence hoje</span>';
  if (dias <= 7) return `<span class="tag tag-atraso">em ${dias}d</span>`;
  return `<span class="tag tag-nprazo">em ${dias}d</span>`;
}

export async function renderFinanceiro(root) {
  if (!isGestor()) {
    root.innerHTML = '<div class="empty-state">Esta área é restrita ao perfil Gestor.</div>';
    return;
  }
  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Financeiro</h2>
        <div class="sub">Faturamento das vagas em aberto: o que já entrou (1ª parcela, recebida ao abrir a vaga) e o que está previsto para os próximos 30 dias (2ª parcela).</div>
      </div>
    </div>
    <div id="financeiro-avisos"></div>
    <div class="kpi-row" id="financeiro-kpis"></div>
    <h3 class="section-title">Vagas em Aberto com Contrato</h3>
    <div class="sub" style="margin:-8px 0 12px;">Uma linha por contrato de vaga ainda aberta — ordenado pela 2ª parcela mais próxima de vencer.</div>
    <div id="financeiro-tabela"><div class="empty-state">Carregando...</div></div>
  `;

  const dados = await api.get("/api/financeiro");
  const { linhas, resumo } = dados;

  const avisosEl = root.querySelector("#financeiro-avisos");
  const avisos = [];
  if (resumo.qtdSemSalario > 0) {
    avisos.push(
      `${resumo.qtdSemSalario} contrato(s) cobrado(s) por percentual sem o salário do cargo preenchido na vaga — o valor deles não entra nos totais abaixo. Edite a vaga (Funil de Vagas) e preencha o campo "Salário do cargo".`
    );
  }
  if (resumo.vagasAbertasSemContrato > 0) {
    avisos.push(
      `${resumo.vagasAbertasSemContrato} vaga(s) em aberto ainda não têm contrato gerado — não entram no faturamento até você gerar o contrato em Contratos.`
    );
  }
  if (resumo.qtdReposicaoDentroGarantia > 0) {
    avisos.push(
      `${resumo.qtdReposicaoDentroGarantia} vaga(s) de reposição ainda dentro do prazo de garantia do contrato original — confirme com o cliente antes de cobrar novamente (veja a coluna "Reposição" na tabela abaixo).`
    );
  }
  if (resumo.qtdPermuta > 0) {
    avisos.push(
      `${resumo.qtdPermuta} contrato(s) em regime de Permuta — não é dinheiro em caixa, por isso não entram em "Já Recebido", "Previsto" nem "Vencido". O valor deles aparece separado no card "Em Permuta".`
    );
  }
  avisosEl.innerHTML = avisos.length
    ? avisos.map((a) => `<div class="form-erro" style="background:var(--warning-bg); color:var(--warning); margin-bottom:10px;">${escapeHtml(a)}</div>`).join("")
    : "";

  root.querySelector("#financeiro-kpis").innerHTML = `
    <div class="kpi-card kpi-destaque kpi-destaque-ok">
      <div class="kpi-label">Já Recebido (1ª parcela)</div>
      <div class="kpi-value">${formatarReal(resumo.recebido)}</div>
      <div class="kpi-sub">Das vagas em aberto com contrato</div>
    </div>
    <div class="kpi-card kpi-destaque">
      <div class="kpi-label">Previsto — Próximos 30 dias</div>
      <div class="kpi-value">${formatarReal(resumo.previsto30dias)}</div>
      <div class="kpi-sub">2ª parcela com vencimento nos próximos 30 dias</div>
    </div>
    <div class="kpi-card kpi-destaque ${resumo.vencidoNaoRecebido > 0 ? "kpi-destaque-alerta" : ""}">
      <div class="kpi-label">Vencido e Não Cobrado</div>
      <div class="kpi-value">${formatarReal(resumo.vencidoNaoRecebido)}</div>
      <div class="kpi-sub">2ª parcela com vencimento já passado</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Total Contratado (vagas abertas)</div>
      <div class="kpi-value">${formatarReal(resumo.totalContratado)}</div>
      <div class="kpi-sub">Inclui os ${formatarReal(resumo.totalPermuta)} em Permuta abaixo</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Ainda a Receber (em dinheiro)</div>
      <div class="kpi-value">${formatarReal(resumo.aReceberTotal)}</div>
    </div>
    ${
      resumo.qtdPermuta > 0
        ? `<div class="kpi-card">
            <div class="kpi-label">Em Permuta (não é caixa)</div>
            <div class="kpi-value">${formatarReal(resumo.totalPermuta)}</div>
            <div class="kpi-sub">${resumo.qtdPermuta} contrato(s)</div>
          </div>`
        : ""
    }
  `;

  const tabelaEl = root.querySelector("#financeiro-tabela");
  if (linhas.length === 0) {
    tabelaEl.innerHTML = '<div class="empty-state">Nenhum contrato vinculado a vagas em aberto ainda.</div>';
    return;
  }
  tabelaEl.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Contrato</th><th>Vaga</th><th>Empresa</th><th>Consultor</th><th>Tipo</th>
          <th>Valor Total</th><th>1ª Parcela (recebido)</th><th>2ª Parcela (previsto)</th><th>Vencimento 2ª Parcela</th><th>Reposição</th>
        </tr>
      </thead>
      <tbody>
        ${linhas
          .map(
            (l) => `
          <tr>
            <td><strong>${escapeHtml(l.numero)}</strong></td>
            <td>${escapeHtml(l.vagaTitulo)}</td>
            <td>${escapeHtml(l.empresaNome)}</td>
            <td>${escapeHtml(l.consultorNome)}</td>
            <td>${l.ehPermuta ? '<span class="tag tag-standby">Permuta</span>' : (l.tipoCobranca === "ValorFixo" ? "Valor Fixo" : "Percentual")}</td>
            <td>${l.salarioFaltando ? '<span class="sub">sem salário</span>' : formatarReal(l.valorTotal)}</td>
            <td>${formatarReal(l.valorParcela1)}${l.ehPermuta ? ' <span class="sub">(permuta)</span>' : ""}</td>
            <td>${formatarReal(l.valorParcela2)}${l.ehPermuta ? ' <span class="sub">(permuta)</span>' : ""}</td>
            <td>${l.dataVencimentoParcela2 ? formatarData(l.dataVencimentoParcela2) : "—"} ${tagVencimento(l.diasParcela2)}</td>
            <td>${
              !l.reposicaoInfo
                ? "—"
                : l.reposicaoInfo.dentroGarantia
                ? '<span class="tag tag-atraso" title="Dentro do prazo de garantia — confirme antes de cobrar de novo">🔁 Em garantia</span>'
                : '<span class="tag tag-reposicao" title="Reposição fora do prazo de garantia">🔁 Reposição</span>'
            }</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
}
