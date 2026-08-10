// Solicitações de Vaga: pedidos recebidos pelo link público (public/solicitar-vaga.html),
// sem login do cliente. Ficam "Pendente" até o Gestor revisar (e corrigir, se precisar)
// e aprovar — só então viram uma vaga de verdade no funil. Supervisora só visualiza.
import { api } from "../api.js";
import { store, showToast, isGestor, podeGerenciarVagas, formatarData } from "../state.js";
import { abrirModal, fecharModal } from "../modal.js";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function formatarDataHora(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

const TAG_STATUS = {
  Pendente: "tag-standby",
  Aprovada: "tag-nprazo",
  Rejeitada: "tag-atrasada",
};

function linkPublico() {
  return `${window.location.origin}/solicitar-vaga.html`;
}

export async function renderSolicitacoesVaga(root) {
  if (!podeGerenciarVagas()) {
    root.innerHTML = '<div class="empty-state">Esta área é restrita a Gestor e Supervisora.</div>';
    return;
  }

  let statusAtivo = "Pendente";

  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Solicitações de Vaga</h2>
        <div class="sub">Pedidos recebidos pelo link público — revise e aprove antes de virarem vaga no funil.</div>
      </div>
      <button id="btn-copiar-link" class="btn btn-outline btn-sm">🔗 Copiar link para o cliente</button>
    </div>
    <div class="tabs" id="sol-tabs">
      ${["Pendente", "Aprovada", "Rejeitada"].map((s) => `<button type="button" class="tab-btn" data-status="${s}">${s === "Pendente" ? "Pendentes" : s === "Aprovada" ? "Aprovadas" : "Rejeitadas"}</button>`).join("")}
    </div>
    <div id="sol-conteudo"></div>
  `;

  root.querySelector("#btn-copiar-link").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(linkPublico());
      showToast("Link copiado! Já pode enviar para o cliente.", "sucesso");
    } catch (e) {
      prompt("Copie o link abaixo:", linkPublico());
    }
  });

  const conteudo = root.querySelector("#sol-conteudo");
  const tabsEl = root.querySelector("#sol-tabs");

  function marcarAbaAtiva() {
    tabsEl.querySelectorAll(".tab-btn").forEach((btn) => btn.classList.toggle("ativo", btn.dataset.status === statusAtivo));
  }
  tabsEl.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      statusAtivo = btn.dataset.status;
      marcarAbaAtiva();
      carregar();
    });
  });
  marcarAbaAtiva();

  async function carregar() {
    conteudo.innerHTML = '<div class="empty-state">Carregando...</div>';
    const lista = await api.get(`/api/solicitacoes-vaga?status=${encodeURIComponent(statusAtivo)}`);
    renderizarLista(lista);
  }

  function renderizarLista(lista) {
    if (lista.length === 0) {
      conteudo.innerHTML = `<div class="empty-state">Nenhuma solicitação ${statusAtivo === "Pendente" ? "pendente" : statusAtivo.toLowerCase()} no momento.</div>`;
      return;
    }
    conteudo.innerHTML = `
      <table>
        <thead>
          <tr><th>Empresa</th><th>Vaga</th><th>Contato</th><th>Recebida em</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          ${lista
            .map(
              (s) => `
            <tr data-id="${s.id}">
              <td>${escapeHtml(s.nomeEmpresa)}</td>
              <td>${escapeHtml(s.tituloVaga)}</td>
              <td>${escapeHtml(s.emailContato || s.whatsappContato || "—")}</td>
              <td>${formatarDataHora(s.createdAt)}</td>
              <td><span class="tag ${TAG_STATUS[s.status]}">${s.status}</span></td>
              <td style="white-space:nowrap;">
                <button class="btn btn-outline btn-sm btn-ver">Ver</button>
                ${s.status === "Pendente" && isGestor() ? '<button class="btn btn-primary btn-sm btn-aprovar">Aprovar</button>' : ""}
                ${s.status === "Pendente" && isGestor() ? '<button class="btn btn-outline btn-sm btn-rejeitar" style="color:#c0392b;">Rejeitar</button>' : ""}
              </td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    `;

    conteudo.querySelectorAll(".btn-ver").forEach((btn) =>
      btn.addEventListener("click", (e) => abrirModalDetalhe(lista.find((s) => s.id === e.target.closest("tr").dataset.id)))
    );
    conteudo.querySelectorAll(".btn-aprovar").forEach((btn) =>
      btn.addEventListener("click", (e) => abrirModalAprovar(lista.find((s) => s.id === e.target.closest("tr").dataset.id)))
    );
    conteudo.querySelectorAll(".btn-rejeitar").forEach((btn) =>
      btn.addEventListener("click", (e) => rejeitar(lista.find((s) => s.id === e.target.closest("tr").dataset.id)))
    );
  }

  function abrirModalDetalhe(s) {
    abrirModal(`
      <h2>${escapeHtml(s.tituloVaga)}</h2>
      <p class="login-sub" style="text-align:left; margin-bottom:16px;">Recebida em ${formatarDataHora(s.createdAt)} — status: <span class="tag ${TAG_STATUS[s.status]}">${s.status}</span></p>
      <div class="form-row"><label>Empresa</label><input type="text" value="${escapeHtml(s.nomeEmpresa)}${s.cnpj ? " — " + escapeHtml(s.cnpj) : ""}" disabled /></div>
      <div class="form-row"><label>Contato</label><input type="text" value="${escapeHtml([s.contatoResponsavel, s.emailContato, s.whatsappContato].filter(Boolean).join(" · ") || "—")}" disabled /></div>
      <div class="form-row"><label>Perfil da vaga</label><textarea disabled>${escapeHtml(s.perfilVaga || "—")}</textarea></div>
      <div class="form-cols">
        <div class="form-row"><label>Salário informado</label><input type="text" value="${s.salario ? "R$ " + s.salario : "—"}" disabled /></div>
        <div class="form-row"><label>Prazo desejado</label><input type="text" value="${escapeHtml(s.prazoDesejado || "—")}" disabled /></div>
      </div>
      <div class="form-row"><label>Observações</label><textarea disabled>${escapeHtml(s.observacoes || "—")}</textarea></div>
      ${s.status === "Rejeitada" && s.motivoRejeicao ? `<div class="form-row"><label>Motivo da rejeição</label><textarea disabled>${escapeHtml(s.motivoRejeicao)}</textarea></div>` : ""}
      <div class="modal-close-row">
        <button type="button" id="btn-fechar-detalhe" class="btn btn-outline">Fechar</button>
      </div>
    `);
    document.getElementById("btn-fechar-detalhe").addEventListener("click", fecharModal);
  }

  async function rejeitar(s) {
    const motivo = prompt(`Motivo da rejeição de "${s.tituloVaga}" (opcional):`) || "";
    try {
      await api.patch(`/api/solicitacoes-vaga/${s.id}/rejeitar`, { motivo });
      showToast("Solicitação rejeitada.", "sucesso");
      carregar();
    } catch (err) {
      showToast(err.message, "erro");
    }
  }

  function abrirModalAprovar(s) {
    const consultoresElegiveis = store.consultores.filter((c) => c.ativo && (c.perfil === "Recrutador" || c.perfil === "Supervisora" || c.perfil === "Gestor"));
    abrirModal(`
      <h2>Aprovar Solicitação — Criar Vaga</h2>
      <p class="login-sub" style="text-align:left; margin-bottom:16px;">Confira e ajuste os dados antes de criar a vaga. O que o cliente enviou já vem preenchido.</p>
      <form id="form-aprovar">
        <h3 class="section-title" style="margin-top:0;">Empresa</h3>
        <div class="form-row">
          <label>Empresa</label>
          <select id="ap-empresa">
            <option value="">— Nova empresa (dados abaixo) —</option>
            ${store.empresas.map((e) => `<option value="${e.id}">${escapeHtml(e.nome)}</option>`).join("")}
          </select>
        </div>
        <div id="ap-nova-empresa">
          <div class="form-cols">
            <div class="form-row"><label>Nome da empresa</label><input type="text" id="ap-ne-nome" value="${escapeHtml(s.nomeEmpresa)}" /></div>
            <div class="form-row"><label>CNPJ</label><input type="text" id="ap-ne-cnpj" value="${escapeHtml(s.cnpj || "")}" /></div>
          </div>
          <div class="form-cols">
            <div class="form-row"><label>Contato</label><input type="text" id="ap-ne-contato" value="${escapeHtml(s.contatoResponsavel || "")}" /></div>
            <div class="form-row"><label>E-mail</label><input type="text" id="ap-ne-email" value="${escapeHtml(s.emailContato || "")}" /></div>
          </div>
          <div class="form-row"><label>WhatsApp</label><input type="text" id="ap-ne-whatsapp" value="${escapeHtml(s.whatsappContato || "")}" /></div>
        </div>

        <h3 class="section-title">Vaga</h3>
        <div class="form-row"><label>Título</label><input type="text" id="ap-titulo" required value="${escapeHtml(s.tituloVaga)}" /></div>
        <div class="form-cols">
          <div class="form-row"><label>Consultor responsável</label>
            <select id="ap-consultor" required>
              ${consultoresElegiveis.map((c) => `<option value="${c.id}" ${c.id === store.usuario.id ? "selected" : ""}>${escapeHtml(c.nome)}</option>`).join("")}
            </select>
          </div>
          <div class="form-row"><label>Prioridade</label>
            <select id="ap-prioridade">
              ${["Alta", "Média", "Baixa"].map((p) => `<option ${p === "Média" ? "selected" : ""}>${p}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="form-cols">
          <div class="form-row"><label>Data de abertura</label><input type="date" id="ap-abertura" required value="${new Date().toISOString().slice(0, 10)}" /></div>
          <div class="form-row"><label>Prazo de fechamento</label><input type="date" id="ap-prazo" required /></div>
        </div>
        <div class="sub" style="margin-top:-6px; margin-bottom:10px;">Prazo desejado pelo cliente: ${escapeHtml(s.prazoDesejado || "não informado")} — confirme uma data.</div>
        <div class="form-row"><label>Salário do cargo (R$)</label><input type="number" min="0" step="0.01" id="ap-salario" value="${s.salario || ""}" /></div>
        <div class="form-row"><label>Perfil da vaga</label><textarea id="ap-perfil">${escapeHtml(s.perfilVaga || "")}</textarea></div>
        <div class="form-row"><label>Observações</label><textarea id="ap-obs">${escapeHtml(s.observacoes || "")}</textarea></div>

        <div id="aprovar-erro" class="form-erro hidden"></div>
        <div class="modal-close-row">
          <button type="button" id="btn-cancelar-aprovar" class="btn btn-outline">Fechar</button>
          <button type="submit" class="btn btn-primary">Aprovar e criar vaga</button>
        </div>
      </form>
    `);

    document.getElementById("btn-cancelar-aprovar").addEventListener("click", fecharModal);
    const selectEmpresa = document.getElementById("ap-empresa");
    const blocoNovaEmpresa = document.getElementById("ap-nova-empresa");
    selectEmpresa.addEventListener("change", () => {
      blocoNovaEmpresa.style.display = selectEmpresa.value ? "none" : "";
    });

    document.getElementById("form-aprovar").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const erroEl = document.getElementById("aprovar-erro");
      erroEl.classList.add("hidden");

      const empresaId = selectEmpresa.value || undefined;
      const payload = {
        titulo: document.getElementById("ap-titulo").value.trim(),
        consultorId: document.getElementById("ap-consultor").value,
        prioridade: document.getElementById("ap-prioridade").value,
        dataAbertura: document.getElementById("ap-abertura").value,
        prazoFechamento: document.getElementById("ap-prazo").value,
        salario: document.getElementById("ap-salario").value,
        perfilVaga: document.getElementById("ap-perfil").value.trim(),
        observacoes: document.getElementById("ap-obs").value.trim(),
        empresaId,
        novaEmpresa: empresaId
          ? undefined
          : {
              nome: document.getElementById("ap-ne-nome").value.trim(),
              cnpj: document.getElementById("ap-ne-cnpj").value.trim(),
              contatoResponsavel: document.getElementById("ap-ne-contato").value.trim(),
              emailContato: document.getElementById("ap-ne-email").value.trim(),
              whatsappContato: document.getElementById("ap-ne-whatsapp").value.trim(),
            },
      };

      try {
        await api.patch(`/api/solicitacoes-vaga/${s.id}/aprovar`, payload);
        showToast("Vaga criada a partir da solicitação!", "sucesso");
        fecharModal();
        carregar();
        const empresasAtualizadas = await api.get("/api/empresas");
        store.empresas = empresasAtualizadas;
        window.__evoe.atualizarBadgeNotificacoes();
      } catch (err) {
        erroEl.textContent = err.message;
        erroEl.classList.remove("hidden");
      }
    });
  }

  await carregar();
}
