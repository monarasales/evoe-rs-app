import { api } from "../api.js";
import { store, isGestor, showToast } from "../state.js";
import { abrirModal, fecharModal } from "../modal.js";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

const DIAS_SEMANA = [
  { valor: "segunda", label: "Seg" },
  { valor: "terça", label: "Ter" },
  { valor: "quarta", label: "Qua" },
  { valor: "quinta", label: "Qui" },
  { valor: "sexta", label: "Sex" },
  { valor: "sábado", label: "Sáb" },
  { valor: "domingo", label: "Dom" },
];

const soDigitos = (s) => String(s || "").replace(/\D/g, "");

function formatarCep(valor) {
  const d = soDigitos(valor).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

function formatarCpf(valor) {
  const d = soDigitos(valor).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function formatarTelefone(valor) {
  const d = soDigitos(valor).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Confere os dígitos verificadores do CPF (mesma regra do servidor). */
function cpfValido(cpf) {
  const n = soDigitos(cpf);
  if (n.length !== 11 || /^(\d)\1{10}$/.test(n)) return false;
  for (const tam of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < tam; i++) soma += Number(n[i]) * (tam + 1 - i);
    if (((soma * 10) % 11) % 10 !== Number(n[tam])) return false;
  }
  return true;
}

function calcularIdade(dataIso) {
  if (!dataIso) return null;
  const nasc = new Date(dataIso + "T00:00:00");
  if (isNaN(nasc)) return null;
  const hoje = new Date();
  let idade = hoje.getFullYear() - nasc.getFullYear();
  if (hoje < new Date(hoje.getFullYear(), nasc.getMonth(), nasc.getDate())) idade--;
  return idade >= 0 ? idade : null;
}

/** Máscara de data enquanto digita: "30121999" -> "30/12/1999". */
function mascaraData(valor) {
  const d = soDigitos(valor).slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** "30/12/1999" -> "1999-12-30"; "" -> ""; data inexistente -> null. */
function brParaIso(texto) {
  const t = String(texto || "").trim();
  if (!t) return "";
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (!m) return null;
  const [, dia, mes, ano] = m;
  const d = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));
  if (d.getUTCFullYear() !== Number(ano) || d.getUTCMonth() !== Number(mes) - 1 || d.getUTCDate() !== Number(dia)) return null;
  return `${ano}-${mes}-${dia}`;
}

function formatarDataBr(dataIso) {
  if (!dataIso) return "—";
  const [a, m, d] = dataIso.split("-");
  return `${d}/${m}/${a}`;
}

const ABAS = [
  { id: "colaboradores", label: "Cadastro de Colaboradores" },
];

export async function renderColaboradores(root) {
  let abaAtiva = "colaboradores";

  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Colaboradores</h2>
        <div class="sub">Cadastro de funcionários. Marcações, saldos e escalas ficam em Gestão do Ponto.</div>
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
    renderAbaCadastro();
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

  let listaColaboradores = [];

  async function carregarColaboradores() {
    try {
      const colaboradores = await api.get("/api/colaboradores");
      listaColaboradores = colaboradores;
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
              <th>Login (ponto)</th>
              <th>Nascimento</th>
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
                <td>${loginDoColaborador(c)}</td>
                <td>${c.dataNascimento ? `${formatarDataBr(c.dataNascimento)} <span class="sub">(${calcularIdade(c.dataNascimento)} anos)</span>` : "—"}</td>
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

  function loginDoColaborador(c) {
    const consultor = c.consultorId && store.consultores.find((x) => x.id === c.consultorId);
    if (!consultor) return '<span class="tag tag-atrasada">sem login</span>';
    return escapeHtml(consultor.username || consultor.nome);
  }

  function abrirFormularioColaborador(colaborador) {
    const editando = !!colaborador;
    const c = colaborador || {};
    const v = (campo) => escapeHtml(c[campo] || "");
    const diasHomeOffice = editando ? c.diasHomeOffice || [] : ["sexta"];

    abrirModal(`
      <h2>${editando ? "Editar Colaborador" : "Novo Colaborador"}</h2>
      <form id="form-colaborador" novalidate>
        <div class="section-title" style="margin-top:0;">Dados pessoais</div>
        <div class="form-row"><label>Nome completo *</label><input type="text" id="col-nome" required value="${v("nome")}" /></div>
        <div class="form-cols">
          <div class="form-row">
            <label>Data de nascimento</label>
            <input type="text" id="col-nascimento" inputmode="numeric" maxlength="10" placeholder="dd/mm/aaaa" value="${c.dataNascimento ? formatarDataBr(c.dataNascimento) : ""}" />
            <div class="sub" id="col-idade" style="margin-top:4px;"></div>
          </div>
          <div class="form-row"><label>CPF</label><input type="text" id="col-cpf" inputmode="numeric" placeholder="000.000.000-00" maxlength="14" value="${v("cpf")}" /></div>
        </div>
        <div class="form-row"><label>Cargo</label><input type="text" id="col-cargo" value="${v("cargo")}" /></div>
        <div class="form-cols">
          <div class="form-row"><label>E-mail</label><input type="email" id="col-email" value="${v("email")}" /></div>
          <div class="form-row"><label>Telefone / WhatsApp</label><input type="tel" id="col-telefone" inputmode="numeric" placeholder="(00) 00000-0000" maxlength="15" value="${v("telefone")}" /></div>
        </div>

        <div class="section-title">Endereço residencial</div>
        <div class="form-row">
          <label>CEP</label>
          <div style="display:flex; gap:8px;">
            <input type="text" id="col-cep" inputmode="numeric" placeholder="00000-000" maxlength="9" value="${escapeHtml(formatarCep(c.cepResidencial || ""))}" style="flex:1;" />
            <button type="button" id="btn-buscar-cep" class="btn btn-outline btn-sm">🔍 Buscar</button>
          </div>
          <div class="sub" id="col-cep-status" style="margin-top:4px;">Digite o CEP para preencher o endereço automaticamente. Se não for encontrado, preencha à mão.</div>
        </div>
        <div class="form-row"><label>Rua / Avenida</label><input type="text" id="col-endereco" value="${v("enderecoResidencial")}" /></div>
        <div class="form-cols">
          <div class="form-row"><label>Número</label><input type="text" id="col-numero" value="${v("numeroResidencial")}" /></div>
          <div class="form-row"><label>Complemento</label><input type="text" id="col-complemento" placeholder="apto, bloco..." value="${v("complementoResidencial")}" /></div>
        </div>
        <div class="form-row"><label>Bairro</label><input type="text" id="col-bairro" value="${v("bairroResidencial")}" /></div>
        <div class="form-cols">
          <div class="form-row"><label>Cidade</label><input type="text" id="col-cidade" value="${v("cidadeResidencial")}" /></div>
          <div class="form-row"><label>UF</label><input type="text" id="col-uf" maxlength="2" placeholder="CE" style="text-transform:uppercase;" value="${v("estadoResidencial")}" /></div>
        </div>

        <div class="section-title">Jornada e ponto</div>
        <div class="form-row">
          <label>Login no sistema (usado para bater ponto)</label>
          <select id="col-login">
            <option value="">— Sem login (não bate ponto) —</option>
            ${store.consultores
              .filter((cons) => cons.ativo !== false || cons.id === c.consultorId)
              .map((cons) => {
                const dono = listaColaboradores.find((x) => x.consultorId === cons.id && x.id !== c.id);
                return `<option value="${cons.id}" ${c.consultorId === cons.id ? "selected" : ""} ${dono ? "disabled" : ""}>
                  ${escapeHtml(cons.nome)}${cons.username ? ` (${escapeHtml(cons.username)})` : " (sem usuário)"}${dono ? ` — já usado por ${escapeHtml(dono.nome)}` : ""}
                </option>`;
              })
              .join("")}
          </select>
          <div class="sub" style="margin-top:4px;">Quem não aparece na lista precisa primeiro ganhar um login em Configurações › Equipe e Usuários.</div>
        </div>
        <div class="form-row">
          <label>Início do controle de ponto</label>
          <input type="text" id="col-inicio-ponto" inputmode="numeric" maxlength="10" placeholder="dd/mm/aaaa" value="${c.dataInicioPonto ? formatarDataBr(c.dataInicioPonto) : editando ? "" : new Date().toLocaleDateString("pt-BR")}" />
          <div class="sub" style="margin-top:4px;">Dias antes desta data não são cobrados (nem contam como falta). Em branco = a partir da primeira marcação.</div>
        </div>
        <div class="sub" style="margin-bottom:12px;">Os horários de trabalho (escala) ficam em Gestão do Ponto › Escalas.</div>
        <div class="form-row">
          <label>Dias de home office</label>
          <div style="display:flex; flex-wrap:wrap; gap:6px 14px;">
            ${DIAS_SEMANA.map((d) => `
              <label class="checkbox-row" style="font-weight:400; margin:0;">
                <input type="checkbox" class="col-dia-ho" value="${d.valor}" ${diasHomeOffice.includes(d.valor) ? "checked" : ""} /> ${d.label}
              </label>`).join("")}
          </div>
        </div>
        <div class="form-row checkbox-row">
          <input type="checkbox" id="col-ativo" ${!editando || c.ativo ? "checked" : ""} />
          <label for="col-ativo" style="margin:0;">Ativo</label>
        </div>

        <div id="colaborador-form-erro" class="form-erro hidden"></div>
        <div class="modal-close-row">
          <button type="button" id="btn-cancelar-col" class="btn btn-outline">Fechar</button>
          <button type="submit" class="btn btn-primary">${editando ? "Salvar" : "Criar"}</button>
        </div>
      </form>
    `);

    const $ = (id) => document.getElementById(id);
    const inputCEP = $("col-cep");
    const cepStatus = $("col-cep-status");
    const btnBuscarCEP = $("btn-buscar-cep");
    const erroBox = $("colaborador-form-erro");

    // Máscaras enquanto digita
    const aplicarMascara = (input, fn) => input.addEventListener("input", () => (input.value = fn(input.value)));
    aplicarMascara($("col-cpf"), formatarCpf);
    aplicarMascara($("col-telefone"), formatarTelefone);
    aplicarMascara(inputCEP, formatarCep);

    // Idade ao lado da data de nascimento
    const inputNasc = $("col-nascimento");
    aplicarMascara(inputNasc, mascaraData);
    aplicarMascara($("col-inicio-ponto"), mascaraData);
    const mostrarIdade = () => {
      const iso = brParaIso(inputNasc.value);
      const idade = iso ? calcularIdade(iso) : null;
      $("col-idade").textContent = idade !== null ? `${idade} anos` : "";
    };
    inputNasc.addEventListener("input", mostrarIdade);
    mostrarIdade();

    // Busca do CEP: preenche os campos, mas eles continuam editáveis.
    // Se não encontrar (ou o serviço estiver fora do ar), só avisa — nunca impede salvar.
    let ultimoCepBuscado = (c.cepResidencial || "").replace(/\D/g, "");
    async function buscarCEP(forcar = false) {
      const cep = inputCEP.value.replace(/\D/g, "");
      if (cep.length !== 8) {
        if (forcar) cepStatus.textContent = "O CEP deve ter 8 dígitos.";
        return;
      }
      if (!forcar && cep === ultimoCepBuscado) return;
      ultimoCepBuscado = cep;

      btnBuscarCEP.disabled = true;
      cepStatus.textContent = "⏳ Buscando endereço...";
      try {
        const r = await api.post("/api/configuracao/geocodificar-cep", { cep });
        $("col-endereco").value = r.logradouro || "";
        $("col-bairro").value = r.bairro || "";
        $("col-cidade").value = r.cidade || "";
        $("col-uf").value = r.estado || "";
        cepStatus.textContent = "✅ Endereço encontrado. Complete o número (e o complemento, se houver).";
        $(r.logradouro ? "col-numero" : "col-endereco").focus();
      } catch (err) {
        cepStatus.textContent = "⚠️ CEP não encontrado automaticamente. Preencha o endereço abaixo — o cadastro será salvo normalmente.";
        $("col-endereco").focus();
      } finally {
        btnBuscarCEP.disabled = false;
      }
    }
    btnBuscarCEP.addEventListener("click", () => buscarCEP(true));
    inputCEP.addEventListener("input", () => {
      if (inputCEP.value.replace(/\D/g, "").length === 8) buscarCEP();
    });

    // Cadastro novo: ao escolher o login, aproveita nome/e-mail/WhatsApp da equipe.
    $("col-login").addEventListener("change", () => {
      const cons = store.consultores.find((x) => x.id === $("col-login").value);
      if (!cons) return;
      if (!$("col-nome").value.trim()) $("col-nome").value = cons.nome || "";
      if (!$("col-email").value.trim()) $("col-email").value = cons.email || "";
      if (!$("col-telefone").value.trim()) $("col-telefone").value = formatarTelefone(cons.whatsapp || "");
    });

    $("btn-cancelar-col").addEventListener("click", fecharModal);
    $("form-colaborador").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      erroBox.classList.add("hidden");

      const nome = $("col-nome").value.trim();
      const cep = inputCEP.value.replace(/\D/g, "");
      const cpf = $("col-cpf").value.trim();
      let msg = "";
      if (!nome) msg = "Informe o nome do colaborador.";
      else if (cep && cep.length !== 8) msg = "O CEP deve ter 8 dígitos (ou deixe em branco).";
      else if (cpf && !cpfValido(cpf)) msg = "CPF inválido. Confira os números.";
      else if (brParaIso(inputNasc.value) === null) msg = "Data de nascimento inválida. Use o formato dd/mm/aaaa (ex.: 30/12/1999).";
      else if (brParaIso($("col-inicio-ponto").value) === null) msg = "Data de início do controle de ponto inválida. Use dd/mm/aaaa.";
      if (msg) {
        erroBox.textContent = msg;
        erroBox.classList.remove("hidden");
        return;
      }

      const payload = {
        nome,
        dataNascimento: brParaIso(inputNasc.value),
        cpf,
        cargo: $("col-cargo").value.trim(),
        email: $("col-email").value.trim(),
        telefone: $("col-telefone").value.trim(),
        cepResidencial: cep,
        enderecoResidencial: $("col-endereco").value.trim(),
        numeroResidencial: $("col-numero").value.trim(),
        complementoResidencial: $("col-complemento").value.trim(),
        bairroResidencial: $("col-bairro").value.trim(),
        cidadeResidencial: $("col-cidade").value.trim(),
        estadoResidencial: $("col-uf").value.trim().toUpperCase(),
        diasHomeOffice: [...document.querySelectorAll(".col-dia-ho:checked")].map((el) => el.value),
        ativo: $("col-ativo").checked,
        consultorId: $("col-login").value || null,
        dataInicioPonto: brParaIso($("col-inicio-ponto").value),
      };

      const btnSalvar = ev.submitter || $("form-colaborador").querySelector("button[type=submit]");
      btnSalvar.disabled = true;
      btnSalvar.textContent = "Salvando...";
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
        erroBox.textContent = err.message;
        erroBox.classList.remove("hidden");
        btnSalvar.disabled = false;
        btnSalvar.textContent = editando ? "Salvar" : "Criar";
      }
    });
  }

  renderizarAba();
}
