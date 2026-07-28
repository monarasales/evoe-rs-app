import { api } from "../api.js";
import { store, showToast } from "../state.js";
import { abrirModal, fecharModal } from "../modal.js";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

// Banco de Talentos: candidatos que já foram contatados mas não têm interesse na
// vaga ou não deram retorno ficam numa aba separada dos candidatos engajados
// (convocados, entrevistados etc.), mas continuam cadastrados para reaproveitar
// em vagas futuras. Espelha ETAPAS_SEM_RETORNO em server/utils/constants.js.
const ETAPAS_SEM_RETORNO = ["Sem Interesse", "Não Respondeu"];

const ABAS = [
  { id: "ativos", label: "Candidatos" },
  { id: "banco", label: "Sem Interesse / Sem Retorno" },
];

export async function renderCandidatos(root, params) {
  let abaAtiva = "ativos";
  let todosCandidatos = [];

  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Candidatos</h2>
        <div class="sub">Acompanhamento do sub-funil de cada candidato dentro da vaga.</div>
      </div>
      <button id="btn-novo-candidato" class="btn btn-primary">+ Novo Candidato</button>
    </div>
    <div class="kanban-toolbar">
      <select id="filtro-vaga">
        <option value="">Todas as vagas</option>
      </select>
    </div>
    <div class="tabs" id="candidatos-tabs">
      ${ABAS.map((a) => `<button type="button" class="tab-btn" data-aba="${a.id}">${a.label}</button>`).join("")}
    </div>
    <div id="candidatos-tabela"></div>
  `;

  const vagas = await api.get("/api/vagas");
  const filtroVaga = root.querySelector("#filtro-vaga");
  filtroVaga.innerHTML =
    '<option value="">Todas as vagas</option>' +
    vagas.map((v) => `<option value="${v.id}" ${params.vagaId === v.id ? "selected" : ""}>${v.titulo}</option>`).join("");

  const tabsEl = root.querySelector("#candidatos-tabs");

  function contagemBanco() {
    return todosCandidatos.filter((c) => ETAPAS_SEM_RETORNO.includes(c.etapaCandidato)).length;
  }

  function marcarAbaAtiva() {
    tabsEl.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.classList.toggle("ativo", btn.dataset.aba === abaAtiva);
      if (btn.dataset.aba === "banco") {
        const qtd = contagemBanco();
        btn.textContent = qtd > 0 ? `Sem Interesse / Sem Retorno (${qtd})` : "Sem Interesse / Sem Retorno";
      }
    });
  }

  tabsEl.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      abaAtiva = btn.dataset.aba;
      marcarAbaAtiva();
      renderizarTabela();
    });
  });

  async function carregar() {
    const qs = filtroVaga.value ? `?vagaId=${filtroVaga.value}` : "";
    todosCandidatos = await api.get(`/api/candidatos${qs}`);
    marcarAbaAtiva();
    renderizarTabela();
  }

  function vagaTitulo(id) {
    const v = vagas.find((x) => x.id === id);
    return v ? v.titulo : "—";
  }

  function renderizarTabela() {
    const el = root.querySelector("#candidatos-tabela");
    const candidatos = todosCandidatos.filter((c) =>
      abaAtiva === "banco" ? ETAPAS_SEM_RETORNO.includes(c.etapaCandidato) : !ETAPAS_SEM_RETORNO.includes(c.etapaCandidato)
    );

    if (candidatos.length === 0) {
      el.innerHTML =
        abaAtiva === "banco"
          ? '<div class="empty-state">Nenhum candidato sem interesse ou sem retorno por aqui.</div>'
          : '<div class="empty-state">Nenhum candidato encontrado.</div>';
      return;
    }

    if (abaAtiva === "banco") {
      el.innerHTML = `
        <div class="sub" style="margin-bottom:10px;">Candidatos contatados que não tiveram interesse na vaga ou não responderam — ficam aqui para futuro reaproveitamento, sem poluir o funil ativo.</div>
        <table>
          <thead>
            <tr><th>Nome</th><th>Vaga</th><th>Situação</th><th>Telefone</th><th></th></tr>
          </thead>
          <tbody>
            ${candidatos
              .map(
                (c) => `
              <tr data-id="${c.id}">
                <td>${escapeHtml(c.nome)}</td>
                <td>${escapeHtml(vagaTitulo(c.vagaId))}</td>
                <td>${escapeHtml(c.etapaCandidato)}</td>
                <td>${escapeHtml(c.telefone) || "—"}</td>
                <td><button class="btn btn-outline btn-sm btn-editar">Abrir</button></td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>
      `;
    } else {
      el.innerHTML = `
        <table>
          <thead>
            <tr><th>Nome</th><th>Vaga</th><th>Etapa</th><th>Jusbrasil</th><th>Parecer</th><th>Entrevista</th><th></th></tr>
          </thead>
          <tbody>
            ${candidatos
              .map(
                (c) => `
              <tr data-id="${c.id}">
                <td>${escapeHtml(c.nome)}</td>
                <td>${escapeHtml(vagaTitulo(c.vagaId))}</td>
                <td>${escapeHtml(c.etapaCandidato)}</td>
                <td>${c.jusbrasilOk ? "✅" : "—"}</td>
                <td>${(c.parecerComportamental || "").trim() ? "✅" : "—"}</td>
                <td>${c.dataEntrevista || "—"}</td>
                <td><button class="btn btn-outline btn-sm btn-editar">Abrir</button></td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>
      `;
    }

    el.querySelectorAll(".btn-editar").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const id = e.target.closest("tr").dataset.id;
        const candidato = todosCandidatos.find((c) => c.id === id);
        abrirFormularioCandidato(candidato);
      });
    });
  }

  filtroVaga.addEventListener("change", carregar);
  root.querySelector("#btn-novo-candidato").addEventListener("click", () => abrirFormularioCandidato(null));

  marcarAbaAtiva();
  await carregar();

  function abrirFormularioCandidato(candidato) {
    const editando = !!candidato;
    abrirModal(`
      <h2>${editando ? "Editar Candidato" : "Novo Candidato"}</h2>
      <form id="form-candidato">
        <div class="form-row">
          <label>Nome</label>
          <input type="text" id="c-nome" required value="${editando ? escapeHtml(candidato.nome) : ""}" />
        </div>
        <div class="form-cols">
          <div class="form-row">
            <label>E-mail</label>
            <input type="email" id="c-email" value="${editando ? escapeHtml(candidato.email) : ""}" />
          </div>
          <div class="form-row">
            <label>Telefone/WhatsApp</label>
            <input type="text" id="c-telefone" value="${editando ? escapeHtml(candidato.telefone) : ""}" />
          </div>
        </div>
        <div class="form-row">
          <label>Vaga</label>
          <select id="c-vaga" required ${editando ? "disabled" : ""}>
            ${vagas.map((v) => `<option value="${v.id}" ${(editando ? candidato.vagaId === v.id : filtroVaga.value === v.id) ? "selected" : ""}>${v.titulo}</option>`).join("")}
          </select>
        </div>
        <div class="form-row">
          <label>Etapa do candidato</label>
          <select id="c-etapa">
            ${store.etapasCandidato.map((e) => `<option ${editando && candidato.etapaCandidato === e ? "selected" : ""}>${e}</option>`).join("")}
          </select>
          <div class="sub" style="margin-top:4px;">Use "Sem Interesse" ou "Não Respondeu" para mandar o candidato para a aba de Banco de Talentos sem excluí-lo.</div>
        </div>
        ${
          editando
            ? `
        <div class="form-cols">
          <div class="form-row">
            <label>Data da entrevista</label>
            <input type="date" id="c-data-entrevista" value="${candidato.dataEntrevista || ""}" />
          </div>
          <div class="form-row">
            <label>Data retorno do cliente</label>
            <input type="date" id="c-data-retorno" value="${candidato.dataRetornoCliente || ""}" />
          </div>
        </div>
        <div class="form-row checkbox-row">
          <input type="checkbox" id="c-jusbrasil" ${candidato.jusbrasilOk ? "checked" : ""} />
          <label style="margin:0;">Checagem de referência e Jusbrasil OK</label>
        </div>
        <div class="form-row">
          <label>Observações da checagem de referência</label>
          <textarea id="c-obs-referencia">${escapeHtml(candidato.obsReferencia || "")}</textarea>
        </div>
        <div class="form-row">
          <label>Parecer comportamental</label>
          <textarea id="c-parecer">${escapeHtml(candidato.parecerComportamental || "")}</textarea>
        </div>`
            : ""
        }
        <div id="candidato-form-erro" class="form-erro hidden"></div>
        <div class="modal-close-row">
          ${editando ? '<button type="button" id="btn-excluir-candidato" class="btn btn-danger" style="margin-right:auto;">Excluir</button>' : ""}
          <button type="button" id="btn-cancelar-c" class="btn btn-outline">Fechar</button>
          <button type="submit" class="btn btn-primary">${editando ? "Salvar" : "Adicionar"}</button>
        </div>
      </form>
    `);

    document.getElementById("btn-cancelar-c").addEventListener("click", fecharModal);

    if (editando) {
      document.getElementById("btn-excluir-candidato").addEventListener("click", async () => {
        if (!confirm("Excluir este candidato?")) return;
        try {
          await api.del(`/api/candidatos/${candidato.id}`);
          fecharModal();
          showToast("Candidato excluído.", "sucesso");
          carregar();
        } catch (err) {
          showToast(err.message, "erro");
        }
      });
    }

    document.getElementById("form-candidato").addEventListener("submit", async (e) => {
      e.preventDefault();
      const erroBox = document.getElementById("candidato-form-erro");
      erroBox.classList.add("hidden");
      const payloadBase = {
        nome: document.getElementById("c-nome").value.trim(),
        email: document.getElementById("c-email").value.trim(),
        telefone: document.getElementById("c-telefone").value.trim(),
        etapaCandidato: document.getElementById("c-etapa").value,
      };
      try {
        if (editando) {
          const extra = {
            dataEntrevista: document.getElementById("c-data-entrevista").value || null,
            dataRetornoCliente: document.getElementById("c-data-retorno").value || null,
            jusbrasilOk: document.getElementById("c-jusbrasil").checked,
            obsReferencia: document.getElementById("c-obs-referencia").value,
            parecerComportamental: document.getElementById("c-parecer").value,
          };
          await api.patch(`/api/candidatos/${candidato.id}`, { ...payloadBase, ...extra });
          showToast("Candidato atualizado.", "sucesso");
        } else {
          payloadBase.vagaId = document.getElementById("c-vaga").value;
          await api.post("/api/candidatos", payloadBase);
          showToast("Candidato adicionado.", "sucesso");
        }
        fecharModal();
        carregar();
        window.__evoe.atualizarBadgeNotificacoes();
      } catch (err) {
        erroBox.textContent = err.message;
        erroBox.classList.remove("hidden");
      }
    });
  }
}
