import { api } from "../api.js";
import { store, showToast, nomeConsultor } from "../state.js";
import { abrirModal, fecharModal } from "../modal.js";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function formatarData(iso) {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

function formatarMoeda(valor) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor || 0);
}

export async function renderDespesas(root) {
  let mesAtual = new Date().getMonth() + 1;
  let anoAtual = new Date().getFullYear();
  let despesas = [];
  let categorias = [];
  let status = [];

  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Despesas</h2>
        <div class="sub">Gestão de folha de pagamento, benefícios e sistemas.</div>
      </div>
      <button id="btn-nova-despesa" class="btn btn-primary">+ Nova Despesa</button>
    </div>

    <div class="kanban-toolbar">
      <label>
        <span class="sub" style="margin-right:8px;">Mês:</span>
        <select id="filtro-mes" style="width:120px;">
          ${Array.from({length: 12}, (_, i) => {
            const m = i + 1;
            const mStr = String(m).padStart(2, "0");
            return `<option value="${m}" ${m === mesAtual ? "selected" : ""}>
              ${new Date(2000, i).toLocaleDateString("pt-BR", {month: "long"})}
            </option>`;
          }).join("")}
        </select>
      </label>
      <label>
        <span class="sub" style="margin-right:8px;">Ano:</span>
        <input type="number" id="filtro-ano" value="${anoAtual}" style="width:80px;" />
      </label>
      <label>
        <span class="sub" style="margin-right:8px;">Categoria:</span>
        <select id="filtro-categoria">
          <option value="">Todas</option>
        </select>
      </label>
      <label>
        <span class="sub" style="margin-right:8px;">Status:</span>
        <select id="filtro-status">
          <option value="">Todos</option>
        </select>
      </label>
      <button id="btn-gerar-ponto" class="btn btn-outline">⚡ Gerar do Ponto</button>
    </div>

    <div id="despesas-resumo" style="display:flex; gap:16px; margin-bottom:16px;"></div>
    <div id="despesas-tabela"></div>
  `;

  const filtroMes = root.querySelector("#filtro-mes");
  const filtroAno = root.querySelector("#filtro-ano");
  const filtroCategoria = root.querySelector("#filtro-categoria");
  const filtroStatus = root.querySelector("#filtro-status");
  const btnNova = root.querySelector("#btn-nova-despesa");
  const btnGerar = root.querySelector("#btn-gerar-ponto");
  const tabelaEl = root.querySelector("#despesas-tabela");
  const resumoEl = root.querySelector("#despesas-resumo");

  async function carregar() {
    try {
      mesAtual = Number(filtroMes.value);
      anoAtual = Number(filtroAno.value);

      despesas = await api.get("/api/despesas", {
        mes: mesAtual,
        ano: anoAtual,
        categoria: filtroCategoria.value || undefined,
        status: filtroStatus.value || undefined,
      });

      categorias = await api.get("/api/despesas/categorias");
      status = await api.get("/api/despesas/status");

      atualizarFiltros();
      renderizar();
    } catch (err) {
      showToast(err.message, "erro");
    }
  }

  function atualizarFiltros() {
    filtroCategoria.innerHTML = '<option value="">Todas</option>' +
      categorias.map(c => `<option value="${c}">${c}</option>`).join("");

    filtroStatus.innerHTML = '<option value="">Todos</option>' +
      status.map(s => `<option value="${s}">${s}</option>`).join("");
  }

  function renderizar() {
    const totalDespesa = despesas.reduce((sum, d) => sum + (d.valor || 0), 0);
    const aprovadas = despesas.filter(d => d.status === "Aprovado");
    const totalAprovado = aprovadas.reduce((sum, d) => sum + (d.valor || 0), 0);
    const pagas = despesas.filter(d => d.dataPagamento);
    const totalPago = pagas.reduce((sum, d) => sum + (d.valor || 0), 0);

    resumoEl.innerHTML = `
      <div class="kpi-card">
        <div class="kpi-label">Total Despesas</div>
        <div class="kpi-value">${formatarMoeda(totalDespesa)}</div>
        <div class="kpi-sub">${despesas.length} itens</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Aprovadas</div>
        <div class="kpi-value">${formatarMoeda(totalAprovado)}</div>
        <div class="kpi-sub">${aprovadas.length} itens</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Pagas</div>
        <div class="kpi-value">${formatarMoeda(totalPago)}</div>
        <div class="kpi-sub">${pagas.length} itens</div>
      </div>
    `;

    if (despesas.length === 0) {
      tabelaEl.innerHTML = '<div class="empty-state">Nenhuma despesa registrada neste período.</div>';
      return;
    }

    tabelaEl.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Descrição</th>
            <th>Categoria</th>
            <th>Valor</th>
            <th>Vencimento</th>
            <th>Status</th>
            <th>Pagamento</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${despesas.map(d => `
            <tr>
              <td>${escapeHtml(d.descricao)}</td>
              <td>${escapeHtml(d.categoria)}</td>
              <td style="text-align:right; font-weight:500;">${formatarMoeda(d.valor)}</td>
              <td>${formatarData(d.dataPeriodo)}</td>
              <td>
                <span class="tag tag-${d.status === 'Aprovado' ? 'ok' : d.status === 'Pago' ? 'ok' : 'atrasada'}">
                  ${escapeHtml(d.status)}
                </span>
              </td>
              <td>${formatarData(d.dataPagamento)}</td>
              <td>
                <button class="btn btn-outline btn-sm btn-editar" data-id="${d.id}">Editar</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    tabelaEl.querySelectorAll(".btn-editar").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const d = despesas.find(x => x.id === id);
        abrirFormulario(d);
      });
    });
  }

  function abrirFormulario(despesa) {
    const editando = !!despesa;
    abrirModal(`
      <h2>${editando ? "Editar Despesa" : "Nova Despesa"}</h2>
      <form id="form-despesa">
        <div class="form-row">
          <label>Descrição</label>
          <input type="text" id="d-descricao" required value="${editando ? escapeHtml(despesa.descricao) : ""}" />
        </div>
        <div class="form-cols">
          <div class="form-row">
            <label>Categoria</label>
            <select id="d-categoria" required>
              ${categorias.map(c => `<option ${editando && despesa.categoria === c ? "selected" : ""}>${c}</option>`).join("")}
            </select>
          </div>
          <div class="form-row">
            <label>Valor (R$)</label>
            <input type="number" id="d-valor" required step="0.01" value="${editando ? despesa.valor : ""}" />
          </div>
        </div>
        <div class="form-row">
          <label>Data/Período (YYYY-MM)</label>
          <input type="text" id="d-periodo" placeholder="2026-08" value="${editando ? despesa.dataPeriodo : ""}" />
        </div>
        ${editando ? `
          <div class="form-row">
            <label>Status</label>
            <select id="d-status">
              ${status.map(s => `<option ${despesa.status === s ? "selected" : ""}>${s}</option>`).join("")}
            </select>
          </div>
          <div class="form-row">
            <label>Data de Pagamento (YYYY-MM-DD)</label>
            <input type="date" id="d-data-pagamento" value="${despesa.dataPagamento || ""}" />
          </div>
        ` : ""}
        <div class="form-row">
          <label>Observações</label>
          <textarea id="d-obs">${editando ? escapeHtml(despesa.observacoes || "") : ""}</textarea>
        </div>
        <div id="form-erro" class="form-erro hidden"></div>
        <div class="modal-close-row">
          <button type="button" id="btn-cancelar" class="btn btn-outline">Cancelar</button>
          <button type="submit" class="btn btn-primary">${editando ? "Salvar" : "Adicionar"}</button>
        </div>
      </form>
    `);

    root.querySelector("#btn-cancelar").addEventListener("click", fecharModal);

    root.querySelector("#form-despesa").addEventListener("submit", async (e) => {
      e.preventDefault();
      const erroBox = root.querySelector("#form-erro");
      erroBox.classList.add("hidden");

      const payload = {
        descricao: root.querySelector("#d-descricao").value.trim(),
        categoria: root.querySelector("#d-categoria").value,
        valor: Number(root.querySelector("#d-valor").value),
        dataPeriodo: root.querySelector("#d-periodo").value.trim(),
        observacoes: root.querySelector("#d-obs").value.trim(),
      };

      if (editando) {
        payload.status = root.querySelector("#d-status").value;
        payload.dataPagamento = root.querySelector("#d-data-pagamento").value || null;
      }

      try {
        if (editando) {
          await api.patch(`/api/despesas/${despesa.id}`, payload);
          showToast("Despesa atualizada.", "sucesso");
        } else {
          await api.post("/api/despesas", payload);
          showToast("Despesa adicionada.", "sucesso");
        }
        fecharModal();
        carregar();
      } catch (err) {
        erroBox.textContent = err.message;
        erroBox.classList.remove("hidden");
      }
    });
  }

  filtroMes.addEventListener("change", carregar);
  filtroAno.addEventListener("change", carregar);
  filtroCategoria.addEventListener("change", renderizar);
  filtroStatus.addEventListener("change", renderizar);

  btnNova.addEventListener("click", () => abrirFormulario(null));

  btnGerar.addEventListener("click", async () => {
    try {
      const resultado = await api.post("/api/despesas/gerar-do-ponto", {
        mes: mesAtual,
        ano: anoAtual,
      });
      showToast(`${resultado.propostasCount} propostas geradas do Ponto.`, "sucesso");
      carregar();
    } catch (err) {
      showToast(err.message, "erro");
    }
  });

  await carregar();
}
