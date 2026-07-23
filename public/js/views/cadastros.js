import { api } from "../api.js";
import { store, isGestor, showToast } from "../state.js";
import { abrirModal, fecharModal } from "../modal.js";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

const ABAS = [
  { id: "empresas", label: "Empresas Clientes" },
  { id: "equipe", label: "Equipe e Usuários" },
  { id: "parametros", label: "Parâmetros do Sistema" },
];

export async function renderConfiguracoes(root) {
  let abaAtiva = "empresas";

  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Configurações</h2>
        <div class="sub">Empresas clientes, equipe com acesso ao sistema e parâmetros de operação.</div>
      </div>
    </div>
    <div class="tabs" id="config-tabs">
      ${ABAS.map((a) => `<button type="button" class="tab-btn" data-aba="${a.id}">${a.label}</button>`).join("")}
    </div>
    <div id="config-conteudo"></div>
  `;

  const conteudo = root.querySelector("#config-conteudo");
  const tabsEl = root.querySelector("#config-tabs");

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
    if (abaAtiva === "empresas") renderAbaEmpresas();
    else if (abaAtiva === "equipe") renderAbaEquipe();
    else renderAbaParametros();
  }

  // ---------- Aba: Empresas Clientes ----------
  function renderAbaEmpresas() {
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
      };
      try {
        if (editando) await api.patch(`/api/empresas/${empresa.id}`, payload);
        else await api.post("/api/empresas", payload);
        showToast("Empresa salva.", "sucesso");
        fecharModal();
        carregarEmpresas();
      } catch (err) {
        const box = document.getElementById("empresa-form-erro");
        box.textContent = err.message;
        box.classList.remove("hidden");
      }
    });
  }

  // ---------- Aba: Equipe e Usuários ----------
  function renderAbaEquipe() {
    conteudo.innerHTML = `
      <div class="view-header" style="margin-bottom:10px;">
        <div class="sub">Quem tem login no sistema — cada consultor entra com o próprio usuário e senha.</div>
        ${isGestor() ? '<button id="btn-novo-consultor" class="btn btn-primary btn-sm">+ Novo Consultor</button>' : ""}
      </div>
      <div id="tabela-consultores"></div>
    `;
    const btnNovoConsultor = conteudo.querySelector("#btn-novo-consultor");
    if (btnNovoConsultor) btnNovoConsultor.addEventListener("click", () => abrirFormularioConsultor(null));
    carregarConsultores();
  }

  async function carregarConsultores() {
    const consultores = await api.get("/api/consultores");
    const el = conteudo.querySelector("#tabela-consultores");
    if (!el) return;
    el.innerHTML = `
      <table>
        <thead><tr><th>Nome</th><th>Perfil</th><th>E-mail</th><th>WhatsApp</th><th>Status</th>${isGestor() ? "<th></th>" : ""}</tr></thead>
        <tbody>
          ${consultores
            .map(
              (c) => `
            <tr data-id="${c.id}">
              <td>${escapeHtml(c.nome)}</td>
              <td>${c.perfil}</td>
              <td>${escapeHtml(c.email)}</td>
              <td>${escapeHtml(c.whatsapp)}</td>
              <td><span class="tag ${c.ativo ? "tag-nprazo" : "tag-encerrada"}">${c.ativo ? "Ativo" : "Inativo"}</span></td>
              ${isGestor() ? `<td><button class="btn btn-outline btn-sm btn-editar-consultor">Editar</button></td>` : ""}
            </tr>`
            )
            .join("")}
        </tbody>
      </table>`;
    if (isGestor()) {
      el.querySelectorAll(".btn-editar-consultor").forEach((btn) =>
        btn.addEventListener("click", (e) => {
          const id = e.target.closest("tr").dataset.id;
          abrirFormularioConsultor(consultores.find((x) => x.id === id));
        })
      );
    }
  }

  function abrirFormularioConsultor(consultor) {
    const editando = !!consultor;
    abrirModal(`
      <h2>${editando ? "Editar Consultor" : "Novo Consultor"}</h2>
      <form id="form-consultor">
        <div class="form-row"><label>Nome</label><input type="text" id="cs-nome" required value="${editando ? escapeHtml(consultor.nome) : ""}" /></div>
        <div class="form-cols">
          <div class="form-row"><label>E-mail</label><input type="email" id="cs-email" required value="${editando ? escapeHtml(consultor.email) : ""}" /></div>
          <div class="form-row"><label>WhatsApp</label><input type="text" id="cs-whatsapp" value="${editando ? escapeHtml(consultor.whatsapp) : ""}" /></div>
        </div>
        <div class="form-cols">
          <div class="form-row">
            <label>Perfil de acesso</label>
            <select id="cs-perfil">
              <option ${editando && consultor.perfil === "Recrutador" ? "selected" : ""}>Recrutador</option>
              <option ${editando && consultor.perfil === "Gestor" ? "selected" : ""}>Gestor</option>
            </select>
          </div>
          <div class="form-row checkbox-row" style="margin-top:26px;">
            <input type="checkbox" id="cs-ativo" ${!editando || consultor.ativo ? "checked" : ""} />
            <label style="margin:0;">Ativo</label>
          </div>
        </div>
        ${
          !editando
            ? `
        <div class="form-cols">
          <div class="form-row"><label>Usuário de login</label><input type="text" id="cs-username" placeholder="ex: joana" /></div>
          <div class="form-row"><label>Senha inicial</label><input type="text" id="cs-senha" placeholder="ex: evoe123" /></div>
        </div>`
            : '<p class="sub">Login e senha são definidos na criação do consultor.</p>'
        }
        <div id="consultor-form-erro" class="form-erro hidden"></div>
        <div class="modal-close-row">
          <button type="button" id="btn-cancelar-cs" class="btn btn-outline">Fechar</button>
          <button type="submit" class="btn btn-primary">${editando ? "Salvar" : "Criar consultor"}</button>
        </div>
      </form>
    `);
    document.getElementById("btn-cancelar-cs").addEventListener("click", fecharModal);
    document.getElementById("form-consultor").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const payload = {
        nome: document.getElementById("cs-nome").value.trim(),
        email: document.getElementById("cs-email").value.trim(),
        whatsapp: document.getElementById("cs-whatsapp").value.trim(),
        perfil: document.getElementById("cs-perfil").value,
        ativo: document.getElementById("cs-ativo").checked,
      };
      if (!editando) {
        payload.username = document.getElementById("cs-username").value.trim();
        payload.senha = document.getElementById("cs-senha").value;
      }
      try {
        if (editando) await api.patch(`/api/consultores/${consultor.id}`, payload);
        else await api.post("/api/consultores", payload);
        showToast("Consultor salvo.", "sucesso");
        fecharModal();
        carregarConsultores();
        const consultores = await api.get("/api/consultores");
        store.consultores = consultores;
      } catch (err) {
        const box = document.getElementById("consultor-form-erro");
        box.textContent = err.message;
        box.classList.remove("hidden");
      }
    });
  }

  // ---------- Aba: Parâmetros do Sistema ----------
  async function renderAbaParametros() {
    conteudo.innerHTML = '<div class="empty-state">Carregando parâmetros...</div>';
    const cfg = await api.get("/api/config");
    conteudo.innerHTML = `
      <div class="sub" style="margin-bottom:14px;">
        Regras de negócio que o sistema usa para calcular prazos, SLA e metas. Hoje esses valores
        são definidos junto comigo (Claude) — se algum precisar mudar, é só pedir por aqui.
      </div>
      <div class="grid-cards">
        <div class="card">
          <div class="kpi-label">SLA ideal de fechamento</div>
          <div class="kpi-value">${cfg.slaDiasIdeal}d</div>
          <div class="sub" style="margin-top:6px;">Fechar até esse prazo vale a pontuação máxima (peso 2) no ranking de SLA.</div>
        </div>
        <div class="card">
          <div class="kpi-label">SLA limite de fechamento</div>
          <div class="kpi-value">${cfg.slaDiasLimite}d</div>
          <div class="sub" style="margin-top:6px;">Nosso padrão interno de fechamento. Acima disso, a vaga conta como fora do SLA.</div>
        </div>
        <div class="card">
          <div class="kpi-label">Aviso de SLA próximo</div>
          <div class="kpi-value">${cfg.diasAlertaSlaProximo}d antes</div>
          <div class="sub" style="margin-top:6px;">Quantos dias antes do limite o consultor recebe o primeiro aviso de atenção.</div>
        </div>
        <div class="card">
          <div class="kpi-label">Aviso de prazo do cliente</div>
          <div class="kpi-value">${cfg.diasAlertaPrazo}d antes</div>
          <div class="sub" style="margin-top:6px;">Quantos dias antes do prazo combinado com o cliente o consultor é avisado.</div>
        </div>
        <div class="card">
          <div class="kpi-label">Meta mensal por consultor</div>
          <div class="kpi-value">${cfg.metaVagasFechadasMes}</div>
          <div class="sub" style="margin-top:6px;">Quantidade de vagas fechadas por mês esperada de cada consultor.</div>
        </div>
      </div>
      ${
        isGestor()
          ? `
      <div class="section-title" style="margin-top:22px;">Numeração de Contratos</div>
      <div class="card" style="max-width:420px;">
        <div class="sub" style="margin-bottom:10px;">Próximo número que será usado ao gerar um novo contrato (ex: se sua numeração real parou em 0030/2025, deixe aqui 31).</div>
        <form id="form-proximo-numero" class="form-cols" style="align-items:end;">
          <div class="form-row"><label>Próximo número de contrato</label><input type="number" min="1" id="pn-numero" value="${cfg.proximoNumeroContrato}" /></div>
          <div class="form-row"><button type="submit" class="btn btn-primary btn-sm">Salvar</button></div>
        </form>
        <div id="pn-erro" class="form-erro hidden"></div>
      </div>`
          : ""
      }
    `;
    if (isGestor()) {
      const form = conteudo.querySelector("#form-proximo-numero");
      form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        try {
          await api.patch("/api/config/proximo-numero-contrato", {
            proximoNumero: Number(document.getElementById("pn-numero").value),
          });
          showToast("Número salvo.", "sucesso");
        } catch (err) {
          const box = conteudo.querySelector("#pn-erro");
          box.textContent = err.message;
          box.classList.remove("hidden");
        }
      });
    }
  }

  renderizarAba();
}
