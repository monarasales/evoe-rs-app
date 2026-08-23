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
  let statuses = [];

  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>💸 Despesas</h2>
        <div class="sub">Controle de folha, benefícios, sistemas e outros gastos operacionais.</div>
      </div>
      <button id="btn-nova-despesa" class="btn btn-primary">+ Registrar Despesa</button>
    </div>

    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px; margin-bottom:20px;" id="despesas-resumo"></div>

    <div style="background:var(--bg-alt); padding:16px; border-radius:6px; margin-bottom:20px;">
      <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
        <label style="display:flex; align-items:center; gap:6px;">
          <span class="sub">Período:</span>
          <select id="filtro-mes" style="padding:6px; border:1px solid var(--divider); border-radius:4px;">
            ${Array.from({length: 12}, (_, i) => {
              const m = i + 1;
              return `<option value="${m}" ${m === mesAtual ? "selected" : ""}>
                ${new Date(2000, i).toLocaleDateString("pt-BR", {month: "long"})}
              </option>`;
            }).join("")}
          </select>
          <input type="number" id="filtro-ano" value="${anoAtual}" style="width:70px; padding:6px; border:1px solid var(--divider); border-radius:4px;" />
        </label>

        <label style="display:flex; align-items:center; gap:6px;">
          <span class="sub">Categoria:</span>
          <select id="filtro-categoria" style="padding:6px; border:1px solid var(--divider); border-radius:4px; min-width:150px;">
            <option value="">Todas</option>
          </select>
        </label>

        <label style="display:flex; align-items:center; gap:6px;">
          <span class="sub">Status:</span>
          <select id="filtro-status" style="padding:6px; border:1px solid var(--divider); border-radius:4px; min-width:150px;">
            <option value="">Todos</option>
          </select>
        </label>

        <button id="btn-gerar-ponto" class="btn btn-outline" style="padding:6px 12px; font-size:14px;">⚡ Gerar do Ponto</button>
      </div>
    </div>

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
      statuses = await api.get("/api/despesas/status");

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
      statuses.map(s => `<option value="${s}">${s}</option>`).join("");
  }

  function renderizar() {
    const totalDespesa = despesas.reduce((sum, d) => sum + (d.valor || 0), 0);
    const aprovadas = despesas.filter(d => d.status === "Aprovado");
    const totalAprovado = aprovadas.reduce((sum, d) => sum + (d.valor || 0), 0);
    const pagas = despesas.filter(d => d.dataPagamento);
    const totalPago = pagas.reduce((sum, d) => sum + (d.valor || 0), 0);

    // Totais por categoria
    const porCategoria = {};
    categorias.forEach(cat => {
      const catDespesas = despesas.filter(d => d.categoria === cat);
      porCategoria[cat] = catDespesas.reduce((sum, d) => sum + (d.valor || 0), 0);
    });

    resumoEl.innerHTML = `
      <div style="padding:16px; background:linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius:6px; color:white;">
        <div class="sub" style="color:rgba(255,255,255,0.8); margin-bottom:4px;">Total Geral</div>
        <div style="font-size:28px; font-weight:700;">${formatarMoeda(totalDespesa)}</div>
        <div class="sub" style="color:rgba(255,255,255,0.7); margin-top:4px;">${despesas.length} registros</div>
      </div>
      <div style="padding:16px; background:linear-gradient(135deg, #4CAF50 0%, #45a049 100%); border-radius:6px; color:white;">
        <div class="sub" style="color:rgba(255,255,255,0.8); margin-bottom:4px;">Aprovadas</div>
        <div style="font-size:28px; font-weight:700;">${formatarMoeda(totalAprovado)}</div>
        <div class="sub" style="color:rgba(255,255,255,0.7); margin-top:4px;">${aprovadas.length} despesas</div>
      </div>
      <div style="padding:16px; background:linear-gradient(135deg, #2196F3 0%, #1976D2 100%); border-radius:6px; color:white;">
        <div class="sub" style="color:rgba(255,255,255,0.8); margin-bottom:4px;">Pagas</div>
        <div style="font-size:28px; font-weight:700;">${formatarMoeda(totalPago)}</div>
        <div class="sub" style="color:rgba(255,255,255,0.7); margin-top:4px;">${pagas.length} despesas</div>
      </div>
      <div style="padding:16px; background:#FF9800; border-radius:6px; color:white;">
        <div class="sub" style="color:rgba(255,255,255,0.8); margin-bottom:4px;">Pendentes</div>
        <div style="font-size:28px; font-weight:700;">${formatarMoeda(totalDespesa - totalPago)}</div>
        <div class="sub" style="color:rgba(255,255,255,0.7); margin-top:4px;">${despesas.filter(d => !d.dataPagamento).length} despesas</div>
      </div>
    `;

    if (despesas.length === 0) {
      tabelaEl.innerHTML = '<div class="empty-state" style="padding:40px; text-align:center; background:var(--bg-alt); border-radius:6px;"><div style="font-size:48px; margin-bottom:16px;">💰</div><strong>Nenhuma despesa registrada</strong><div class="sub" style="margin-top:8px;">Registre uma nova despesa para começar</div></div>';
      return;
    }

    // Agrupar por categoria
    const porCat = {};
    categorias.forEach(cat => {
      porCat[cat] = despesas.filter(d => d.categoria === cat);
    });

    let html = '';
    categorias.forEach(cat => {
      const itens = porCat[cat];
      if (itens.length === 0) return;

      const total = itens.reduce((sum, d) => sum + (d.valor || 0), 0);
      html += `
        <div style="margin-bottom:24px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding:0 4px;">
            <strong style="font-size:15px;">${escapeHtml(cat)}</strong>
            <span class="sub" style="font-weight:600;">${formatarMoeda(total)}</span>
          </div>
          <table style="width:100%;">
            <tbody>
              ${itens.map(d => {
                const statusCor = d.status === 'Aprovado' ? '#4CAF50' :
                                  d.status === 'Pago' ? '#2196F3' :
                                  d.status === 'Pendente Aprovação' ? '#FF9800' : '#999';
                return `
                  <tr style="border-bottom:1px solid var(--divider); hover:background:var(--bg-alt);">
                    <td style="padding:12px 8px; flex:1;">
                      <div style="font-weight:500; margin-bottom:2px;">${escapeHtml(d.descricao)}</div>
                      <div class="sub" style="font-size:12px;">${formatarData(d.dataPeriodo)}</div>
                    </td>
                    <td style="padding:12px 8px; text-align:right; width:120px;">
                      <div style="font-weight:600;">${formatarMoeda(d.valor)}</div>
                    </td>
                    <td style="padding:12px 8px; width:160px;">
                      <div style="background:${statusCor}; color:white; padding:4px 8px; border-radius:3px; font-size:12px; text-align:center; font-weight:500;">
                        ${escapeHtml(d.status)}
                      </div>
                    </td>
                    <td style="padding:12px 8px; width:120px; text-align:center;">
                      <span class="sub" style="font-size:12px;">${d.dataPagamento ? formatarData(d.dataPagamento) : '—'}</span>
                    </td>
                    <td style="padding:12px 8px; text-align:right; width:80px;">
                      <button class="btn-editar" data-id="${d.id}" style="background:none; border:none; color:var(--link); cursor:pointer; text-decoration:underline; font-size:13px; padding:0; margin:0;">
                        Editar
                      </button>
                    </td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      `;
    });

    tabelaEl.innerHTML = html;

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
    const mesAtualPadrao = String(mesAtual).padStart(2, "0");

    abrirModal(`
      <h2 style="margin-bottom:20px;">${editando ? "✏️ Editar Despesa" : "➕ Registrar Despesa"}</h2>
      <form id="form-despesa" style="display:flex; flex-direction:column; gap:16px;">
        <div>
          <label style="display:block; font-weight:600; margin-bottom:6px;">O que é?</label>
          <input type="text" id="d-descricao" placeholder="Ex: Salário Junho" required style="width:100%; padding:10px; border:1px solid var(--divider); border-radius:4px; font-size:14px;" value="${editando ? escapeHtml(despesa.descricao) : ""}" />
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div>
            <label style="display:block; font-weight:600; margin-bottom:6px;">Categoria</label>
            <select id="d-categoria" required style="width:100%; padding:10px; border:1px solid var(--divider); border-radius:4px; font-size:14px;">
              ${categorias.map(c => `<option value="${c}" ${editando && despesa.categoria === c ? "selected" : ""}>${c}</option>`).join("")}
            </select>
          </div>
          <div>
            <label style="display:block; font-weight:600; margin-bottom:6px;">Valor (R$)</label>
            <input type="number" id="d-valor" required step="0.01" min="0" style="width:100%; padding:10px; border:1px solid var(--divider); border-radius:4px; font-size:14px;" placeholder="0.00" value="${editando ? despesa.valor : ""}" />
          </div>
        </div>

        <div>
          <label style="display:block; font-weight:600; margin-bottom:6px;">Período (mês/ano)</label>
          <input type="text" id="d-periodo" placeholder="2026-09" style="width:100%; padding:10px; border:1px solid var(--divider); border-radius:4px; font-size:14px;" value="${editando ? despesa.dataPeriodo : `${anoAtual}-${mesAtualPadrao}`}" />
          <div class="sub" style="margin-top:4px; font-size:12px;">Formato: YYYY-MM (ex: 2026-09)</div>
        </div>

        ${editando ? `
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div>
              <label style="display:block; font-weight:600; margin-bottom:6px;">Status</label>
              <select id="d-status" style="width:100%; padding:10px; border:1px solid var(--divider); border-radius:4px; font-size:14px;">
                ${statuses.map(s => `<option ${despesa.status === s ? "selected" : ""}>${s}</option>`).join("")}
              </select>
            </div>
            <div>
              <label style="display:block; font-weight:600; margin-bottom:6px;">Data Pagamento</label>
              <input type="date" id="d-data-pagamento" style="width:100%; padding:10px; border:1px solid var(--divider); border-radius:4px; font-size:14px;" value="${despesa.dataPagamento || ""}" />
            </div>
          </div>
        ` : ""}

        <div>
          <label style="display:block; font-weight:600; margin-bottom:6px;">Notas (opcional)</label>
          <textarea id="d-obs" style="width:100%; padding:10px; border:1px solid var(--divider); border-radius:4px; font-size:14px; resize:vertical; min-height:80px;" placeholder="Adicione qualquer observação...">${editando ? escapeHtml(despesa.observacoes || "") : ""}</textarea>
        </div>

        <div id="form-erro" class="form-erro hidden" style="padding:12px; background:#ffebee; border:1px solid #f44336; border-radius:4px; color:#c62828; display:none;"></div>

        <div style="display:flex; gap:12px; justify-content:flex-end; margin-top:12px; padding-top:12px; border-top:1px solid var(--divider);">
          <button type="button" id="btn-cancelar" class="btn btn-outline">Cancelar</button>
          <button type="submit" class="btn btn-primary">${editando ? "Salvar Alterações" : "Registrar Despesa"}</button>
        </div>
      </form>
    `);

    const form = root.querySelector("#form-despesa");
    const erroBox = root.querySelector("#form-erro");

    root.querySelector("#btn-cancelar").addEventListener("click", fecharModal);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const descricao = root.querySelector("#d-descricao").value.trim();
      const categoria = root.querySelector("#d-categoria").value;
      const valor = Number(root.querySelector("#d-valor").value);
      const dataPeriodo = root.querySelector("#d-periodo").value.trim();
      const observacoes = root.querySelector("#d-obs").value.trim();

      // Validações
      if (!descricao) {
        mostrarErro("Descrição é obrigatória");
        return;
      }
      if (!categoria) {
        mostrarErro("Categoria é obrigatória");
        return;
      }
      if (!valor || valor <= 0) {
        mostrarErro("Valor deve ser maior que zero");
        return;
      }
      if (!dataPeriodo) {
        mostrarErro("Período é obrigatório");
        return;
      }

      const payload = { descricao, categoria, valor, dataPeriodo, observacoes };

      if (editando) {
        payload.status = root.querySelector("#d-status").value;
        payload.dataPagamento = root.querySelector("#d-data-pagamento").value || null;
      }

      try {
        if (editando) {
          await api.patch(`/api/despesas/${despesa.id}`, payload);
          showToast("✅ Despesa atualizada com sucesso", "sucesso");
        } else {
          await api.post("/api/despesas", payload);
          showToast("✅ Despesa registrada com sucesso", "sucesso");
        }
        fecharModal();
        await carregar();
      } catch (err) {
        mostrarErro(err.message || "Erro ao salvar despesa");
      }
    });

    function mostrarErro(msg) {
      erroBox.textContent = msg;
      erroBox.style.display = "block";
      erroBox.classList.remove("hidden");
    }
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
