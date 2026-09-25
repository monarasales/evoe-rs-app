import { api } from "../api.js";
import { store, isGestor, showToast } from "../state.js";
import { abrirModal, fecharModal } from "../modal.js";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function formatarHora(data) {
  if (!data) return "—";
  const d = new Date(data);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

const ABAS = [
  { id: "ponto", label: "Ponto" },
  { id: "colaboradores", label: "Cadastro de Colaboradores" },
];

export async function renderColaboradores(root) {
  let abaAtiva = "ponto";

  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Colaboradores</h2>
        <div class="sub">Gerenciar pontos de entrada/saída e cadastro de funcionários.</div>
      </div>
    </div>
    <div class="tabs" id="colaboradores-tabs">
      ${ABAS.map((a) => `<button type="button" class="tab-btn" data-aba="${a.id}">${a.label}</button>`).join("")}
    </div>
    <div id="colaboradores-conteudo"></div>
  `;

  const conteudo = root.querySelector("#colaboradores-conteudo");
  const tabsEl = root.querySelector("#colaboradores-tabs");

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
    if (abaAtiva === "ponto") renderAbaPonto();
    else renderAbaCadastro();
  }

  // ========== Aba: Ponto ==========
  function renderAbaPonto() {
    conteudo.innerHTML = `
      <div class="view-header" style="margin-bottom:10px;">
        <div class="sub">Histórico de entrada e saída dos colaboradores.</div>
      </div>
      <div id="tabela-ponto"></div>
    `;
    carregarPontosColaboradores();
  }

  async function carregarPontosColaboradores() {
    try {
      const pontos = await api.get("/api/ponto/colaboradores");
      const tabela = conteudo.querySelector("#tabela-ponto");

      if (!pontos || pontos.length === 0) {
        tabela.innerHTML = '<div class="empty-state">Nenhum ponto registrado</div>';
        return;
      }

      tabela.innerHTML = `
        <table>
          <thead>
            <tr>
              <th>Colaborador</th>
              <th>Data</th>
              <th>Entrada</th>
              <th>Saída</th>
              <th>Pausa</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${pontos.map((p) => {
              const data = new Date(p.data).toLocaleDateString("pt-BR");
              const entrada = formatarHora(p.entrada);
              const saida = formatarHora(p.saida);

              let pausaTempo = "—";
              if (p.pausaEntrada && p.pausaSaida) {
                const diff = new Date(p.pausaSaida) - new Date(p.pausaEntrada);
                const minutos = Math.floor(diff / 60000);
                pausaTempo = `${minutos}m`;
              }

              let total = "—";
              if (p.entrada && p.saida) {
                // Descontar pausa do total
                let diff = new Date(p.saida) - new Date(p.entrada);
                if (p.pausaEntrada && p.pausaSaida) {
                  diff -= (new Date(p.pausaSaida) - new Date(p.pausaEntrada));
                }
                const horas = Math.floor(diff / 3600000);
                const minutos = Math.floor((diff % 3600000) / 60000);
                total = `${horas}h ${minutos}m`;
              }

              return `
                <tr>
                  <td><strong>${escapeHtml(p.colaboradorNome)}</strong></td>
                  <td>${data}</td>
                  <td>${entrada}</td>
                  <td>${saida}</td>
                  <td>${pausaTempo}</td>
                  <td>${total}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      `;
    } catch (err) {
      conteudo.querySelector("#tabela-ponto").innerHTML = `<div class="empty-state">Erro ao carregar dados</div>`;
    }
  }

  // ========== Aba: Cadastro de Colaboradores ==========
  function renderAbaCadastro() {
    conteudo.innerHTML = `
      <div class="view-header" style="margin-bottom:10px;">
        <div class="sub">Cadastro de funcionários e colaboradores.</div>
        ${isGestor() ? '<button id="btn-novo-colaborador" class="btn btn-primary btn-sm">+ Novo Colaborador</button>' : ""}
      </div>
      <div id="tabela-colaboradores"></div>
    `;

    const btnNovo = conteudo.querySelector("#btn-novo-colaborador");
    if (btnNovo) {
      btnNovo.addEventListener("click", () => abrirFormularioColaborador(null));
    }

    carregarColaboradores();
  }

  async function carregarColaboradores() {
    try {
      const colaboradores = await api.get("/api/colaboradores");
      const tabela = conteudo.querySelector("#tabela-colaboradores");

      if (!colaboradores || colaboradores.length === 0) {
        tabela.innerHTML = '<div class="empty-state">Nenhum colaborador cadastrado</div>';
        return;
      }

      tabela.innerHTML = `
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Cargo</th>
              <th>CPF</th>
              <th>Telefone</th>
              <th>Email</th>
              <th>Status</th>
              ${isGestor() ? "<th></th>" : ""}
            </tr>
          </thead>
          <tbody>
            ${colaboradores.map((c) => `
              <tr>
                <td><strong>${escapeHtml(c.nome)}</strong></td>
                <td>${escapeHtml(c.cargo || "—")}</td>
                <td>${escapeHtml(c.cpf || "—")}</td>
                <td>${escapeHtml(c.telefone || "—")}</td>
                <td>${escapeHtml(c.email || "—")}</td>
                <td><span class="tag ${c.ativo ? "tag-nprazo" : "tag-encerrada"}">${c.ativo ? "Ativo" : "Inativo"}</span></td>
                ${isGestor() ? `
                  <td style="white-space:nowrap;">
                    <button class="btn btn-outline btn-sm btn-editar-colaborador" data-id="${c.id}">Editar</button>
                    <button class="btn btn-outline btn-sm btn-excluir-colaborador" data-id="${c.id}" style="color:#c0392b;">Excluir</button>
                  </td>
                ` : ""}
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;

      if (isGestor()) {
        tabela.querySelectorAll(".btn-editar-colaborador").forEach((btn) => {
          btn.addEventListener("click", (e) => {
            const id = e.target.dataset.id;
            const collab = colaboradores.find((x) => x.id === id);
            abrirFormularioColaborador(collab);
          });
        });

        tabela.querySelectorAll(".btn-excluir-colaborador").forEach((btn) => {
          btn.addEventListener("click", async (e) => {
            const id = e.target.dataset.id;
            const collab = colaboradores.find((x) => x.id === id);
            if (!confirm(`Excluir "${collab.nome}"?`)) return;
            try {
              await api.del(`/api/colaboradores/${id}`);
              showToast("Colaborador excluído", "sucesso");
              carregarColaboradores();
            } catch (err) {
              showToast(err.message, "erro");
            }
          });
        });
      }
    } catch (err) {
      conteudo.querySelector("#tabela-colaboradores").innerHTML = '<div class="empty-state">Erro ao carregar dados</div>';
    }
  }

  function abrirFormularioColaborador(colaborador) {
    const editando = !!colaborador;
    const diasHomeOfficeStr = editando && colaborador.diasHomeOffice ? colaborador.diasHomeOffice.join(", ") : "sexta";

    abrirModal(`
      <h2>${editando ? "Editar Colaborador" : "Novo Colaborador"}</h2>
      <form id="form-colaborador">
        <div class="form-row"><label>Nome *</label><input type="text" id="col-nome" required value="${editando ? escapeHtml(colaborador.nome) : ""}" /></div>
        <div class="form-row"><label>Cargo</label><input type="text" id="col-cargo" value="${editando ? escapeHtml(colaborador.cargo || "") : ""}" /></div>
        <div class="form-row"><label>CPF</label><input type="text" id="col-cpf" placeholder="000.000.000-00" value="${editando ? escapeHtml(colaborador.cpf || "") : ""}" /></div>
        <div class="form-row"><label>Email</label><input type="email" id="col-email" value="${editando ? escapeHtml(colaborador.email || "") : ""}" /></div>
        <div class="form-row"><label>Telefone</label><input type="text" id="col-telefone" placeholder="(00) 00000-0000" value="${editando ? escapeHtml(colaborador.telefone || "") : ""}" /></div>

        <hr style="margin: 15px 0; border: none; border-top: 1px solid #ddd;" />

        <div class="form-row"><label>CEP Residencial *</label><input type="text" id="col-cep" placeholder="00000-000" maxlength="9" value="${editando ? escapeHtml(colaborador.cepResidencial || "") : ""}" /></div>
        <div class="form-row"><label>Endereço</label><input type="text" id="col-endereco" readonly value="${editando ? escapeHtml(colaborador.enderecoResidencial || "") : ""}" style="background: #f5f5f5;" /></div>
        <div class="form-row"><label>Cidade</label><input type="text" id="col-cidade" readonly value="${editando ? escapeHtml(colaborador.cidadeResidencial || "") : ""}" style="background: #f5f5f5;" /></div>

        <hr style="margin: 15px 0; border: none; border-top: 1px solid #ddd;" />

        <div class="form-row"><label>Horário Início</label><input type="time" id="col-inicio" value="${editando ? colaborador.horarioInicio || "08:00" : "08:00"}" /></div>
        <div class="form-row"><label>Horário Fim</label><input type="time" id="col-fim" value="${editando ? colaborador.horarioFim || "18:00" : "18:00"}" /></div>

        <div class="form-row"><label>Dias Home Office (separados por vírgula)</label><input type="text" id="col-home-office" placeholder="segunda, sexta" value="${diasHomeOfficeStr}" /></div>

        <div class="form-row checkbox-row">
          <input type="checkbox" id="col-ativo" ${!editando || colaborador.ativo ? "checked" : ""} />
          <label style="margin:0;">Ativo</label>
        </div>

        <div id="colaborador-form-erro" class="form-erro hidden"></div>
        <div class="modal-close-row">
          <button type="button" id="btn-cancelar-col" class="btn btn-outline">Fechar</button>
          <button type="submit" class="btn btn-primary">${editando ? "Salvar" : "Criar"}</button>
        </div>
      </form>
    `);

    const inputCEP = document.getElementById("col-cep");
    const inputEndereco = document.getElementById("col-endereco");
    const inputCidade = document.getElementById("col-cidade");

    // Buscar CEP quando sair do campo
    inputCEP.addEventListener("blur", async () => {
      const cep = inputCEP.value.replace(/\D/g, "");
      if (cep.length === 8) {
        try {
          const resposta = await api.post("/api/configuracao/geocodificar-cep", { cep: cep.replace(/(\d{5})(\d{3})/, "$1-$2") });
          inputEndereco.value = resposta.endereco || "";
          inputCidade.value = `${resposta.cidade}, ${resposta.estado}` || "";
        } catch (err) {
          showToast("CEP não encontrado", "erro");
        }
      }
    });

    document.getElementById("btn-cancelar-col").addEventListener("click", fecharModal);
    document.getElementById("form-colaborador").addEventListener("submit", async (ev) => {
      ev.preventDefault();

      const cepValue = document.getElementById("col-cep").value.trim();
      if (!cepValue) {
        document.getElementById("colaborador-form-erro").textContent = "CEP residencial é obrigatório.";
        document.getElementById("colaborador-form-erro").classList.remove("hidden");
        return;
      }

      const diasHomeOfficeInput = document.getElementById("col-home-office").value.trim();
      const diasHomeOffice = diasHomeOfficeInput
        .split(",")
        .map((d) => d.trim().toLowerCase())
        .filter((d) => d);

      const payload = {
        nome: document.getElementById("col-nome").value.trim(),
        cargo: document.getElementById("col-cargo").value.trim(),
        cpf: document.getElementById("col-cpf").value.trim(),
        email: document.getElementById("col-email").value.trim(),
        telefone: document.getElementById("col-telefone").value.trim(),
        cepResidencial: cepValue,
        horarioInicio: document.getElementById("col-inicio").value,
        horarioFim: document.getElementById("col-fim").value,
        diasHomeOffice: diasHomeOffice.length > 0 ? diasHomeOffice : ["sexta"],
        ativo: document.getElementById("col-ativo").checked,
      };

      try {
        if (editando) {
          await api.patch(`/api/colaboradores/${colaborador.id}`, payload);
        } else {
          await api.post("/api/colaboradores", payload);
        }
        showToast("Colaborador salvo com sucesso", "sucesso");
        fecharModal();
        carregarColaboradores();
      } catch (err) {
        document.getElementById("colaborador-form-erro").textContent = err.message;
        document.getElementById("colaborador-form-erro").classList.remove("hidden");
      }
    });
  }

  renderizarAba();
}
