import { api } from "../api.js";
import { store, showToast, nomeConsultor, nomeEmpresa } from "../state.js";
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
  { id: "produtividade", label: "Produtividade" },
];

function diasAtras(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

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
      <select id="filtro-consultor-cand">
        <option value="">Todos os consultores</option>
        ${store.consultores.map((c) => `<option value="${c.id}">${c.nome}</option>`).join("")}
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

  const filtroConsultor = root.querySelector("#filtro-consultor-cand");
  const tabsEl = root.querySelector("#candidatos-tabs");

  function vagasFiltradasPorConsultor() {
    return filtroConsultor.value ? vagas.filter((v) => v.consultorId === filtroConsultor.value) : vagas;
  }

  function candidatosVisiveis() {
    if (!filtroConsultor.value) return todosCandidatos;
    const vagaIdsDoConsultor = new Set(vagasFiltradasPorConsultor().map((v) => v.id));
    return todosCandidatos.filter((c) => vagaIdsDoConsultor.has(c.vagaId));
  }

  function contagemBanco() {
    return candidatosVisiveis().filter((c) => ETAPAS_SEM_RETORNO.includes(c.etapaCandidato)).length;
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
      renderizarConteudo();
    });
  });

  async function carregar() {
    const qs = filtroVaga.value ? `?vagaId=${filtroVaga.value}` : "";
    todosCandidatos = await api.get(`/api/candidatos${qs}`);
    marcarAbaAtiva();
    renderizarConteudo();
  }

  function vagaTitulo(id) {
    const v = vagas.find((x) => x.id === id);
    return v ? v.titulo : "—";
  }

  function renderizarConteudo() {
    if (abaAtiva === "produtividade") {
      renderizarProdutividade();
    } else {
      renderizarTabela();
    }
  }

  function renderizarTabela() {
    const el = root.querySelector("#candidatos-tabela");
    const candidatos = candidatosVisiveis().filter((c) =>
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

  // ================== Aba: Produtividade ==================
  // Visão gerencial por consultor: vagas trabalhadas, candidatos por vaga (com a
  // etapa em que a vaga está), volume no período (para acompanhar ritmo semanal/
  // mensal) e taxa de assertividade (aprovados pelo cliente / candidatos já
  // entrevistados) — mede qualidade da triagem, não só volume de candidatos.
  function metricasConsultor(consultor, periodoDias) {
    const vagasDoConsultor = vagas.filter((v) => v.consultorId === consultor.id);
    const vagaIds = new Set(vagasDoConsultor.map((v) => v.id));
    const candidatosDoConsultor = todosCandidatos.filter((c) => vagaIds.has(c.vagaId));

    const entrevistados = candidatosDoConsultor.filter((c) => !!c.dataEntrevista);
    const aprovados = candidatosDoConsultor.filter((c) => c.etapaCandidato === "Aprovado pelo Cliente");
    const assertividadePct = entrevistados.length ? Math.round((aprovados.length / entrevistados.length) * 1000) / 10 : null;

    let candidatosAdicionadosPeriodo = candidatosDoConsultor.length;
    let entrevistadosPeriodo = entrevistados.length;
    if (periodoDias) {
      const corte = diasAtras(periodoDias);
      candidatosAdicionadosPeriodo = candidatosDoConsultor.filter((c) => (c.createdAt || "").slice(0, 10) >= corte).length;
      entrevistadosPeriodo = entrevistados.filter((c) => c.dataEntrevista >= corte).length;
    }

    return {
      consultor,
      vagasDoConsultor,
      totalCandidatos: candidatosDoConsultor.length,
      totalEntrevistados: entrevistados.length,
      totalAprovados: aprovados.length,
      assertividadePct,
      candidatosAdicionadosPeriodo,
      entrevistadosPeriodo,
    };
  }

  function barraAssertividade(pct) {
    if (pct === null) return '<span class="sub">sem entrevistas ainda</span>';
    return `
      <div class="bar-track" style="width:100px;display:inline-block;vertical-align:middle;">
        <div class="bar-fill ${pct >= 50 ? "bar-fill-ok" : ""}" style="width:${Math.max(4, pct)}%"></div>
      </div>
      <span style="margin-left:8px;">${pct}%</span>
    `;
  }

  function renderizarProdutividade() {
    const el = root.querySelector("#candidatos-tabela");
    const periodoSelect = document.getElementById("periodo-produtividade");
    const periodoDias = periodoSelect ? Number(periodoSelect.value) || 0 : 0;
    const consultoresRelevantes = store.consultores.filter(
      (c) => (c.perfil === "Recrutador" || c.perfil === "Supervisora") && c.ativo !== false
    );

    const consultorSelecionadoId = filtroConsultor.value;
    const consultorSelecionado = consultorSelecionadoId ? consultoresRelevantes.find((c) => c.id === consultorSelecionadoId) : null;

    const cabecalho = `
      <div class="kanban-toolbar" style="margin-bottom:14px;">
        <label class="sub" style="margin:0;">Volume no período:</label>
        <select id="periodo-produtividade">
          <option value="0" ${periodoDias === 0 ? "selected" : ""}>Total (desde o início)</option>
          <option value="7" ${periodoDias === 7 ? "selected" : ""}>Últimos 7 dias</option>
          <option value="30" ${periodoDias === 30 ? "selected" : ""}>Últimos 30 dias</option>
        </select>
      </div>
    `;

    if (!consultorSelecionado) {
      if (consultoresRelevantes.length === 0) {
        el.innerHTML = cabecalho + '<div class="empty-state">Nenhum consultor cadastrado ainda.</div>';
        return;
      }
      const linhas = consultoresRelevantes.map((c) => metricasConsultor(c, periodoDias));
      el.innerHTML = `
        ${cabecalho}
        <div class="sub" style="margin-bottom:10px;">Selecione um consultor no filtro acima para ver o detalhe vaga a vaga. A Taxa de Assertividade mede, de todos os candidatos já entrevistados por esse consultor (histórico completo), quantos foram aprovados pelo cliente.</div>
        <table>
          <thead>
            <tr>
              <th>Consultor</th>
              <th>Vagas Trabalhadas</th>
              <th>Total de Candidatos</th>
              <th>Candidatos no Período</th>
              <th>Entrevistados no Período</th>
              <th>Taxa de Assertividade</th>
            </tr>
          </thead>
          <tbody>
            ${linhas
              .map(
                (m) => `
              <tr class="linha-clicavel" data-id="${m.consultor.id}" style="cursor:pointer;">
                <td>${escapeHtml(m.consultor.nome)}</td>
                <td>${m.vagasDoConsultor.length}</td>
                <td>${m.totalCandidatos}</td>
                <td>${m.candidatosAdicionadosPeriodo}</td>
                <td>${m.entrevistadosPeriodo}</td>
                <td>${barraAssertividade(m.assertividadePct)}</td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>
      `;
      el.querySelectorAll(".linha-clicavel").forEach((tr) => {
        tr.addEventListener("click", () => {
          filtroConsultor.value = tr.dataset.id;
          renderizarProdutividade();
        });
      });
    } else {
      const m = metricasConsultor(consultorSelecionado, periodoDias);
      el.innerHTML = `
        ${cabecalho}
        <h3 class="section-title" style="margin-top:0;">${escapeHtml(consultorSelecionado.nome)}</h3>
        <div class="kpi-row">
          <div class="kpi-card"><div class="kpi-label">Vagas Trabalhadas</div><div class="kpi-value">${m.vagasDoConsultor.length}</div></div>
          <div class="kpi-card"><div class="kpi-label">Total de Candidatos</div><div class="kpi-value">${m.totalCandidatos}</div></div>
          <div class="kpi-card"><div class="kpi-label">Candidatos no Período</div><div class="kpi-value">${m.candidatosAdicionadosPeriodo}</div></div>
          <div class="kpi-card"><div class="kpi-label">Entrevistados no Período</div><div class="kpi-value">${m.entrevistadosPeriodo}</div></div>
          <div class="kpi-card kpi-destaque ${m.assertividadePct !== null && m.assertividadePct >= 50 ? "kpi-destaque-ok" : ""}">
            <div class="kpi-label">Taxa de Assertividade</div>
            <div class="kpi-value">${m.assertividadePct === null ? "—" : m.assertividadePct + "%"}</div>
            <div class="kpi-sub">${m.totalAprovados} aprovados / ${m.totalEntrevistados} entrevistados</div>
          </div>
        </div>
        <h3 class="section-title">Vagas trabalhadas</h3>
        ${
          m.vagasDoConsultor.length === 0
            ? '<div class="empty-state">Nenhuma vaga atribuída a este consultor ainda.</div>'
            : `<table>
                <thead><tr><th>Vaga</th><th>Empresa</th><th>Etapa da Vaga</th><th>Candidatos Entrevistados</th><th>Total de Candidatos</th></tr></thead>
                <tbody>
                  ${m.vagasDoConsultor
                    .map((v) => {
                      const candidatosDaVaga = todosCandidatos.filter((c) => c.vagaId === v.id);
                      const entrevistadosDaVaga = candidatosDaVaga.filter((c) => !!c.dataEntrevista).length;
                      return `
                    <tr>
                      <td>${escapeHtml(v.titulo)}</td>
                      <td>${escapeHtml(nomeEmpresa(v.empresaId))}</td>
                      <td>${escapeHtml(v.etapaAtual)}</td>
                      <td>${entrevistadosDaVaga}</td>
                      <td>${candidatosDaVaga.length}</td>
                    </tr>`;
                    })
                    .join("")}
                </tbody>
              </table>`
        }
      `;
    }

    const periodoSelectNovo = document.getElementById("periodo-produtividade");
    if (periodoSelectNovo) periodoSelectNovo.addEventListener("change", renderizarProdutividade);
  }

  filtroVaga.addEventListener("change", carregar);
  filtroConsultor.addEventListener("change", () => {
    marcarAbaAtiva();
    renderizarConteudo();
  });
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
