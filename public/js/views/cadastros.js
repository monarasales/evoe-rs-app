import { api } from "../api.js";
import { store, isGestor, showToast } from "../state.js";
import { abrirModal, fecharModal } from "../modal.js";
import { MODELO_PADRAO, MARCADORES, mensagemConvite, termosSensiveis } from "../mensagemVaga.js";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

const ABAS = [
  { id: "equipe", label: "Equipe e Usuários" },
  { id: "parametros", label: "Parâmetros do Sistema" },
];

export async function renderConfiguracoes(root) {
  let abaAtiva = "equipe";

  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Configurações</h2>
        <div class="sub">Equipe com acesso ao sistema e parâmetros de operação. O cadastro de empresas clientes agora fica no menu CRM.</div>
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
        <thead><tr><th>Nome</th><th>Perfil</th><th>E-mail</th><th>WhatsApp</th><th>Usuário</th><th>Status</th>${isGestor() ? "<th></th>" : ""}</tr></thead>
        <tbody>
          ${consultores
            .map(
              (c) => `
            <tr data-id="${c.id}">
              <td>${escapeHtml(c.nome)}</td>
              <td>${c.perfil}</td>
              <td>${escapeHtml(c.email)}</td>
              <td>${escapeHtml(c.whatsapp)}</td>
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
              <option ${editando && consultor.perfil === "Supervisora" ? "selected" : ""}>Supervisora</option>
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
      </div>

      <div class="section-title" style="margin-top:22px;">Mensagem padrão de convite ao candidato</div>
      <div class="card" style="max-width:720px;">
        <div class="sub" style="margin-bottom:10px;">
          Texto usado em "Enviar pelo WhatsApp" e "Copiar mensagem" de todas as vagas. Cada consultor
          ainda pode personalizar a mensagem de uma vaga específica. Marcadores que o sistema preenche:
        </div>
        <ul class="sub" style="margin:0 0 10px 18px;">${MARCADORES.map(([m, d]) => `<li><strong>${m}</strong> — ${d}</li>`).join("")}</ul>
        <div class="form-row" style="margin-bottom:0;"><textarea id="mc-modelo" rows="14"></textarea></div>
        <div id="mc-alerta"></div>
        <details style="margin-top:8px;"><summary class="sub">Pré-visualizar com uma vaga de exemplo</summary><pre id="mc-previa" style="white-space:pre-wrap;"></pre></details>
        <div id="mc-info" class="sub" style="margin-top:6px;"></div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;">
          <button type="button" id="mc-salvar" class="btn btn-primary btn-sm">Salvar mensagem padrão</button>
          <button type="button" id="mc-restaurar" class="btn btn-outline btn-sm">Restaurar texto original</button>
        </div>
        <div id="mc-erro" class="form-erro hidden" style="margin-top:8px;"></div>
      </div>

      <div class="section-title" style="margin-top:22px;">Endereço do Escritório</div>
      <div class="card" style="max-width:560px;">
        <div class="sub" style="margin-bottom:10px;">
          Usado para conferir o ponto nos dias presenciais: quem bater o ponto a mais que o raio
          abaixo do escritório tem o registro salvo com um aviso.
        </div>
        <form id="form-escritorio">
          <div class="form-row">
            <label>CEP</label>
            <div style="display:flex; gap:8px;">
              <input type="text" id="esc-cep" inputmode="numeric" maxlength="9" placeholder="00000-000" style="flex:1;" />
              <button type="button" id="esc-buscar" class="btn btn-outline btn-sm">🔍 Buscar</button>
            </div>
          </div>
          <div class="form-row"><label>Rua / Avenida</label><input type="text" id="esc-rua" /></div>
          <div class="form-cols">
            <div class="form-row"><label>Número</label><input type="text" id="esc-numero" /></div>
            <div class="form-row"><label>Bairro</label><input type="text" id="esc-bairro" /></div>
          </div>
          <div class="form-cols">
            <div class="form-row"><label>Cidade</label><input type="text" id="esc-cidade" /></div>
            <div class="form-row"><label>UF</label><input type="text" id="esc-uf" maxlength="2" style="text-transform:uppercase;" /></div>
          </div>
          <div class="form-row"><label>Raio permitido (metros)</label><input type="number" id="esc-raio" min="50" max="5000" step="50" /></div>
          <div id="esc-status" class="sub" style="margin-bottom:12px;"></div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button type="submit" class="btn btn-primary btn-sm">Salvar endereço</button>
            <button type="button" id="esc-gps" class="btn btn-secondary btn-sm">📍 Usar minha localização atual</button>
          </div>
          <div class="sub" style="margin-top:6px;">Use o botão de localização só quando estiver <strong>dentro do escritório</strong> — é o jeito mais preciso.</div>
          <div id="esc-erro" class="form-erro hidden" style="margin-top:10px;"></div>
        </form>
      </div>

      <div class="section-title" style="margin-top:22px;">Backup dos Dados</div>
      <div class="card" style="max-width:560px;">
        <div class="sub" style="margin-bottom:10px;">
          Cópia de segurança de todos os dados do sistema (clientes, vagas, candidatos, contratos,
          colaboradores e ponto). O sistema envia uma cópia automática por e-mail uma vez por dia.
        </div>
        <div id="backup-status" class="sub" style="margin-bottom:12px;">Carregando situação do backup...</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <a href="/api/config/backup/download" class="btn btn-primary btn-sm">Baixar backup agora</a>
          <button type="button" id="btn-backup-email" class="btn btn-secondary btn-sm">Enviar backup por e-mail agora</button>
        </div>
        <div id="backup-erro" class="form-erro hidden"></div>
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

      configurarEscritorio(conteudo);
      configurarMensagemConvite(conteudo);

      const statusEl = conteudo.querySelector("#backup-status");
      const erroBackup = conteudo.querySelector("#backup-erro");
      const mostrarStatusBackup = (st) => {
        const ultimo = st.ultimoEnvio
          ? new Date(st.ultimoEnvio).toLocaleString("pt-BR")
          : "nenhum envio ainda";
        let texto = `<strong>Último backup enviado por e-mail:</strong> ${escapeHtml(ultimo)}`;
        if (st.destinatario) texto += `<br><strong>Enviado para:</strong> ${escapeHtml(st.destinatario)}`;
        if (!st.emailConfigurado) {
          texto += `<br>⚠️ O envio de e-mail não está configurado — o backup automático diário não está funcionando. Use "Baixar backup agora" enquanto isso.`;
        } else if (!st.automaticoAtivo) {
          texto += `<br>O envio automático diário só funciona no sistema online (aqui é a versão de teste).`;
        }
        if (st.ultimoErro) texto += `<br>⚠️ <strong>Última falha:</strong> ${escapeHtml(st.ultimoErro)}`;
        statusEl.innerHTML = texto;
      };
      api.get("/api/config/backup/status").then(mostrarStatusBackup).catch((err) => {
        statusEl.textContent = err.message;
      });

      const btnEmail = conteudo.querySelector("#btn-backup-email");
      btnEmail.addEventListener("click", async () => {
        erroBackup.classList.add("hidden");
        btnEmail.disabled = true;
        btnEmail.textContent = "Enviando...";
        try {
          mostrarStatusBackup(await api.post("/api/config/backup/enviar"));
          showToast("Backup enviado por e-mail.", "sucesso");
        } catch (err) {
          erroBackup.textContent = err.message;
          erroBackup.classList.remove("hidden");
        } finally {
          btnEmail.disabled = false;
          btnEmail.textContent = "Enviar backup por e-mail agora";
        }
      });
    }
  }

  renderizarAba();
}

// ---------- Mensagem padrão de convite ao candidato ----------
function configurarMensagemConvite(conteudo) {
  const $ = (id) => conteudo.querySelector(`#${id}`);
  const caixa = $("mc-modelo");
  const exemplo = {
    titulo: "Assistente Administrativo",
    pagina: { bairro: "Aldeota", cidade: "Fortaleza/CE", modeloTrabalho: "Presencial", tipoContratacao: "CLT", perfilComportamental: "organizado, comunicativo e proativo" },
  };
  const atualizar = () => {
    $("mc-previa").textContent = mensagemConvite(exemplo, `${location.origin}/vaga/exemplo`, caixa.value);
    const achados = termosSensiveis(caixa.value);
    $("mc-alerta").innerHTML = achados.length
      ? `<div class="ponto-aviso" style="margin-top:6px;">⚠️ Termo(s) que podem ser considerados discriminatórios: ${achados.map((x) => `<strong>"${x.termo}"</strong> (${x.tipo})`).join(", ")}. Prefira descrever competências e comportamentos (CLT art. 373-A e Lei 9.029/95).</div>`
      : "";
  };
  const info = (r) => {
    $("mc-info").textContent = r.modelo
      ? `Mensagem personalizada${r.atualizadoPor ? ` — alterada por ${r.atualizadoPor}` : ""}${r.atualizadoEm ? ` em ${new Date(r.atualizadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : ""}.`
      : "Usando o texto original do sistema.";
  };
  caixa.addEventListener("input", atualizar);
  api.get("/api/config/mensagem-convite").then((r) => {
    caixa.value = r.modelo || MODELO_PADRAO;
    info(r);
    atualizar();
  });
  const salvar = async (modelo, aviso) => {
    const erro = $("mc-erro");
    erro.classList.add("hidden");
    try {
      await api.put("/api/config/mensagem-convite", { modelo });
      const r = await api.get("/api/config/mensagem-convite");
      caixa.value = r.modelo || MODELO_PADRAO;
      info(r);
      atualizar();
      showToast(aviso, "sucesso");
    } catch (err) {
      erro.textContent = err.message;
      erro.classList.remove("hidden");
    }
  };
  // Salvar exatamente o texto original equivale a "não personalizado".
  $("mc-salvar").addEventListener("click", () => salvar(caixa.value.trim() === MODELO_PADRAO ? "" : caixa.value, "Mensagem padrão salva."));
  $("mc-restaurar").addEventListener("click", () => salvar("", "Texto original restaurado."));
}

// ---------- Endereço do escritório (validação do ponto presencial) ----------
function configurarEscritorio(conteudo) {
  const $ = (id) => conteudo.querySelector(`#${id}`);
  const form = $("form-escritorio");
  const statusEl = $("esc-status");
  const erroEl = $("esc-erro");
  const formatarCep = (v) => {
    const d = String(v || "").replace(/\D/g, "").slice(0, 8);
    return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
  };

  function mostrarStatus(emp) {
    const loc = emp.localizacaoEmpresa;
    if (loc && loc.lat != null) {
      const origem = loc.origem === "gps" ? "pelo GPS no escritório" : "pelo endereço";
      statusEl.innerHTML = `✅ Escritório localizado no mapa (${origem}). ` +
        `<a href="https://www.openstreetmap.org/?mlat=${loc.lat}&mlon=${loc.long}#map=18/${loc.lat}/${loc.long}" target="_blank" rel="noopener">Conferir no mapa</a>`;
    } else if (emp.enderecoEmpresa) {
      statusEl.textContent = "⚠️ Endereço salvo, mas ainda não localizado no mapa — o ponto presencial não está sendo conferido.";
    } else {
      statusEl.textContent = "⚠️ Escritório ainda não cadastrado — o ponto presencial não está sendo conferido.";
    }
  }

  function preencher(emp) {
    $("esc-cep").value = formatarCep(emp.cepEmpresa);
    $("esc-rua").value = emp.logradouroEmpresa || "";
    $("esc-numero").value = emp.numeroEmpresa || "";
    $("esc-bairro").value = emp.bairroEmpresa || "";
    $("esc-cidade").value = emp.cidadeEmpresa || "";
    $("esc-uf").value = emp.estadoEmpresa || "";
    $("esc-raio").value = emp.raioTolerancia || 500;
    mostrarStatus(emp);
  }

  api.get("/api/configuracao/empresa").then(preencher).catch((err) => (statusEl.textContent = err.message));

  $("esc-cep").addEventListener("input", (e) => {
    e.target.value = formatarCep(e.target.value);
    if (e.target.value.replace(/\D/g, "").length === 8) buscarCep();
  });
  $("esc-buscar").addEventListener("click", buscarCep);
  async function buscarCep() {
    try {
      const r = await api.post("/api/configuracao/geocodificar-cep", { cep: $("esc-cep").value });
      $("esc-rua").value = r.logradouro || "";
      $("esc-bairro").value = r.bairro || "";
      $("esc-cidade").value = r.cidade || "";
      $("esc-uf").value = r.estado || "";
      $("esc-numero").focus();
    } catch (err) {
      showToast(err.message, "erro");
    }
  }

  async function salvar(extra = {}) {
    erroEl.classList.add("hidden");
    try {
      const emp = await api.patch("/api/configuracao/empresa", {
        cepEmpresa: $("esc-cep").value,
        logradouroEmpresa: $("esc-rua").value,
        numeroEmpresa: $("esc-numero").value,
        bairroEmpresa: $("esc-bairro").value,
        cidadeEmpresa: $("esc-cidade").value,
        estadoEmpresa: $("esc-uf").value,
        raioTolerancia: Number($("esc-raio").value) || 500,
        ...extra,
      });
      preencher(emp);
      showToast(emp.aviso || "Endereço do escritório salvo.", emp.aviso ? "erro" : "sucesso");
    } catch (err) {
      erroEl.textContent = err.message;
      erroEl.classList.remove("hidden");
    }
  }

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    salvar();
  });

  $("esc-gps").addEventListener("click", () => {
    if (!navigator.geolocation) return showToast("Este navegador não informa a localização.", "erro");
    statusEl.textContent = "📍 Obtendo sua localização...";
    navigator.geolocation.getCurrentPosition(
      (pos) => salvar({ lat: pos.coords.latitude, long: pos.coords.longitude }),
      (err) => {
        statusEl.textContent = "";
        erroEl.textContent = `Não foi possível obter a localização: ${err.message}. Permita o acesso à localização no navegador.`;
        erroEl.classList.remove("hidden");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}
