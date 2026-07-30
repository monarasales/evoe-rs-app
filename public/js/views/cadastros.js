import { api } from "../api.js";
import { store, isGestor, showToast, formatarData } from "../state.js";
import { abrirModal, fecharModal } from "../modal.js";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

const ABAS = [
  { id: "equipe", label: "Funcionários" },
  { id: "parametros", label: "Parâmetros do Sistema" },
];

// Funcionários: tipo de vínculo determina se o valor cadastrado é "Salário" ou
// "Bolsa Estágio" no formulário. Espelha TIPOS_VINCULO em server/utils/constants.js.
const TIPOS_VINCULO = ["CLT", "PJ", "Estágio", "Outro"];

function formatarReal(valor) {
  return (Number(valor) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function rotuloRemuneracao(tipoVinculo) {
  return tipoVinculo === "Estágio" ? "Bolsa Estágio (R$)" : "Salário (R$)";
}

export async function renderConfiguracoes(root) {
  let abaAtiva = "equipe";

  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Configurações</h2>
        <div class="sub">Cadastro de funcionários (dados de RH e acesso ao sistema) e parâmetros de operação. O cadastro de empresas clientes fica no menu CRM.</div>
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
    if (abaAtiva === "equipe") renderAbaEquipe();
    else renderAbaParametros();
  }

  // ---------- Aba: Funcionários ----------
  function renderAbaEquipe() {
    conteudo.innerHTML = `
      <div class="view-header" style="margin-bottom:10px;">
        <div class="sub">Cadastro da equipe: dados de admissão, vínculo, remuneração e benefícios, além do login de acesso ao sistema.</div>
        ${isGestor() ? '<button id="btn-novo-consultor" class="btn btn-primary btn-sm">+ Novo Funcionário</button>' : ""}
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
        <thead><tr><th>Nome</th><th>Perfil</th><th>Admissão</th><th>Vínculo</th><th>Remuneração</th><th>Usuário</th><th>Status</th>${isGestor() ? "<th></th>" : ""}</tr></thead>
        <tbody>
          ${consultores
            .map(
              (c) => `
            <tr data-id="${c.id}">
              <td>${escapeHtml(c.nome)}</td>
              <td>${c.perfil}</td>
              <td>${c.dataAdmissao ? formatarData(c.dataAdmissao) : "—"}</td>
              <td>${escapeHtml(c.tipoVinculo || "—")}</td>
              <td>${c.valorRemuneracao ? formatarReal(c.valorRemuneracao) : "—"}</td>
              <td>${c.username ? escapeHtml(c.username) : '<span class="sub">sem login</span>'}</td>
              <td><span class="tag ${c.ativo ? "tag-nprazo" : "tag-encerrada"}">${c.ativo ? "Ativo" : "Inativo"}</span></td>
              ${
                isGestor()
                  ? `<td style="white-space:nowrap;">
                      <button class="btn btn-outline btn-sm btn-editar-consultor">Editar</button>
                      <button class="btn btn-outline btn-sm btn-excluir-consultor" style="color:#c0392b;">Excluir</button>
                    </td>`
                  : ""
              }
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
      el.querySelectorAll(".btn-excluir-consultor").forEach((btn) =>
        btn.addEventListener("click", async (e) => {
          const id = e.target.closest("tr").dataset.id;
          const c = consultores.find((x) => x.id === id);
          if (!confirm(`Excluir "${c.nome}" e o login dele(a) do sistema? Essa ação não pode ser desfeita.`)) return;
          try {
            await api.del(`/api/consultores/${id}`);
            showToast("Consultor excluído.", "sucesso");
            carregarConsultores();
            const atualizados = await api.get("/api/consultores");
            store.consultores = atualizados;
          } catch (err) {
            showToast(err.message, "erro");
          }
        })
      );
    }
  }

  function abrirFormularioConsultor(consultor) {
    const editando = !!consultor;
    const vinculoInicial = (editando && consultor.tipoVinculo) || "CLT";
    abrirModal(`
      <h2>${editando ? "Editar Funcionário" : "Novo Funcionário"}</h2>
      <form id="form-consultor">
        <div class="form-row"><label>Nome completo</label><input type="text" id="cs-nome" required value="${editando ? escapeHtml(consultor.nome) : ""}" /></div>
        <div class="form-cols">
          <div class="form-row"><label>E-mail</label><input type="email" id="cs-email" required value="${editando ? escapeHtml(consultor.email) : ""}" /></div>
          <div class="form-row"><label>Telefone / WhatsApp</label><input type="text" id="cs-whatsapp" value="${editando ? escapeHtml(consultor.whatsapp) : ""}" /></div>
        </div>
        <div class="form-cols">
          <div class="form-row">
            <label>Perfil de acesso</label>
            <select id="cs-perfil">
              <option ${editando && consultor.perfil === "Recrutador" ? "selected" : ""}>Recrutador</option>
              <option ${editando && consultor.perfil === "Supervisora" ? "selected" : ""}>Supervisora</option>
              <option ${editando && consultor.perfil === "Gestor" ? "selected" : ""}>Gestor</option>
            </select>
          </div>
          <div class="form-row checkbox-row" style="margin-top:26px;">
            <input type="checkbox" id="cs-ativo" ${!editando || consultor.ativo ? "checked" : ""} />
            <label style="margin:0;">Ativo</label>
          </div>
        </div>

        <h3 class="section-title" style="margin-top:18px;">Dados de RH</h3>
        <div class="form-cols">
          <div class="form-row"><label>Data de admissão</label><input type="date" id="cs-admissao" value="${editando ? (consultor.dataAdmissao || "") : ""}" /></div>
          <div class="form-row">
            <label>Tipo de vínculo</label>
            <select id="cs-vinculo">
              ${TIPOS_VINCULO.map((t) => `<option ${vinculoInicial === t ? "selected" : ""}>${t}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="form-cols">
          <div class="form-row"><label id="cs-remuneracao-label">${rotuloRemuneracao(vinculoInicial)}</label><input type="number" min="0" step="0.01" id="cs-remuneracao" value="${editando ? (consultor.valorRemuneracao || "") : ""}" /></div>
          <div class="form-row"><label>CPF</label><input type="text" id="cs-cpf" value="${editando ? escapeHtml(consultor.cpf || "") : ""}" /></div>
        </div>
        <div class="form-row"><label>Benefícios</label><input type="text" id="cs-beneficios" placeholder="ex: Vale Transporte, Vale Refeição R$600, Plano de Saúde" value="${editando ? escapeHtml(consultor.beneficios || "") : ""}" /></div>
        <div class="form-cols">
          <div class="form-row"><label>Data de nascimento</label><input type="date" id="cs-nascimento" value="${editando ? (consultor.dataNascimento || "") : ""}" /></div>
          <div class="form-row"><label>Endereço</label><input type="text" id="cs-endereco" value="${editando ? escapeHtml(consultor.endereco || "") : ""}" /></div>
        </div>
        <div class="form-row" id="cs-desligamento-row" style="${!editando || consultor.ativo ? "display:none;" : ""}">
          <label>Data de desligamento</label>
          <input type="date" id="cs-desligamento" value="${editando ? (consultor.dataDesligamento || "") : ""}" />
        </div>

        <h3 class="section-title" style="margin-top:18px;">Acesso ao Sistema</h3>
        ${
          !editando
            ? `
        <div class="form-cols">
          <div class="form-row"><label>Usuário de login</label><input type="text" id="cs-username" placeholder="ex: joana" /></div>
          <div class="form-row"><label>Senha inicial</label><input type="text" id="cs-senha" placeholder="ex: evoe123" /></div>
        </div>`
            : `
        <div class="form-cols">
          <div class="form-row"><label>Usuário de login</label><input type="text" id="cs-username" placeholder="ex: joana" value="${consultor.username ? escapeHtml(consultor.username) : ""}" /></div>
          <div class="form-row"><label>Nova senha</label><input type="text" id="cs-senha" placeholder="deixe em branco para manter a atual" /></div>
        </div>
        <p class="sub">Preencha usuário e nova senha juntos só se quiser redefinir o login. Deixando a senha em branco, o login atual não muda.</p>`
        }
        <div id="consultor-form-erro" class="form-erro hidden"></div>
        <div class="modal-close-row">
          <button type="button" id="btn-cancelar-cs" class="btn btn-outline">Fechar</button>
          <button type="submit" class="btn btn-primary">${editando ? "Salvar" : "Criar funcionário"}</button>
        </div>
      </form>
    `);
    document.getElementById("btn-cancelar-cs").addEventListener("click", fecharModal);

    document.getElementById("cs-vinculo").addEventListener("change", (ev) => {
      document.getElementById("cs-remuneracao-label").textContent = rotuloRemuneracao(ev.target.value);
    });
    document.getElementById("cs-ativo").addEventListener("change", (ev) => {
      document.getElementById("cs-desligamento-row").style.display = ev.target.checked ? "none" : "";
    });

    document.getElementById("form-consultor").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const ativo = document.getElementById("cs-ativo").checked;
      const payload = {
        nome: document.getElementById("cs-nome").value.trim(),
        email: document.getElementById("cs-email").value.trim(),
        whatsapp: document.getElementById("cs-whatsapp").value.trim(),
        perfil: document.getElementById("cs-perfil").value,
        ativo,
        dataAdmissao: document.getElementById("cs-admissao").value,
        tipoVinculo: document.getElementById("cs-vinculo").value,
        valorRemuneracao: document.getElementById("cs-remuneracao").value,
        cpf: document.getElementById("cs-cpf").value.trim(),
        beneficios: document.getElementById("cs-beneficios").value.trim(),
        dataNascimento: document.getElementById("cs-nascimento").value,
        endereco: document.getElementById("cs-endereco").value.trim(),
        dataDesligamento: ativo ? null : (document.getElementById("cs-desligamento").value || null),
      };
      const username = document.getElementById("cs-username").value.trim();
      const senha = document.getElementById("cs-senha").value;
      if (!editando) {
        payload.username = username;
        payload.senha = senha;
      }
      const erroEl = document.getElementById("consultor-form-erro");
      try {
        let consultorSalvo;
        if (editando) consultorSalvo = await api.patch(`/api/consultores/${consultor.id}`, payload);
        else consultorSalvo = await api.post("/api/consultores", payload);

        if (editando && senha) {
          if (!username) {
            erroEl.textContent = "Informe o usuário junto com a nova senha.";
            erroEl.classList.remove("hidden");
            return;
          }
          await api.patch(`/api/consultores/${consultor.id}/credenciais`, { username, senha });
        }

        showToast("Funcionário salvo.", "sucesso");
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
