import { api } from "../api.js";
import { formatarData, isGestor, showToast } from "../state.js";
import { abrirModal, fecharModal } from "../modal.js";

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
    <div class="sub" style="margin:-8px 0 12px;">Uma linha por contrato de vaga ainda aberta — ordenado pela 2ª parcela mais próxima de vencer. Clique no lápis para editar a vaga (título/salário) ou ajustar manualmente o valor total do contrato.</div>
    <div id="financeiro-tabela"><div class="empty-state">Carregando...</div></div>
  `;

  async function carregarERenderizar() {
    const dados = await api.get("/api/financeiro");
    const { linhas, resumo } = dados;

    const avisosEl = root.querySelector("#financeiro-avisos");
    const avisos = [];
    if (resumo.qtdSemSalario > 0) {
      avisos.push(
        `${resumo.qtdSemSalario} contrato(s) cobrado(s) por percentual sem o salário do cargo preenchido na vaga — o valor deles não entra nos totais abaixo. Clique no lápis ao lado da vaga, na tabela, para preencher o salário (ou edite em Funil de Vagas).`
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
        <div class="kpi-sub">Das vagas em aberto com contrato, em qualquer data</div>
      </div>
      <div class="kpi-card kpi-destaque">
        <div class="kpi-label">Previsto — Próximos 30 dias</div>
        <div class="kpi-value">${formatarReal(resumo.previsto30dias)}</div>
        <div class="kpi-sub">Próximas parcelas (2ª, 3ª, etc) com vencimento nos próximos 30 dias</div>
      </div>
      <div class="kpi-card kpi-destaque ${resumo.vencidoNaoRecebido > 0 ? "kpi-destaque-alerta" : ""}">
        <div class="kpi-label">Vencido e Não Cobrado</div>
        <div class="kpi-value">${formatarReal(resumo.vencidoNaoRecebido)}</div>
        <div class="kpi-sub">Parcelas com vencimento já passado</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Total Contratado (vagas abertas)</div>
        <div class="kpi-value">${formatarReal(resumo.totalContratado)}</div>
        <div class="kpi-sub">Inclui os ${formatarReal(resumo.totalPermuta)} em Permuta abaixo</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Ainda a Receber (em dinheiro)</div>
        <div class="kpi-value">${formatarReal(resumo.aReceberTotal)}</div>
        <div class="kpi-sub">Tudo que falta receber, de qualquer data (não só os próximos 30 dias acima)</div>
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
            <th>Valor Total</th><th>1ª Parcela</th><th>2ª Parcela</th><th style="display:none;" class="col-parcela3">3ª Parcela</th><th>Próx. Vencimento</th><th>Reposição</th>
          </tr>
        </thead>
        <tbody>
          ${linhas
            .map(
              (l) => {
                const tem3Parcelas = l.numParcelas === 3;
                return `
            <tr data-contrato-id="${l.contratoId}" data-vaga-id="${l.vagaId}" class="${tem3Parcelas ? 'tem-3-parcelas' : ''}">
              <td><strong>${escapeHtml(l.numero)}</strong></td>
              <td>
                ${escapeHtml(l.vagaTitulo)}
                <button type="button" class="btn-icone btn-editar-vaga-fin" title="Editar título e salário desta vaga">✎</button>
              </td>
              <td>${escapeHtml(l.empresaNome)}</td>
              <td>${escapeHtml(l.consultorNome)}</td>
              <td>${l.ehPermuta ? '<span class="tag tag-standby">Permuta</span>' : (l.tipoCobranca === "ValorFixo" ? "Valor Fixo" : "Percentual")}</td>
              <td>
                ${l.salarioFaltando ? '<span class="sub">sem salário</span>' : formatarReal(l.valorTotal)}
                ${l.ehAjusteManual ? ' <span class="tag tag-standby" title="Valor ajustado manualmente, fora do cálculo automático">ajustado</span>' : ""}
                <button type="button" class="btn-icone btn-ajustar-valor-fin" title="Ajustar manualmente o valor total deste contrato">✎</button>
              </td>
              <td>
                <div>${formatarReal(l.valorParcela1)}${l.ehPermuta ? ' <span class="sub">(permuta)</span>' : ""}</div>
                <div class="sub">${l.dataVencimentoParcela1 ? formatarData(l.dataVencimentoParcela1) : "—"}</div>
              </td>
              <td>
                <div>${formatarReal(l.valorParcela2)}${l.ehPermuta ? ' <span class="sub">(permuta)</span>' : ""}</div>
                <div class="sub">${l.dataVencimentoParcela2 ? formatarData(l.dataVencimentoParcela2) : "—"}</div>
              </td>
              <td style="display:none;" class="col-parcela3">
                <div>${formatarReal(l.valorParcela3 || 0)}${l.ehPermuta ? ' <span class="sub">(permuta)</span>' : ""}</div>
                <div class="sub">${l.dataVencimentoParcela3 ? formatarData(l.dataVencimentoParcela3) : "—"}</div>
              </td>
              <td>${tem3Parcelas ? (l.dataVencimentoParcela3 ? formatarData(l.dataVencimentoParcela3) : "—") : (l.dataVencimentoParcela2 ? formatarData(l.dataVencimentoParcela2) : "—")} ${tem3Parcelas ? tagVencimento(l.diasParcela3) : tagVencimento(l.diasParcela2)}</td>
              <td>${
                !l.reposicaoInfo
                  ? "—"
                  : l.reposicaoInfo.dentroGarantia
                  ? '<span class="tag tag-atraso" title="Dentro do prazo de garantia — confirme antes de cobrar de novo">🔁 Em garantia</span>'
                  : '<span class="tag tag-reposicao" title="Reposição fora do prazo de garantia">🔁 Reposição</span>'
              }</td>
            </tr>`;
              }
            )
            .join("")}
        </tbody>
      </table>
    `;

    // Se houver pelo menos um contrato com 3 parcelas, mostra a coluna
    const tem3Parcelas = linhas.some(l => l.numParcelas === 3);
    if (tem3Parcelas) {
      tabelaEl.querySelectorAll('.col-parcela3').forEach(el => el.style.display = '');
    }

    tabelaEl.querySelectorAll(".btn-editar-vaga-fin").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const tr = e.target.closest("tr");
        const linha = linhas.find((l) => l.vagaId === tr.dataset.vagaId);
        abrirModalEditarVaga(linha);
      });
    });
    tabelaEl.querySelectorAll(".btn-ajustar-valor-fin").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const tr = e.target.closest("tr");
        const linha = linhas.find((l) => l.contratoId === tr.dataset.contratoId);
        abrirModalAjusteValor(linha);
      });
    });
  }

  function abrirModalEditarVaga(linha) {
    // Um contrato normalmente tem uma vaga só, mas pode agrupar mais de uma do mesmo
    // cliente (vagas adicionais) — nesse caso mostra um título/salário por vaga, já
    // que os valores costumam ser diferentes entre elas.
    const vagasLista = linha.vagasDoContrato && linha.vagasDoContrato.length ? linha.vagasDoContrato : [{ id: linha.vagaId, titulo: linha.vagaTitulo, salario: linha.vagaSalario }];
    abrirModal(`
      <h2>Editar Vaga${vagasLista.length > 1 ? "s deste Contrato" : ""}</h2>
      <div class="sub" style="margin-top:-6px; margin-bottom:14px;">Altere aqui o título ou o salário do cargo — a mudança aparece automaticamente no Funil de Vagas também, é o mesmo cadastro.${vagasLista.length > 1 ? " Este contrato agrupa mais de uma vaga do mesmo cliente, então cada uma tem seu próprio salário." : ""}</div>
      <form id="form-vaga-fin">
        ${vagasLista
          .map(
            (v, i) => `
          <div class="form-cols" data-vaga-id="${v.id}">
            <div class="form-row"><label>Título da vaga</label><input type="text" class="vf-titulo" required value="${escapeHtml(v.titulo)}" /></div>
            <div class="form-row"><label>Salário do cargo (R$)</label><input type="number" class="vf-salario" min="0" step="0.01" value="${v.salario || ""}" /></div>
          </div>`
          )
          .join("")}
        <div id="vf-erro" class="form-erro hidden"></div>
        <div class="modal-close-row">
          <button type="button" id="btn-cancelar-vf" class="btn btn-outline">Fechar</button>
          <button type="submit" class="btn btn-primary">Salvar</button>
        </div>
      </form>
    `);
    document.getElementById("btn-cancelar-vf").addEventListener("click", fecharModal);
    document.getElementById("form-vaga-fin").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try {
        const linhasForm = Array.from(document.querySelectorAll("#form-vaga-fin .form-cols"));
        await Promise.all(
          linhasForm.map((div) =>
            api.patch(`/api/vagas/${div.dataset.vagaId}`, {
              titulo: div.querySelector(".vf-titulo").value.trim(),
              salario: div.querySelector(".vf-salario").value,
            })
          )
        );
        showToast(vagasLista.length > 1 ? "Vagas atualizadas." : "Vaga atualizada.", "sucesso");
        fecharModal();
        await carregarERenderizar();
      } catch (err) {
        const box = document.getElementById("vf-erro");
        box.textContent = err.message;
        box.classList.remove("hidden");
      }
    });
  }

  function abrirModalAjusteValor(linha) {
    abrirModal(`
      <h2>Ajustar Valor Total do Contrato</h2>
      <div class="sub" style="margin-top:-6px; margin-bottom:14px;">
        Use isso quando o cálculo automático (percentual × salário, valor fixo ou permuta) não bater com o que
        realmente foi cobrado — por exemplo um contrato antigo. O ajuste só muda os números do Financeiro,
        não mexe no contrato gerado em PDF/Word.
      </div>
      <form id="form-ajuste-valor">
        <div class="form-row"><label>Valor total do contrato (R$)</label><input type="number" id="av-valor" min="0" step="0.01" value="${linha.ehAjusteManual ? linha.valorTotal : ""}" placeholder="${formatarReal(linha.valorTotal)}" /></div>
        <div class="sub" style="margin-bottom:10px;">Deixe em branco e salve para voltar ao cálculo automático.</div>
        <div id="av-erro" class="form-erro hidden"></div>
        <div class="modal-close-row">
          <button type="button" id="btn-cancelar-av" class="btn btn-outline">Fechar</button>
          <button type="submit" class="btn btn-primary">Salvar</button>
        </div>
      </form>
    `);
    document.getElementById("btn-cancelar-av").addEventListener("click", fecharModal);
    document.getElementById("form-ajuste-valor").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try {
        await api.patch(`/api/contratos/${linha.contratoId}/ajuste-financeiro`, {
          valorManualOverride: document.getElementById("av-valor").value,
        });
        showToast("Valor do contrato atualizado.", "sucesso");
        fecharModal();
        await carregarERenderizar();
      } catch (err) {
        const box = document.getElementById("av-erro");
        box.textContent = err.message;
        box.classList.remove("hidden");
      }
    });
  }

  await carregarERenderizar();
}
