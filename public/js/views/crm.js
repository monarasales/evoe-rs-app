import { api } from "../api.js";
import { store, showToast, formatarData } from "../state.js";
import { abrirModal, fecharModal } from "../modal.js";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

const ABAS = [
  { id: "clientes", label: "Clientes" },
  { id: "prospects", label: "Prospects" },
];

const TAG_ETAPA_PROSPECT = {
  Novo: "tag-prospect-novo",
  "Em Contato": "tag-prospect-contato",
  "Proposta Enviada": "tag-prospect-proposta",
  Fechado: "tag-prospect-fechado",
  Perdido: "tag-prospect-perdido",
};

export async function renderCrm(root) {
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
              <td>${escapeHtml(e.nome)}</td>
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

  // ================== Aba: Prospects ==================
  let opcoesProspect = { servicos: [], etapas: [] };
  let prospectsCache = [];
  let filtroEtapa = "";

  async function renderAbaProspects() {
    conteudo.innerHTML = '<div class="empty-state">Carregando...</div>';
    opcoesProspect = await api.get("/api/prospects/opcoes");
    conteudo.innerHTML = `
      <div class="view-header" style="margin-bottom:10px;">
        <div class="sub">Todo mundo que entra em contato querendo cotar um serviço — para você fazer o follow-up.</div>
        <button id="btn-novo-prospect" class="btn btn-primary btn-sm">+ Novo Prospect</button>
      </div>
      <div class="kanban-toolbar">
        <select id="filtro-etapa-prospect">
          <option value="">Todas as etapas</option>
          ${opcoesProspect.etapas.map((e) => `<option value="${e}">${e}</option>`).join("")}
        </select>
      </div>
      <div id="tabela-prospects"></div>
    `;
    conteudo.querySelector("#btn-novo-prospect").addEventListener("click", () => abrirFormularioProspect(null));
    conteudo.querySelector("#filtro-etapa-prospect").addEventListener("change", (e) => {
      filtroEtapa = e.target.value;
      montarTabelaProspects();
    });
    await carregarProspects();
  }

  async function carregarProspects() {
    prospectsCache = await api.get("/api/prospects");
    montarTabelaProspects();
  }

  function montarTabelaProspects() {
    const el = conteudo.querySelector("#tabela-prospects");
    if (!el) return;
    const lista = (filtroEtapa ? prospectsCache.filter((p) => p.etapa === filtroEtapa) : prospectsCache)
      .slice()
      .sort((a, b) => {
        const fa = a.proximoFollowUp || "9999-99-99";
        const fb = b.proximoFollowUp || "9999-99-99";
        return fa < fb ? -1 : fa > fb ? 1 : 0;
      });
    if (lista.length === 0) {
      el.innerHTML = '<div class="empty-state">Nenhum prospect por aqui ainda.</div>';
      return;
    }
    const hoje = new Date().toISOString().slice(0, 10);
    el.innerHTML = `
      <table>
        <thead>
          <tr><th>Nome</th><th>Empresa</th><th>Telefone</th><th>Serviço</th><th>Quem indicou</th><th>Etapa</th><th>Próximo Follow-up</th><th></th></tr>
        </thead>
        <tbody>
          ${lista
            .map((p) => {
              const followAtrasado = p.proximoFollowUp && p.proximoFollowUp < hoje && !["Fechado", "Perdido"].includes(p.etapa);
              return `
            <tr data-id="${p.id}">
              <td>${escapeHtml(p.nome)}</td>
              <td>${escapeHtml(p.empresa) || "—"}</td>
              <td>${escapeHtml(p.telefone) || "—"}</td>
              <td>${escapeHtml(p.servicoDesejado === "Outro" && p.servicoOutro ? p.servicoOutro : p.servicoDesejado)}</td>
              <td>${escapeHtml(p.quemIndicou) || "—"}</td>
              <td><span class="tag ${TAG_ETAPA_PROSPECT[p.etapa] || ""}">${escapeHtml(p.etapa)}</span></td>
              <td>${p.proximoFollowUp ? `<span class="${followAtrasado ? "tag tag-atrasada" : ""}">${formatarData(p.proximoFollowUp)}</span>` : "—"}</td>
              <td><button class="btn btn-outline btn-sm btn-editar-prospect">Editar</button></td>
            </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    `;
    el.querySelectorAll(".btn-editar-prospect").forEach((btn) =>
      btn.addEventListener("click", (e) => {
        const id = e.target.closest("tr").dataset.id;
        abrirFormularioProspect(prospectsCache.find((x) => x.id === id));
      })
    );
  }

  function abrirFormularioProspect(prospect) {
    const editando = !!prospect;
    abrirModal(`
      <h2>${editando ? "Editar Prospect" : "Novo Prospect"}</h2>
      <form id="form-prospect">
        <div class="form-cols">
          <div class="form-row"><label>Nome da pessoa de contato</label><input type="text" id="p-nome" required value="${editando ? escapeHtml(prospect.nome) : ""}" /></div>
          <div class="form-row"><label>Empresa</label><input type="text" id="p-empresa" value="${editando ? escapeHtml(prospect.empresa) : ""}" /></div>
        </div>
        <div class="form-cols">
          <div class="form-row"><label>Telefone</label><input type="text" id="p-telefone" value="${editando ? escapeHtml(prospect.telefone) : ""}" /></div>
          <div class="form-row"><label>Quem nos indicou</label><input type="text" id="p-indicou" value="${editando ? escapeHtml(prospect.quemIndicou) : ""}" /></div>
        </div>
        <div class="form-cols">
          <div class="form-row">
            <label>Serviço que deseja</label>
            <select id="p-servico">
              ${opcoesProspect.servicos.map((s) => `<option value="${s}" ${editando && prospect.servicoDesejado === s ? "selected" : ""}>${s}</option>`).join("")}
            </select>
          </div>
          <div class="form-row" id="p-row-servico-outro"><label>Qual serviço (especifique)</label><input type="text" id="p-servico-outro" value="${editando ? escapeHtml(prospect.servicoOutro) : ""}" /></div>
        </div>
        <div class="form-cols">
          <div class="form-row">
            <label>Etapa de acompanhamento</label>
            <select id="p-etapa">
              ${opcoesProspect.etapas.map((e) => `<option value="${e}" ${editando ? (prospect.etapa === e ? "selected" : "") : (e === "Novo" ? "selected" : "")}>${e}</option>`).join("")}
            </select>
          </div>
          <div class="form-row"><label>Data do primeiro contato</label><input type="date" id="p-data-contato" value="${editando ? prospect.dataContato : new Date().toISOString().slice(0, 10)}" /></div>
        </div>
        <div class="form-row"><label>Próximo follow-up</label><input type="date" id="p-follow-up" value="${editando ? (prospect.proximoFollowUp || "") : ""}" /></div>
        <div class="form-row"><label>Por que não fechou conosco (se for o caso)</label><input type="text" id="p-motivo" value="${editando ? escapeHtml(prospect.motivoNaoFechou) : ""}" /></div>
        <div class="form-row"><label>Observações</label><textarea id="p-obs">${editando ? escapeHtml(prospect.observacoes) : ""}</textarea></div>
        <div id="prospect-form-erro" class="form-erro hidden"></div>
        <div class="modal-close-row">
          ${editando ? '<button type="button" id="btn-excluir-prospect" class="btn btn-danger" style="margin-right:auto;">Excluir</button>' : ""}
          <button type="button" id="btn-cancelar-p" class="btn btn-outline">Fechar</button>
          <button type="submit" class="btn btn-primary">${editando ? "Salvar" : "Criar prospect"}</button>
        </div>
      </form>
    `);

    const selectServico = document.getElementById("p-servico");
    const rowServicoOutro = document.getElementById("p-row-servico-outro");
    const atualizarVisibilidadeOutro = () => {
      rowServicoOutro.style.display = selectServico.value === "Outro" ? "" : "none";
    };
    selectServico.addEventListener("change", atualizarVisibilidadeOutro);
    atualizarVisibilidadeOutro();

    document.getElementById("btn-cancelar-p").addEventListener("click", fecharModal);
    if (editando) {
      document.getElementById("btn-excluir-prospect").addEventListener("click", async () => {
        if (!confirm(`Excluir o prospect "${prospect.nome}"? Essa ação não pode ser desfeita.`)) return;
        try {
          await api.del(`/api/prospects/${prospect.id}`);
          showToast("Prospect excluído.", "sucesso");
          fecharModal();
          carregarProspects();
        } catch (err) {
          showToast(err.message, "erro");
        }
      });
    }

    document.getElementById("form-prospect").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const payload = {
        nome: document.getElementById("p-nome").value.trim(),
        empresa: document.getElementById("p-empresa").value.trim(),
        telefone: document.getElementById("p-telefone").value.trim(),
        quemIndicou: document.getElementById("p-indicou").value.trim(),
        servicoDesejado: document.getElementById("p-servico").value,
        servicoOutro: document.getElementById("p-servico-outro").value.trim(),
        etapa: document.getElementById("p-etapa").value,
        dataContato: document.getElementById("p-data-contato").value,
        proximoFollowUp: document.getElementById("p-follow-up").value,
        motivoNaoFechou: document.getElementById("p-motivo").value.trim(),
        observacoes: document.getElementById("p-obs").value.trim(),
      };
      try {
        if (editando) await api.patch(`/api/prospects/${prospect.id}`, payload);
        else await api.post("/api/prospects", payload);
        showToast("Prospect salvo.", "sucesso");
        fecharModal();
        carregarProspects();
      } catch (err) {
        const box = document.getElementById("prospect-form-erro");
        box.textContent = err.message;
        box.classList.remove("hidden");
      }
    });
  }

  renderizarAba();
}
