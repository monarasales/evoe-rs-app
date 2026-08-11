import { api } from "../api.js";
import { store, isGestor, showToast, formatarData } from "../state.js";
import { abrirModal, fecharModal } from "../modal.js";
import { isoParaBr, brParaIso, isoValida, aplicarMascaraData } from "../dateMask.js";
import { campoEnderecoHtml, aplicarBuscaCep, montarEnderecoDosCampos } from "../enderecoCampo.js";
import { normalizarBlocos } from "../horarioBlocos.js";

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

// Controle de Ponto: o Gestor liga/desliga por pessoa (campo controlaPonto), sem
// depender do tipo de vínculo — um CLT também pode usar, por exemplo. Espelha
// DIAS_SEMANA em server/utils/constants.js.
const DIAS_SEMANA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

// Mesma regra de padrão usada no backend (server/utils/pontoCompute.js): sem escolha
// explícita, cai no comportamento antigo (ligado só para quem é Estágio).
function controlaPontoInicial(consultor) {
  if (!consultor) return false;
  if (typeof consultor.controlaPonto === "boolean") return consultor.controlaPonto;
  return consultor.tipoVinculo === "Estágio";
}

// Endereço preenchido mas sem coordenadas (a busca automática no mapa falhou ou nunca
// rodou) — enquanto isso não for corrigido, o Ponto não consegue comparar a batida
// contra esse endereço. Se for o endereço de trabalho de quem é presencial, e só o
// residencial tiver coordenada, a pessoa aparece "fora do alcance" mesmo estando no
// lugar certo, porque a única referência disponível é a casa dela, não o trabalho.
function enderecoPontoSemGeo(consultor) {
  const enderecoSemGeo = consultor.endereco && !consultor.enderecoLat;
  const enderecoTrabalhoSemGeo = consultor.enderecoTrabalho && !consultor.enderecoTrabalhoLat;
  return Boolean(enderecoSemGeo || enderecoTrabalhoSemGeo);
}

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
        <thead><tr><th>Nome</th><th>Perfil</th><th>Admissão</th><th>Vínculo</th><th>Remuneração</th><th>Usuário</th><th>Status</th><th>Ponto</th>${isGestor() ? "<th></th>" : ""}</tr></thead>
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
              <td>${
                controlaPontoInicial(c)
                  ? enderecoPontoSemGeo(c)
                    ? '<span class="tag tag-atrasada" title="Endereço usado no Ponto não foi localizado no mapa — a checagem de dentro/fora do alcance não funciona direito até corrigir. Edite o cadastro e deixe o endereço mais completo (bairro, cidade), depois salve de novo.">⚠️ Sem localização</span>'
                    : '<span class="tag tag-nprazo">🕒 Ligado</span>'
                  : '<span class="sub">Desligado</span>'
              }</td>
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
    const pontoInicial = controlaPontoInicial(consultor);
    // Horário esperado: lista de blocos (dias + entrada/saída/pausa), pra permitir
    // horários diferentes conforme o dia da semana. normalizarBlocos também lê o
    // formato antigo (um único objeto), de cadastros feitos antes dessa mudança.
    let blocos = normalizarBlocos(editando ? consultor.horarioEsperado : null);
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
          <div class="form-row">
            <label>Data de admissão</label>
            <input type="text" inputmode="numeric" placeholder="dd/mm/aaaa" maxlength="10" id="cs-admissao" value="${editando ? isoParaBr(consultor.dataAdmissao) : ""}" />
          </div>
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
        <div class="form-row">
          <label>Data de nascimento</label>
          <input type="text" inputmode="numeric" placeholder="dd/mm/aaaa" maxlength="10" id="cs-nascimento" value="${editando ? isoParaBr(consultor.dataNascimento) : ""}" style="max-width:180px;" />
        </div>
        ${campoEnderecoHtml("cs-end", "Endereço Residencial", editando ? consultor.endereco : "")}
        ${
          editando && consultor.endereco && !consultor.enderecoLat
            ? '<div class="sub" style="color:#c0392b; margin-top:-6px; margin-bottom:10px;">⚠️ Não conseguimos localizar esse endereço residencial no mapa — deixe mais completo (bairro, cidade, CEP) e salve de novo.</div>'
            : ""
        }
        <div class="form-row" id="cs-desligamento-row" style="${!editando || consultor.ativo ? "display:none;" : ""}">
          <label>Data de desligamento</label>
          <input type="text" inputmode="numeric" placeholder="dd/mm/aaaa" maxlength="10" id="cs-desligamento" value="${editando ? isoParaBr(consultor.dataDesligamento) : ""}" />
        </div>

        <div class="form-row checkbox-row">
          <input type="checkbox" id="cs-controla-ponto" ${pontoInicial ? "checked" : ""} />
          <label style="margin:0;">🕒 Usa Controle de Ponto</label>
        </div>
        <div id="cs-ponto-section" style="${pontoInicial ? "" : "display:none;"}">
          <h3 class="section-title" style="margin-top:10px;">Controle de Ponto</h3>
          <div class="sub" style="margin-top:-6px; margin-bottom:8px;">
            Entrada batida automaticamente ao logar; saída batida pela própria pessoa. Preencha os dois endereços abaixo —
            em dias de home office ou no escritório, o sistema identifica sozinho de qual dos dois a batida veio (margem de ~500m).
          </div>
          <div id="cs-endereco-trabalho-row">
            ${campoEnderecoHtml("cs-endt", "Endereço de Trabalho", editando ? consultor.enderecoTrabalho : "")}
          </div>
          ${
            editando && consultor.enderecoTrabalho && !consultor.enderecoTrabalhoLat
              ? '<div class="sub" style="color:#c0392b; margin-top:-6px; margin-bottom:10px;">⚠️ Não conseguimos localizar esse endereço de trabalho no mapa — enquanto isso, quem bate ponto presencialmente pode aparecer "fora do alcance" sem estar errado. Deixe o endereço mais completo (bairro, cidade, CEP) e salve de novo.</div>'
              : ""
          }
          <div class="sub" style="margin-top:-6px; margin-bottom:10px;">O Endereço Residencial (acima, em Dados de RH) também é usado como referência.</div>

          <div class="form-row"><label>Horário de trabalho</label></div>
          <div class="sub" style="margin-top:-6px; margin-bottom:8px;">
            Se a pessoa entra em horários diferentes conforme o dia (ex: Segunda/Quarta/Sexta num turno, Terça/Quinta em outro),
            cadastre um horário para cada grupo de dias clicando em "+ Adicionar horário diferente".
          </div>
          <div id="cs-horario-blocos"></div>
          <button type="button" id="btn-add-bloco" class="btn btn-outline btn-sm" style="margin-bottom:14px;">+ Adicionar horário diferente</button>
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

    aplicarMascaraData(document.getElementById("cs-admissao"));
    aplicarMascaraData(document.getElementById("cs-nascimento"));
    aplicarMascaraData(document.getElementById("cs-desligamento"));
    aplicarBuscaCep("cs-end");
    aplicarBuscaCep("cs-endt");

    // ---------- Blocos de horário (Controle de Ponto) ----------
    function blocoHtml(bloco, idx) {
      return `
        <div class="card horario-bloco-item" data-idx="${idx}" style="margin-bottom:10px; padding:12px 14px;">
          <div class="form-row">
            <label>Dias deste horário</label>
            <div class="checkbox-row" style="flex-wrap:wrap; gap:4px 14px;">
              ${DIAS_SEMANA.map(
                (d) =>
                  `<label style="display:inline-flex; align-items:center; gap:4px; font-weight:400;"><input type="checkbox" class="bloco-dia" value="${d}" ${bloco.dias && bloco.dias.includes(d) ? "checked" : ""} /> ${d}</label>`
              ).join("")}
            </div>
          </div>
          <div class="form-cols">
            <div class="form-row"><label>Entrada</label><input type="time" class="bloco-entrada" value="${bloco.entrada || "08:00"}" /></div>
            <div class="form-row"><label>Saída</label><input type="time" class="bloco-saida" value="${bloco.saida || "17:00"}" /></div>
            <div class="form-row"><label>Pausa almoço (min)</label><input type="number" min="0" step="5" class="bloco-pausa" placeholder="ex: 60" value="${bloco.pausaAlmocoMinutos ? bloco.pausaAlmocoMinutos : ""}" /></div>
          </div>
          ${blocos.length > 1 ? '<button type="button" class="btn btn-outline btn-sm btn-remover-bloco" style="color:#c0392b;">Remover este horário</button>' : ""}
        </div>`;
    }

    // Lê o estado atual dos campos na tela de volta pro array `blocos` — chamado
    // antes de adicionar/remover um bloco (pra não perder o que já foi preenchido
    // nos outros) e antes de montar o payload no envio do formulário.
    function sincronizarBlocosDoDom() {
      const itens = document.querySelectorAll("#cs-horario-blocos .horario-bloco-item");
      blocos = Array.from(itens).map((item) => ({
        dias: Array.from(item.querySelectorAll(".bloco-dia:checked")).map((el) => el.value),
        entrada: item.querySelector(".bloco-entrada").value,
        saida: item.querySelector(".bloco-saida").value,
        pausaAlmocoMinutos: item.querySelector(".bloco-pausa").value ? Number(item.querySelector(".bloco-pausa").value) : 0,
      }));
    }

    function renderizarBlocos() {
      const container = document.getElementById("cs-horario-blocos");
      container.innerHTML = blocos.length
        ? blocos.map((b, i) => blocoHtml(b, i)).join("")
        : '<div class="sub" style="margin-bottom:8px;">Nenhum horário adicionado ainda.</div>';
      container.querySelectorAll(".btn-remover-bloco").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          sincronizarBlocosDoDom();
          const idx = Number(e.target.closest(".horario-bloco-item").dataset.idx);
          blocos.splice(idx, 1);
          renderizarBlocos();
        });
      });
    }

    renderizarBlocos();

    document.getElementById("btn-add-bloco").addEventListener("click", () => {
      sincronizarBlocosDoDom();
      blocos.push({ dias: [], entrada: "08:00", saida: "17:00", pausaAlmocoMinutos: 0 });
      renderizarBlocos();
    });

    document.getElementById("cs-vinculo").addEventListener("change", (ev) => {
      document.getElementById("cs-remuneracao-label").textContent = rotuloRemuneracao(ev.target.value);
    });
    document.getElementById("cs-ativo").addEventListener("change", (ev) => {
      document.getElementById("cs-desligamento-row").style.display = ev.target.checked ? "none" : "";
    });
    document.getElementById("cs-controla-ponto").addEventListener("change", (ev) => {
      document.getElementById("cs-ponto-section").style.display = ev.target.checked ? "" : "none";
      if (ev.target.checked && blocos.length === 0) {
        blocos.push({ dias: [], entrada: "08:00", saida: "17:00", pausaAlmocoMinutos: 0 });
        renderizarBlocos();
      }
    });

    document.getElementById("form-consultor").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const erroEl = document.getElementById("consultor-form-erro");
      erroEl.classList.add("hidden");

      // Datas digitadas em dd/mm/aaaa (ver dateMask.js) — cada campo só vira ISO se
      // estiver com os 8 dígitos e for uma data válida; campo vazio vira "" normalmente,
      // mas dígitos incompletos ou uma data inexistente (ex: 31/02) barram o envio em
      // vez de salvar algo errado ou incompleto sem avisar.
      const camposData = [
        { id: "cs-admissao", label: "Data de admissão", obrigatorio: false },
        { id: "cs-nascimento", label: "Data de nascimento", obrigatorio: false },
        { id: "cs-desligamento", label: "Data de desligamento", obrigatorio: false },
      ];
      const datasIso = {};
      for (const campo of camposData) {
        const digitado = document.getElementById(campo.id).value.trim();
        if (!digitado) {
          datasIso[campo.id] = "";
          continue;
        }
        const digitos = digitado.replace(/\D/g, "");
        const iso = brParaIso(digitado);
        if (digitos.length < 8 || !isoValida(iso)) {
          erroEl.textContent = `${campo.label}: "${digitado}" não é uma data válida. Use o formato dd/mm/aaaa.`;
          erroEl.classList.remove("hidden");
          return;
        }
        datasIso[campo.id] = iso;
      }

      const ativo = document.getElementById("cs-ativo").checked;
      const tipoVinculo = document.getElementById("cs-vinculo").value;
      const controlaPonto = document.getElementById("cs-controla-ponto").checked;

      // Controle de Ponto: quando desligado, envia horarioEsperado null (não usa)
      // mesmo que os campos escondidos tenham algum valor residual no formulário.
      // Quando ligado, envia a lista de blocos (cada um com seus dias e horário —
      // permite horários diferentes conforme o dia da semana).
      sincronizarBlocosDoDom();
      const horarioEsperado = controlaPonto ? blocos : null;

      const payload = {
        nome: document.getElementById("cs-nome").value.trim(),
        email: document.getElementById("cs-email").value.trim(),
        whatsapp: document.getElementById("cs-whatsapp").value.trim(),
        perfil: document.getElementById("cs-perfil").value,
        ativo,
        dataAdmissao: datasIso["cs-admissao"],
        tipoVinculo,
        valorRemuneracao: document.getElementById("cs-remuneracao").value,
        cpf: document.getElementById("cs-cpf").value.trim(),
        beneficios: document.getElementById("cs-beneficios").value.trim(),
        dataNascimento: datasIso["cs-nascimento"],
        endereco: montarEnderecoDosCampos("cs-end", editando ? consultor.endereco : ""),
        dataDesligamento: ativo ? null : (datasIso["cs-desligamento"] || null),
        controlaPonto,
        enderecoTrabalho: montarEnderecoDosCampos("cs-endt", editando ? consultor.enderecoTrabalho : ""),
        horarioEsperado,
      };
      const username = document.getElementById("cs-username").value.trim();
      const senha = document.getElementById("cs-senha").value;
      if (!editando) {
        payload.username = username;
        payload.senha = senha;
      }
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

        // Avisa se algum endereço usado no Controle de Ponto não foi localizado
        // automaticamente — a checagem de distância não vai funcionar para ele até
        // o texto do endereço ser ajustado (ex: mais completo, com bairro/cidade).
        const enderecoSemGeo = controlaPonto && payload.endereco && !consultorSalvo.enderecoLat;
        const enderecoTrabalhoSemGeo = controlaPonto && payload.enderecoTrabalho && !consultorSalvo.enderecoTrabalhoLat;
        if (enderecoSemGeo || enderecoTrabalhoSemGeo) {
          showToast("Funcionário salvo, mas não conseguimos localizar automaticamente o endereço informado — tente deixá-lo mais completo (bairro, cidade). A checagem de localização do ponto fica desativada até lá.", "erro");
        } else {
          showToast("Funcionário salvo.", "sucesso");
        }
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
      </div>

      <div class="section-title" style="margin-top:22px;">Controle de Ponto — Raio de Tolerância</div>
      <div class="card" style="max-width:480px;">
        <div class="sub" style="margin-bottom:10px;">
          Distância máxima (em metros) entre a localização batida e o endereço cadastrado (residencial ou de trabalho) mais
          próximo para não avisar "Fora do local". Aumente esse valor se estiver aparecendo aviso indevido com frequência —
          o GPS de notebook/desktop costuma ser bem menos preciso do que o de celular.
        </div>
        <form id="form-tolerancia-ponto" class="form-cols" style="align-items:end;">
          <div class="form-row"><label>Raio de tolerância (metros)</label><input type="number" min="50" step="50" id="tp-raio" value="${cfg.toleranciaPontoMetros}" /></div>
          <div class="form-row"><button type="submit" class="btn btn-primary btn-sm">Salvar</button></div>
        </form>
        <div id="tp-erro" class="form-erro hidden"></div>
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

      const formTolerancia = conteudo.querySelector("#form-tolerancia-ponto");
      formTolerancia.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        try {
          await api.patch("/api/config/tolerancia-ponto", {
            toleranciaMetros: Number(document.getElementById("tp-raio").value),
          });
          showToast("Raio de tolerância salvo.", "sucesso");
        } catch (err) {
          const box = conteudo.querySelector("#tp-erro");
          box.textContent = err.message;
          box.classList.remove("hidden");
        }
      });
    }
  }

  renderizarAba();
}
