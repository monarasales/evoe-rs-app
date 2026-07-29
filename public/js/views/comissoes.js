import { api } from "../api.js";
import { formatarData, isGestor, showToast } from "../state.js";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function formatarReal(valor) {
  return (Number(valor) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const MESES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function mesLabel(anoMes) {
  const [ano, mes] = anoMes.split("-");
  return `${MESES_PT[Number(mes) - 1]}/${ano}`;
}

export async function renderComissoes(root) {
  if (!isGestor()) {
    root.innerHTML = '<div class="empty-state">Esta área é restrita ao perfil Gestor.</div>';
    return;
  }

  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Comissões</h2>
        <div class="sub">R$ 30 por vaga fechada dentro do prazo ideal de 10 dias. Vagas de Reposição não geram comissão nova.</div>
      </div>
    </div>
    <div class="kpi-row" id="comissoes-kpis"></div>
    <div class="kanban-toolbar" style="margin-top:16px;">
      <select id="filtro-mes-comissao">
        <option value="">Todos os meses</option>
      </select>
      <select id="filtro-consultor-comissao">
        <option value="">Todos os consultores</option>
      </select>
    </div>
    <h3 class="section-title">Resumo por Consultor</h3>
    <div id="comissoes-resumo-consultor"></div>
    <h3 class="section-title">Vagas Elegíveis</h3>
    <div class="sub" style="margin:-8px 0 12px;">Fechadas até 10 dias corridos após a abertura (SLA Ideal), fora de vagas de Reposição.</div>
    <div id="comissoes-tabela"><div class="empty-state">Carregando...</div></div>
  `;

  let linhas = [];
  let resumoGeral = {};

  const filtroMes = root.querySelector("#filtro-mes-comissao");
  const filtroConsultor = root.querySelector("#filtro-consultor-comissao");

  async function carregar() {
    const dados = await api.get("/api/comissoes");
    linhas = dados.linhas;
    resumoGeral = dados.resumoGeral;
    montarFiltros();
    renderizarTudo();
  }

  function montarFiltros() {
    const mesesUnicos = [...new Set(linhas.map((l) => (l.dataFechamento || "").slice(0, 7)).filter(Boolean))].sort((a, b) => b.localeCompare(a));
    const mesSelecionado = filtroMes.value;
    filtroMes.innerHTML =
      '<option value="">Todos os meses</option>' +
      mesesUnicos.map((m) => `<option value="${m}" ${mesSelecionado === m ? "selected" : ""}>${mesLabel(m)}</option>`).join("");

    const consultoresUnicos = [...new Map(linhas.map((l) => [l.consultorId, l.consultorNome])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
    const consultorSelecionado = filtroConsultor.value;
    filtroConsultor.innerHTML =
      '<option value="">Todos os consultores</option>' +
      consultoresUnicos.map(([id, nome]) => `<option value="${id}" ${consultorSelecionado === id ? "selected" : ""}>${escapeHtml(nome)}</option>`).join("");
  }

  function linhasFiltradas() {
    return linhas.filter((l) => {
      if (filtroMes.value && (l.dataFechamento || "").slice(0, 7) !== filtroMes.value) return false;
      if (filtroConsultor.value && l.consultorId !== filtroConsultor.value) return false;
      return true;
    });
  }

  function renderizarTudo() {
    const filtradas = linhasFiltradas();
    renderizarKpis();
    renderizarResumoConsultor(filtradas);
    renderizarTabela(filtradas);
  }

  function renderizarKpis() {
    root.querySelector("#comissoes-kpis").innerHTML = `
      <div class="kpi-card kpi-destaque ${resumoGeral.qtdPendente > 0 ? "kpi-destaque-alerta" : ""}">
        <div class="kpi-label">Pendente de Pagamento</div>
        <div class="kpi-value">${formatarReal(resumoGeral.valorPendente)}</div>
        <div class="kpi-sub">${resumoGeral.qtdPendente} comissão(ões)</div>
      </div>
      <div class="kpi-card kpi-destaque kpi-destaque-ok">
        <div class="kpi-label">Pago Este Mês</div>
        <div class="kpi-value">${formatarReal(resumoGeral.valorPagaMes)}</div>
        <div class="kpi-sub">${resumoGeral.qtdPagaMes} comissão(ões)</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Pago no Total (histórico)</div>
        <div class="kpi-value">${formatarReal(resumoGeral.valorPagaTotal)}</div>
        <div class="kpi-sub">${resumoGeral.qtdPagaTotal} comissão(ões)</div>
      </div>
    `;
  }

  function renderizarResumoConsultor(filtradas) {
    const el = root.querySelector("#comissoes-resumo-consultor");
    const porConsultor = {};
    filtradas.forEach((l) => {
      const chave = l.consultorId || "sem-consultor";
      if (!porConsultor[chave]) {
        porConsultor[chave] = { nome: l.consultorNome, qtdPendente: 0, valorPendente: 0, qtdPaga: 0, valorPaga: 0 };
      }
      if (l.comissao.paga) {
        porConsultor[chave].qtdPaga += 1;
        porConsultor[chave].valorPaga += l.comissao.valor;
      } else {
        porConsultor[chave].qtdPendente += 1;
        porConsultor[chave].valorPendente += l.comissao.valor;
      }
    });
    const linhasResumo = Object.values(porConsultor).sort((a, b) => a.nome.localeCompare(b.nome));

    if (linhasResumo.length === 0) {
      el.innerHTML = '<div class="empty-state">Nenhuma comissão no filtro atual.</div>';
      return;
    }
    el.innerHTML = `
      <table>
        <thead><tr><th>Consultor</th><th>Pendente</th><th>Pago</th><th>Total no Filtro</th></tr></thead>
        <tbody>
          ${linhasResumo
            .map(
              (c) => `
            <tr>
              <td>${escapeHtml(c.nome)}</td>
              <td>${formatarReal(c.valorPendente)} <span class="sub">(${c.qtdPendente})</span></td>
              <td>${formatarReal(c.valorPaga)} <span class="sub">(${c.qtdPaga})</span></td>
              <td><strong>${formatarReal(c.valorPendente + c.valorPaga)}</strong></td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    `;
  }

  function renderizarTabela(filtradas) {
    const el = root.querySelector("#comissoes-tabela");
    if (filtradas.length === 0) {
      el.innerHTML = '<div class="empty-state">Nenhuma vaga elegível para comissão no filtro atual.</div>';
      return;
    }
    el.innerHTML = `
      <table>
        <thead>
          <tr><th>Vaga</th><th>Empresa</th><th>Consultor</th><th>Fechamento</th><th>Dias</th><th>Valor</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          ${filtradas
            .map(
              (l) => `
            <tr data-id="${l.vagaId}">
              <td>${escapeHtml(l.vagaTitulo)}</td>
              <td>${escapeHtml(l.empresaNome)}</td>
              <td>${escapeHtml(l.consultorNome)}</td>
              <td>${formatarData(l.dataFechamento)}</td>
              <td>${l.diasFechamento}d</td>
              <td>${formatarReal(l.comissao.valor)}</td>
              <td>
                ${
                  l.comissao.paga
                    ? `<span class="tag tag-nprazo">Paga em ${formatarData(l.comissao.pagaEm)}</span>`
                    : '<span class="tag tag-atraso">Pendente</span>'
                }
              </td>
              <td>
                <button class="btn btn-outline btn-sm btn-toggle-comissao" data-paga="${l.comissao.paga ? "1" : "0"}">
                  ${l.comissao.paga ? "Desmarcar" : "Marcar como Paga"}
                </button>
              </td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    `;

    el.querySelectorAll(".btn-toggle-comissao").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const vagaId = e.target.closest("tr").dataset.id;
        const pagaAtualmente = btn.dataset.paga === "1";
        try {
          await api.patch(`/api/comissoes/${vagaId}/marcar-paga`, { paga: !pagaAtualmente });
          showToast(pagaAtualmente ? "Comissão desmarcada." : "Comissão marcada como paga.", "sucesso");
          await carregar();
        } catch (err) {
          showToast(err.message, "erro");
        }
      });
    });
  }

  filtroMes.addEventListener("change", renderizarTudo);
  filtroConsultor.addEventListener("change", renderizarTudo);

  await carregar();
}
