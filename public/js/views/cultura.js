import { api } from "../api.js";
import { store, showToast, nomeEmpresa, nomeConsultor } from "../state.js";
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

export async function renderCultura(root) {
  let projetos = [];
  let empresas = [];
  let projetoSelecionado = null;

  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Cultura Organizacional</h2>
        <div class="sub">Gerenciar projetos de implementação de cultura dos clientes.</div>
      </div>
      <button id="btn-novo-projeto" class="btn btn-primary">+ Novo Projeto</button>
    </div>

    <div class="kanban-toolbar">
      <label>
        <span class="sub" style="margin-right:8px;">Cliente:</span>
        <select id="filtro-empresa">
          <option value="">Todos os clientes</option>
        </select>
      </label>
      <label>
        <span class="sub" style="margin-right:8px;">Status:</span>
        <select id="filtro-status">
          <option value="">Todos</option>
          <option value="Diagnóstico">Diagnóstico</option>
          <option value="Planejamento">Planejamento</option>
          <option value="Implementação">Implementação</option>
          <option value="Acompanhamento">Acompanhamento</option>
          <option value="Encerramento">Encerramento</option>
        </select>
      </label>
    </div>

    <div id="cultura-projetos" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:16px; margin-bottom:20px;"></div>
    <div id="cultura-detalhe"></div>
  `;

  const filtroEmpresa = root.querySelector("#filtro-empresa");
  const filtroStatus = root.querySelector("#filtro-status");
  const btnNovo = root.querySelector("#btn-novo-projeto");
  const projetosEl = root.querySelector("#cultura-projetos");
  const detalheEl = root.querySelector("#cultura-detalhe");

  async function carregar() {
    try {
      projetos = await api.get("/api/cultura/projetos", {
        empresaId: filtroEmpresa.value || undefined,
        status: filtroStatus.value || undefined,
      });

      empresas = await api.get("/api/empresas");
      atualizarFiltros();
      renderizarProjetos();
    } catch (err) {
      showToast(err.message, "erro");
    }
  }

  function atualizarFiltros() {
    filtroEmpresa.innerHTML = '<option value="">Todos os clientes</option>' +
      empresas.map(e => `<option value="${e.id}">${escapeHtml(e.nome)}</option>`).join("");
  }

  function renderizarProjetos() {
    if (projetos.length === 0) {
      projetosEl.innerHTML = '<div class="empty-state" style="grid-column:1/-1;">Nenhum projeto registrado.</div>';
      return;
    }

    projetosEl.innerHTML = projetos.map(p => `
      <div class="kanban-card" data-id="${p.id}" style="cursor:pointer;">
        <div style="margin-bottom:8px;">
          <strong>${escapeHtml(p.titulo)}</strong>
          <div class="sub">${nomeEmpresa(p.empresaId)}</div>
        </div>
        <div style="margin-bottom:8px;">
          <span class="tag tag-${p.status === 'Encerramento' ? 'ok' : p.status === 'Implementação' ? 'atrasada' : ''}">${p.status}</span>
        </div>
        <div class="sub" style="margin-bottom:6px;">
          Início: ${formatarData(p.dataInicio)}<br>
          Fim: ${formatarData(p.dataFim)}
        </div>
        <div style="display:flex; gap:6px;">
          <div style="flex:1; height:6px; background:#e0e0e0; border-radius:3px;">
            <div style="height:100%; background:#4CAF50; border-radius:3px; width:${p.progresso}%;"></div>
          </div>
          <span class="sub" style="min-width:30px;">${p.progresso}%</span>
        </div>
      </div>
    `).join("");

    projetosEl.querySelectorAll(".kanban-card").forEach(card => {
      card.addEventListener("click", () => {
        const id = card.dataset.id;
        projetoSelecionado = projetos.find(p => p.id === id);
        renderizarDetalhe();
      });
    });
  }

  function renderizarDetalhe() {
    if (!projetoSelecionado) {
      detalheEl.innerHTML = "";
      return;
    }

    detalheEl.innerHTML = `
      <div style="border-top:1px solid var(--divider); padding-top:20px; margin-top:20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <h3 class="section-title" style="margin:0;">${escapeHtml(projetoSelecionado.titulo)}</h3>
          <div style="display:flex; gap:8px;">
            <button id="btn-editar-projeto" class="btn btn-outline btn-sm">Editar</button>
            <button id="btn-nova-acao" class="btn btn-primary btn-sm">+ Ação</button>
          </div>
        </div>
        <div style="margin-bottom:16px;">
          <strong>Descrição:</strong><br>
          <div class="sub">${escapeHtml(projetoSelecionado.descricao || "—")}</div>
        </div>
        <div style="margin-bottom:16px;">
          <strong>Objetivos:</strong><br>
          <div class="sub">${escapeHtml(projetoSelecionado.objetivos || "—")}</div>
        </div>
        <div id="acoes-timeline"></div>
      </div>
    `;

    root.querySelector("#btn-editar-projeto").addEventListener("click", () => abrirFormularioProjeto(projetoSelecionado));
    root.querySelector("#btn-nova-acao").addEventListener("click", () => abrirFormularioAcao(projetoSelecionado.id));

    carregarAcoes();
  }

  async function carregarAcoes() {
    try {
      const acoes = await api.get(`/api/cultura/projetos/${projetoSelecionado.id}/acoes`);
      renderizarAcoes(acoes);
    } catch (err) {
      showToast(err.message, "erro");
    }
  }

  function renderizarAcoes(acoes) {
    const timelineEl = root.querySelector("#acoes-timeline");
    if (!timelineEl) return;

    if (acoes.length === 0) {
      timelineEl.innerHTML = '<div class="sub">Nenhuma ação registrada neste projeto.</div>';
      return;
    }

    timelineEl.innerHTML = `
      <strong style="display:block; margin-bottom:12px;">Timeline de Ações:</strong>
      <div style="display:flex; flex-direction:column; gap:12px;">
        ${acoes.map((a, i) => `
          <div style="display:flex; gap:12px; padding:12px; background:var(--bg-alt); border-radius:4px;">
            <div style="flex-shrink:0; width:32px; height:32px; border-radius:50%; background:${a.status === 'Concluída' ? '#4CAF50' : a.status === 'Atrasada' ? '#f44336' : '#2196F3'}; display:flex; align-items:center; justify-content:center; color:white; font-weight:bold;">
              ${i + 1}
            </div>
            <div style="flex:1;">
              <div style="font-weight:500; margin-bottom:4px;">${escapeHtml(a.titulo)}</div>
              <div class="sub" style="margin-bottom:6px;">${escapeHtml(a.descricao || "")}</div>
              <div style="display:flex; gap:12px; font-size:12px;">
                <span class="tag tag-${a.status === 'Concluída' ? 'ok' : a.status === 'Atrasada' ? 'atrasada' : ''}">${a.status}</span>
                <span class="sub">Etapa: ${a.etapa}</span>
                <span class="sub">Prazo: ${formatarData(a.dataVencimento)}</span>
              </div>
              <button class="btn-editar-acao" data-id="${a.id}" style="margin-top:8px; padding:4px 8px; font-size:12px; cursor:pointer; border:none; background:transparent; color:var(--text); text-decoration:underline;">
                Editar
              </button>
            </div>
          </div>
        `).join("")}
      </div>
    `;

    timelineEl.querySelectorAll(".btn-editar-acao").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const acao = acoes.find(a => a.id === id);
        abrirFormularioAcao(projetoSelecionado.id, acao);
      });
    });
  }

  function abrirFormularioProjeto(projeto) {
    const editando = !!projeto;
    abrirModal(`
      <h2>${editando ? "Editar Projeto" : "Novo Projeto"}</h2>
      <form id="form-projeto">
        <div class="form-row">
          <label>Título</label>
          <input type="text" id="p-titulo" required value="${editando ? escapeHtml(projeto.titulo) : ""}" />
        </div>
        <div class="form-row">
          <label>Cliente</label>
          <select id="p-empresa" required ${editando ? "disabled" : ""}>
            ${empresas.map(e => `<option value="${e.id}" ${editando && projeto.empresaId === e.id ? "selected" : ""}>${escapeHtml(e.nome)}</option>`).join("")}
          </select>
        </div>
        <div class="form-row">
          <label>Descrição</label>
          <textarea id="p-descricao">${editando ? escapeHtml(projeto.descricao || "") : ""}</textarea>
        </div>
        <div class="form-row">
          <label>Objetivos</label>
          <textarea id="p-objetivos">${editando ? escapeHtml(projeto.objetivos || "") : ""}</textarea>
        </div>
        <div class="form-cols">
          <div class="form-row">
            <label>Data Início</label>
            <input type="date" id="p-inicio" value="${editando && projeto.dataInicio ? projeto.dataInicio : ""}" />
          </div>
          <div class="form-row">
            <label>Data Fim</label>
            <input type="date" id="p-fim" value="${editando && projeto.dataFim ? projeto.dataFim : ""}" />
          </div>
        </div>
        ${editando ? `
          <div class="form-row">
            <label>Status</label>
            <select id="p-status">
              <option ${projeto.status === 'Diagnóstico' ? "selected" : ""}>Diagnóstico</option>
              <option ${projeto.status === 'Planejamento' ? "selected" : ""}>Planejamento</option>
              <option ${projeto.status === 'Implementação' ? "selected" : ""}>Implementação</option>
              <option ${projeto.status === 'Acompanhamento' ? "selected" : ""}>Acompanhamento</option>
              <option ${projeto.status === 'Encerramento' ? "selected" : ""}>Encerramento</option>
            </select>
          </div>
        ` : ""}
        <div id="form-erro" class="form-erro hidden"></div>
        <div class="modal-close-row">
          <button type="button" id="btn-cancelar" class="btn btn-outline">Cancelar</button>
          <button type="submit" class="btn btn-primary">${editando ? "Salvar" : "Criar"}</button>
        </div>
      </form>
    `);

    root.querySelector("#btn-cancelar").addEventListener("click", fecharModal);

    root.querySelector("#form-projeto").addEventListener("submit", async (e) => {
      e.preventDefault();
      const erroBox = root.querySelector("#form-erro");
      erroBox.classList.add("hidden");

      const payload = {
        titulo: root.querySelector("#p-titulo").value.trim(),
        empresaId: root.querySelector("#p-empresa").value,
        descricao: root.querySelector("#p-descricao").value.trim(),
        objetivos: root.querySelector("#p-objetivos").value.trim(),
        dataInicio: root.querySelector("#p-inicio").value || null,
        dataFim: root.querySelector("#p-fim").value || null,
      };

      if (editando) {
        payload.status = root.querySelector("#p-status").value;
      }

      try {
        if (editando) {
          await api.patch(`/api/cultura/projetos/${projeto.id}`, payload);
          showToast("Projeto atualizado.", "sucesso");
        } else {
          await api.post("/api/cultura/projetos", payload);
          showToast("Projeto criado.", "sucesso");
        }
        fecharModal();
        carregar();
      } catch (err) {
        erroBox.textContent = err.message;
        erroBox.classList.remove("hidden");
      }
    });
  }

  function abrirFormularioAcao(projetoId, acao) {
    const editando = !!acao;
    abrirModal(`
      <h2>${editando ? "Editar Ação" : "Nova Ação"}</h2>
      <form id="form-acao">
        <div class="form-row">
          <label>Título</label>
          <input type="text" id="a-titulo" required value="${editando ? escapeHtml(acao.titulo) : ""}" />
        </div>
        <div class="form-row">
          <label>Descrição</label>
          <textarea id="a-descricao">${editando ? escapeHtml(acao.descricao || "") : ""}</textarea>
        </div>
        <div class="form-cols">
          <div class="form-row">
            <label>Etapa</label>
            <select id="a-etapa">
              <option ${!editando || acao.etapa === 'Implementação' ? "selected" : ""}>Implementação</option>
              <option ${editando && acao.etapa === 'Diagnóstico' ? "selected" : ""}>Diagnóstico</option>
              <option ${editando && acao.etapa === 'Planejamento' ? "selected" : ""}>Planejamento</option>
              <option ${editando && acao.etapa === 'Acompanhamento' ? "selected" : ""}>Acompanhamento</option>
              <option ${editando && acao.etapa === 'Encerramento' ? "selected" : ""}>Encerramento</option>
            </select>
          </div>
          <div class="form-row">
            <label>Data Vencimento</label>
            <input type="date" id="a-vencimento" value="${editando && acao.dataVencimento ? acao.dataVencimento : ""}" />
          </div>
        </div>
        ${editando ? `
          <div class="form-row">
            <label>Status</label>
            <select id="a-status">
              <option ${acao.status === 'Não Iniciada' ? "selected" : ""}>Não Iniciada</option>
              <option ${acao.status === 'Em Andamento' ? "selected" : ""}>Em Andamento</option>
              <option ${acao.status === 'Concluída' ? "selected" : ""}>Concluída</option>
              <option ${acao.status === 'Atrasada' ? "selected" : ""}>Atrasada</option>
            </select>
          </div>
        ` : ""}
        <div class="form-row">
          <label>Observações</label>
          <textarea id="a-obs">${editando ? escapeHtml(acao.observacoes || "") : ""}</textarea>
        </div>
        <div id="form-erro" class="form-erro hidden"></div>
        <div class="modal-close-row">
          <button type="button" id="btn-cancelar" class="btn btn-outline">Cancelar</button>
          <button type="submit" class="btn btn-primary">${editando ? "Salvar" : "Criar"}</button>
        </div>
      </form>
    `);

    root.querySelector("#btn-cancelar").addEventListener("click", fecharModal);

    root.querySelector("#form-acao").addEventListener("submit", async (e) => {
      e.preventDefault();
      const erroBox = root.querySelector("#form-erro");
      erroBox.classList.add("hidden");

      const payload = {
        titulo: root.querySelector("#a-titulo").value.trim(),
        descricao: root.querySelector("#a-descricao").value.trim(),
        etapa: root.querySelector("#a-etapa").value,
        dataVencimento: root.querySelector("#a-vencimento").value || null,
        observacoes: root.querySelector("#a-obs").value.trim(),
      };

      if (editando) {
        payload.status = root.querySelector("#a-status").value;
      }

      try {
        if (editando) {
          await api.patch(`/api/cultura/acoes/${acao.id}`, payload);
          showToast("Ação atualizada.", "sucesso");
        } else {
          await api.post(`/api/cultura/projetos/${projetoId}/acoes`, payload);
          showToast("Ação criada.", "sucesso");
        }
        fecharModal();
        carregar();
        renderizarDetalhe();
      } catch (err) {
        erroBox.textContent = err.message;
        erroBox.classList.remove("hidden");
      }
    });
  }

  filtroEmpresa.addEventListener("change", carregar);
  filtroStatus.addEventListener("change", carregar);
  btnNovo.addEventListener("click", () => abrirFormularioProjeto(null));

  await carregar();
}
