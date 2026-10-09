import { api } from "../api.js";
import { store, showToast, formatarData, isGestor } from "../state.js";
import { abrirModal, fecharModal } from "../modal.js";
import { renderProspects } from "./crmProspects.js";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

const ABAS = [
  { id: "clientes", label: "Clientes" },
  { id: "prospects", label: "Prospects" },
];


export async function renderCrm(root) {
  if (!isGestor()) {
    root.innerHTML = '<div class="empty-state">A área Comercial é exclusiva do perfil Gestor.</div>';
    return;
  }
  let abaAtiva = "clientes";

  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>CRM</h2>
        <div class="sub">Clientes atendidos pela Evoé e prospects em follow-up — quem entrou em contato querendo cotar um serviço.</div>
      </div>
    </div>
    <div class="tabs" id="crm-tabs">
      ${ABAS.map((a) => `<button type="button" class="tab-btn" data-aba="${a.id}">${a.label}</button>`).join("")}
    </div>
    <div id="crm-conteudo"></div>
  `;

  const conteudo = root.querySelector("#crm-conteudo");
  const tabsEl = root.querySelector("#crm-tabs");

  function marcarAbaAtiva() {
    tabsEl.querySelectorAll(".tab-btn").forEach((btn) => btn.classList.toggle("ativo", btn.dataset.aba === abaAtiva));
  }

  tabsEl.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      abaAtiva = btn.dataset.aba;
      renderizarAba();
    });
  });

  function renderizarAba() {
    marcarAbaAtiva();
    if (abaAtiva === "clientes") renderAbaClientes();
    else renderAbaProspects();
  }

  // ================== Aba: Clientes ==================
  function renderAbaClientes() {
    conteudo.innerHTML = `
      <div class="view-header" style="margin-bottom:10px;">
        <div class="sub">Empresas para as quais a Evoé presta serviço de recrutamento.</div>
        <button id="btn-nova-empresa" class="btn btn-primary btn-sm">+ Nova Empresa</button>
      </div>
      <div id="tabela-empresas"></div>
    `;
    conteudo.querySelector("#btn-nova-empresa").addEventListener("click", () => abrirFormularioEmpresa(null));
    carregarEmpresas();
  }

  async function carregarEmpresas() {
    const empresas = await api.get("/api/empresas");
    const el = conteudo.querySelector("#tabela-empresas");
    if (!el) return;
    if (empresas.length === 0) {
      el.innerHTML = '<div class="empty-state">Nenhuma empresa cadastrada.</div>';
      return;
    }
    el.innerHTML = `
      <table>
        <thead><tr><th>Empresa</th><th>Segmento</th><th>Contato</th><th>E-mail</th><th>Endereço</th><th></th></tr></thead>
        <tbody>
          ${empresas
            .map(
              (e) => `
            <tr data-id="${e.id}">
              <td>${escapeHtml(e.nome)}${e.cadastroRapido && !e.cnpj ? `<div class="sub" title="Cadastrada na tela da vaga">⚡ cadastro rápido por ${escapeHtml(e.cadastroRapido.por)} — completar dados</div>` : ""}</td>
              <td>${escapeHtml(e.segmento)}</td>
              <td>${escapeHtml(e.contatoResponsavel)}</td>
              <td>${escapeHtml(e.emailContato)}</td>
              <td>${e.endereco ? escapeHtml(e.endereco) : '<span class="sub">— não cadastrado —</span>'}</td>
              <td><button class="btn btn-outline btn-sm btn-editar-empresa">Editar</button></td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>`;
    el.querySelectorAll(".btn-editar-empresa").forEach((btn) =>
      btn.addEventListener("click", (e) => {
        const id = e.target.closest("tr").dataset.id;
        abrirFormularioEmpresa(empresas.find((x) => x.id === id));
      })
    );
  }

  function abrirFormularioEmpresa(empresa) {
    const editando = !!empresa;
    abrirModal(`
      <h2>${editando ? "Editar Empresa" : "Nova Empresa"}</h2>
      <form id="form-empresa">
        <div class="form-row"><label>Nome da empresa</label><input type="text" id="e-nome" required value="${editando ? escapeHtml(empresa.nome) : ""}" /></div>
        <div class="form-cols">
          <div class="form-row"><label>CNPJ</label><input type="text" id="e-cnpj" value="${editando ? escapeHtml(empresa.cnpj) : ""}" /></div>
          <div class="form-row"><label>Segmento</label><input type="text" id="e-segmento" value="${editando ? escapeHtml(empresa.segmento) : ""}" /></div>
        </div>
        <div class="form-row"><label>Contato responsável (RH do cliente)</label><input type="text" id="e-contato" value="${editando ? escapeHtml(empresa.contatoResponsavel) : ""}" /></div>
        <div class="form-cols">
          <div class="form-row"><label>E-mail do contato</label><input type="email" id="e-email" value="${editando ? escapeHtml(empresa.emailContato) : ""}" /></div>
          <div class="form-row"><label>WhatsApp do contato</label><input type="text" id="e-whatsapp" value="${editando ? escapeHtml(empresa.whatsappContato) : ""}" /></div>
        </div>
        <div class="form-row"><label>Endereço completo</label><input type="text" id="e-endereco" placeholder="Rua, número, bairro, cidade/UF, CEP" value="${editando ? escapeHtml(empresa.endereco) : ""}" /></div>
        <div class="form-cols">
          <div class="form-row"><label>Representante legal (nome)</label><input type="text" id="e-rep-nome" value="${editando ? escapeHtml(empresa.representanteLegalNome) : ""}" /></div>
          <div class="form-row"><label>CPF do representante legal</label><input type="text" id="e-rep-cpf" value="${editando ? escapeHtml(empresa.representanteLegalCpf) : ""}" /></div>
        </div>
        <div class="sub" style="margin-top:-6px; margin-bottom:10px;">Usado para preencher automaticamente o contrato de prestação de serviços deste cliente.</div>
        <div id="empresa-form-erro" class="form-erro hidden"></div>
        <div class="modal-close-row">
          <button type="button" id="btn-cancelar-e" class="btn btn-outline">Fechar</button>
          <button type="submit" class="btn btn-primary">${editando ? "Salvar" : "Criar empresa"}</button>
        </div>
      </form>
    `);
    document.getElementById("btn-cancelar-e").addEventListener("click", fecharModal);
    document.getElementById("form-empresa").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const payload = {
        nome: document.getElementById("e-nome").value.trim(),
        cnpj: document.getElementById("e-cnpj").value.trim(),
        segmento: document.getElementById("e-segmento").value.trim(),
        contatoResponsavel: document.getElementById("e-contato").value.trim(),
        emailContato: document.getElementById("e-email").value.trim(),
        whatsappContato: document.getElementById("e-whatsapp").value.trim(),
        endereco: document.getElementById("e-endereco").value.trim(),
        representanteLegalNome: document.getElementById("e-rep-nome").value.trim(),
        representanteLegalCpf: document.getElementById("e-rep-cpf").value.trim(),
      };
      try {
        if (editando) await api.patch(`/api/empresas/${empresa.id}`, payload);
        else await api.post("/api/empresas", payload);
        showToast("Empresa salva.", "sucesso");
        fecharModal();
        carregarEmpresas();
        const empresas = await api.get("/api/empresas");
        store.empresas = empresas;
      } catch (err) {
        const box = document.getElementById("empresa-form-erro");
        box.textContent = err.message;
        box.classList.remove("hidden");
      }
    });
  }

  // ================== Aba: Prospects (public/js/views/crmProspects.js) ==================
  function renderAbaProspects() {
    renderProspects(conteudo);
  }

  renderizarAba();
}
