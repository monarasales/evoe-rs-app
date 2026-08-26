import { api } from "../api.js";
import { store, showToast, nomeConsultor, nomeEmpresa } from "../state.js";
import { abrirModal, fecharModal } from "../modal.js";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

// Banco de Talentos: candidatos que não seguem para essa vaga específica (sem
// interesse, sem retorno, reprovados na entrevista ou sem aderência ao perfil) ficam
// numa aba separada dos candidatos engajados (convocados, entrevistados etc.), mas
// continuam cadastrados para reaproveitar em vagas futuras. Espelha ETAPAS_SEM_RETORNO
// em server/utils/constants.js.
const ETAPAS_SEM_RETORNO = ["Sem Interesse", "Não Respondeu", "Reprovado na Entrevista", "Sem Aderência ao Perfil"];

const ABAS = [
  { id: "ativos", label: "Candidatos" },
  { id: "banco", label: "Banco de Talentos" },
  { id: "produtividade", label: "Produtividade" },
];

function diasAtras(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function formatarTamanho(bytes) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatarDataCurta(iso) {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

// Compara ignorando maiúsculas/minúsculas e acentos, para a busca por nome e a
// ordenação alfabética não dependerem de o texto estar digitado "igualzinho".
function normalizar(str) {
  return (str || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function ordenarPorNome(lista) {
  return lista.slice().sort((a, b) => normalizar(a.nome).localeCompare(normalizar(b.nome), "pt-BR"));
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
      <input type="text" id="busca-candidato" placeholder="🔎 Buscar candidato por nome..." style="min-width:220px;" />
      <select id="filtro-vaga">
        <option value="">Todas as vagas</option>
      </select>
      <select id="ordenar-vaga" title="Ordem das vagas na lista acima">
        <option value="cadastro">Vagas: cadastro mais recente</option>
        <option value="alfabetica">Vagas: ordem alfabética</option>
      </select>
      <select id="filtro-consultor-cand">
        <option value="">Todos os consultores</option>
      </select>
      <label class="checkbox-row" style="margin:0;">
        <input type="checkbox" id="filtro-lista-negra" />
        <span>🚫 Só Lista Negra</span>
      </label>
    </div>
    <div class="sub" id="info-vaga-selecionada" style="margin:-8px 0 4px;"></div>
    <div class="tabs" id="candidatos-tabs">
      ${ABAS.map((a) => `<button type="button" class="tab-btn" data-aba="${a.id}">${a.label}</button>`).join("")}
    </div>
    <div id="candidatos-tabela"></div>
  `;

  const vagas = await api.get("/api/vagas");
  const filtroVaga = root.querySelector("#filtro-vaga");
  const ordenarVaga = root.querySelector("#ordenar-vaga");
  const filtroConsultor = root.querySelector("#filtro-consultor-cand");
  const filtroListaNegra = root.querySelector("#filtro-lista-negra");
  const buscaInput = root.querySelector("#busca-candidato");
  const infoVagaEl = root.querySelector("#info-vaga-selecionada");
  const tabsEl = root.querySelector("#candidatos-tabs");

  // Quantidade de candidatos por vaga/consultor, mostrada direto nas opções dos
  // filtros — dá pro consultor enxergar seu próprio volume sem precisar abrir a
  // aba Produtividade. Sempre calculada sobre TODOS os candidatos cadastrados,
  // independente do filtro em uso no momento.
  function qtdPorVaga(vagaId) {
    return todosCandidatos.filter((c) => c.vagaId === vagaId).length;
  }
  function qtdPorConsultor(consultorId) {
    const vagaIds = new Set(vagas.filter((v) => v.consultorId === consultorId).map((v) => v.id));
    return todosCandidatos.filter((c) => vagaIds.has(c.vagaId)).length;
  }

  function vagasOrdenadas() {
    if (ordenarVaga.value === "alfabetica") {
      return vagas.slice().sort((a, b) => normalizar(a.titulo).localeCompare(normalizar(b.titulo), "pt-BR"));
    }
    // "cadastro": mais recém-cadastradas no sistema primeiro.
    return vagas.slice().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  }

  let vagaIdInicial = params.vagaId || "";
  function montarOpcoesVaga() {
    const selecionada = filtroVaga.value || vagaIdInicial;
    vagaIdInicial = ""; // só usa a vaga vinda da URL na primeira montagem das opções
    filtroVaga.innerHTML =
      '<option value="">Todas as vagas</option>' +
      vagasOrdenadas()
        .map((v) => `<option value="${v.id}" ${selecionada === v.id ? "selected" : ""}>${escapeHtml(v.titulo)} (${qtdPorVaga(v.id)})</option>`)
        .join("");
  }

  function montarOpcoesConsultor() {
    const selecionado = filtroConsultor.value;
    filtroConsultor.innerHTML =
      '<option value="">Todos os consultores</option>' +
      store.consultores
        .map((c) => `<option value="${c.id}" ${selecionado === c.id ? "selected" : ""}>${escapeHtml(c.nome)} (${qtdPorConsultor(c.id)})</option>`)
        .join("");
  }

  function atualizarInfoVagaSelecionada() {
    if (!filtroVaga.value) {
      infoVagaEl.textContent = "";
      return;
    }
    const v = vagas.find((x) => x.id === filtroVaga.value);
    infoVagaEl.textContent = v ? `Vaga "${v.titulo}" cadastrada no sistema em ${formatarDataCurta(v.createdAt)}.` : "";
  }

  function vagasFiltradasPorConsultor() {
    return filtroConsultor.value ? vagas.filter((v) => v.consultorId === filtroConsultor.value) : vagas;
  }

  function candidatosVisiveis() {
    let lista = todosCandidatos;
    if (filtroVaga.value) lista = lista.filter((c) => c.vagaId === filtroVaga.value);
    if (filtroConsultor.value) {
      const vagaIdsDoConsultor = new Set(vagasFiltradasPorConsultor().map((v) => v.id));
      lista = lista.filter((c) => vagaIdsDoConsultor.has(c.vagaId));
    }
    const busca = normalizar(buscaInput.value.trim());
    if (busca) lista = lista.filter((c) => normalizar(c.nome).includes(busca));
    if (filtroListaNegra.checked) lista = lista.filter((c) => c.listaNegra);
    return lista;
  }

  function contagemBanco() {
    return candidatosVisiveis().filter((c) => ETAPAS_SEM_RETORNO.includes(c.etapaCandidato)).length;
  }

  function marcarAbaAtiva() {
    tabsEl.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.classList.toggle("ativo", btn.dataset.aba === abaAtiva);
      if (btn.dataset.aba === "banco") {
        const qtd = contagemBanco();
        btn.textContent = qtd > 0 ? `Banco de Talentos (${qtd})` : "Banco de Talentos";
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
    // Busca a lista completa (sem filtro no servidor) e filtra tudo no navegador —
    // dataset pequeno, evita ida e volta ao servidor a cada troca de filtro e
    // deixa as contagens por vaga/consultor sempre corretas, mesmo com um filtro
    // diferente selecionado.
    todosCandidatos = await api.get("/api/candidatos");
    montarOpcoesVaga();
    montarOpcoesConsultor();
    atualizarInfoVagaSelecionada();
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

  function vagaCadastroTitle(id) {
    const v = vagas.find((x) => x.id === id);
    return v ? `Vaga cadastrada no sistema em ${formatarDataCurta(v.createdAt)}` : "";
  }

  // Aviso visual — não bloqueia nada, só avisa o consultor pra ele decidir com
  // informação antes de reaproveitar esse candidato numa vaga nova.
  function tagListaNegra(c) {
    if (!c.listaNegra) return "";
    const titulo = `Lista Negra — ${c.motivoListaNegra}${c.obsListaNegra ? `: ${c.obsListaNegra}` : ""}`;
    return ` <span class="tag tag-atrasada" title="${escapeHtml(titulo)}">🚫 Lista Negra</span>`;
  }

  function renderizarTabela() {
    const el = root.querySelector("#candidatos-tabela");
    const candidatos = ordenarPorNome(
      candidatosVisiveis().filter((c) =>
        abaAtiva === "banco" ? ETAPAS_SEM_RETORNO.includes(c.etapaCandidato) : !ETAPAS_SEM_RETORNO.includes(c.etapaCandidato)
      )
    );

    if (candidatos.length === 0) {
      el.innerHTML =
        abaAtiva === "banco"
          ? '<div class="empty-state">Nenhum candidato no Banco de Talentos por aqui.</div>'
          : '<div class="empty-state">Nenhum candidato encontrado.</div>';
      return;
    }

    const contador = `<div class="sub" style="margin-bottom:8px;">${candidatos.length} candidato(s) nesta lista — em ordem alfabética.</div>`;

    if (abaAtiva === "banco") {
      el.innerHTML = `
        ${contador}
        <div class="sub" style="margin-bottom:10px;">Candidatos que não seguem para a vaga em que foram cadastrados — sem interesse, sem retorno, reprovados na entrevista ou sem aderência ao perfil — ficam aqui para futuro reaproveitamento, sem poluir o funil ativo.</div>
        <table>
          <thead>
            <tr><th>Nome</th><th>Vaga</th><th>Situação</th><th>Telefone</th><th></th></tr>
          </thead>
          <tbody>
            ${candidatos
              .map(
                (c) => `
              <tr data-id="${c.id}">
                <td>${escapeHtml(c.nome)}${c.linkedin ? ` <a href="${escapeHtml(c.linkedin)}" target="_blank" rel="noopener" title="Abrir perfil no LinkedIn" style="text-decoration:none; color:var(--link); cursor:pointer; margin-left:6px;">🔗</a>` : ""}${c.curriculoArquivo ? ' <span title="Tem currículo anexado">📎</span>' : ""}${c.pareceres && c.pareceres.length > 0 ? ` <span title="Tem ${c.pareceres.length} parecer(es) anexado(s)">📋</span>` : ""}${tagListaNegra(c)}</td>
                <td title="${vagaCadastroTitle(c.vagaId)}">${escapeHtml(vagaTitulo(c.vagaId))}</td>
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
        ${contador}
        <table>
          <thead>
            <tr>
              <th>Nome</th><th>Vaga</th><th>Etapa</th><th>Jusbrasil</th><th>Parecer</th>
              <th title="Data da entrevista com a RH/Evoé">Entr. RH</th>
              <th title="Data da entrevista com a empresa cliente">Entr. Empresa</th>
              <th title="Data do retorno/decisão da empresa">Retorno</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${candidatos
              .map(
                (c) => `
              <tr data-id="${c.id}">
                <td>${escapeHtml(c.nome)}${c.linkedin ? ` <a href="${escapeHtml(c.linkedin)}" target="_blank" rel="noopener" title="Abrir perfil no LinkedIn" style="text-decoration:none; color:var(--link); cursor:pointer; margin-left:6px;">🔗</a>` : ""}${c.curriculoArquivo ? ' <span title="Tem currículo anexado">📎</span>' : ""}${c.pareceres && c.pareceres.length > 0 ? ` <span title="Tem ${c.pareceres.length} parecer(es) anexado(s)">📋</span>` : ""}${tagListaNegra(c)}</td>
                <td title="${vagaCadastroTitle(c.vagaId)}">${escapeHtml(vagaTitulo(c.vagaId))}</td>
                <td>${escapeHtml(c.etapaCandidato)}</td>
                <td>${c.jusbrasilOk ? "✅" : "—"}</td>
                <td>${(c.parecerComportamental || "").trim() ? "✅" : "—"}${c.pareceres && c.pareceres.length > 0 ? ` (${c.pareceres.length} arquivo${c.pareceres.length > 1 ? "s" : ""})` : ""}</td>
                <td>${formatarDataCurta(c.dataEntrevista)}</td>
                <td>${formatarDataCurta(c.dataEntrevistaEmpresa)}</td>
                <td>${formatarDataCurta(c.dataRetornoCliente)}</td>
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

  filtroVaga.addEventListener("change", () => {
    atualizarInfoVagaSelecionada();
    marcarAbaAtiva();
    renderizarConteudo();
  });
  ordenarVaga.addEventListener("change", montarOpcoesVaga);
  filtroConsultor.addEventListener("change", () => {
    marcarAbaAtiva();
    renderizarConteudo();
  });
  filtroListaNegra.addEventListener("change", () => {
    marcarAbaAtiva();
    renderizarConteudo();
  });
  let buscaDebounce;
  buscaInput.addEventListener("input", () => {
    clearTimeout(buscaDebounce);
    buscaDebounce = setTimeout(() => {
      marcarAbaAtiva();
      renderizarConteudo();
    }, 150);
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
        <div id="c-aviso-lista-negra" class="form-erro hidden" style="background:var(--warning-bg); color:var(--warning);"></div>
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
          <label>🔗 LinkedIn</label>
          <input type="url" id="c-linkedin" placeholder="https://linkedin.com/in/seu-perfil" value="${editando ? escapeHtml(candidato.linkedin || "") : ""}" />
          <div class="sub" style="margin-top:4px;">Cole a URL do perfil LinkedIn (opcional). Ex: https://linkedin.com/in/joao-silva</div>
          ${editando && candidato.linkedin ? `<a href="${escapeHtml(candidato.linkedin)}" target="_blank" rel="noopener" class="btn btn-outline btn-sm" style="margin-top:8px;">👤 Abrir perfil</a>` : ""}
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
          <div class="sub" style="margin-top:4px;">"Sem Interesse" (o candidato desistiu), "Não Respondeu" (sem retorno dele), "Reprovado na Entrevista" ou "Sem Aderência ao Perfil" (entrevistamos, mas não bate com a vaga) mandam o candidato para o Banco de Talentos sem excluí-lo.</div>
        </div>
        ${
          editando
            ? `
        <div class="sub" style="margin-top:-2px; margin-bottom:2px;">Datas do sub-funil — cada uma marca um momento diferente:</div>
        <div class="form-cols">
          <div class="form-row">
            <label>Entrevista com a RH (Evoé)</label>
            <input type="date" id="c-data-entrevista" value="${candidato.dataEntrevista || ""}" />
          </div>
          <div class="form-row">
            <label>Entrevista com a empresa (cliente)</label>
            <input type="date" id="c-data-entrevista-empresa" value="${candidato.dataEntrevistaEmpresa || ""}" />
          </div>
        </div>
        <div class="form-row">
          <label>Retorno da empresa (aprovado/reprovado pelo cliente)</label>
          <input type="date" id="c-data-retorno" value="${candidato.dataRetornoCliente || ""}" />
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
          <label>Parecer comportamental (texto)</label>
          <textarea id="c-parecer">${escapeHtml(candidato.parecerComportamental || "")}</textarea>
        </div>
        <div class="form-row">
          <label>Pareceres (arquivos - PDF/DOC/DOCX)</label>
          <div id="pareceres-lista" style="margin-bottom:8px;"></div>
          <input type="file" id="c-parecer-input" accept=".pdf,.doc,.docx" style="margin-top:8px;" />
          <div class="sub" style="margin-top:4px;">Formatos aceitos: PDF, DOC ou DOCX (até 10MB). Você pode anexar quantos pareceres quiser.</div>
        </div>
        <div class="form-row checkbox-row">
          <input type="checkbox" id="c-lista-negra" ${candidato.listaNegra ? "checked" : ""} />
          <label style="margin:0;">🚫 Marcar na Lista Negra (candidato não recomendado para futuras vagas)</label>
        </div>
        <div id="c-lista-negra-detalhe" style="${candidato.listaNegra ? "" : "display:none;"}">
          <div class="form-row">
            <label>Motivo</label>
            <select id="c-motivo-lista-negra">
              ${store.motivosListaNegra.map((m) => `<option ${candidato.motivoListaNegra === m ? "selected" : ""}>${m}</option>`).join("")}
            </select>
          </div>
          <div class="form-row">
            <label>Detalhes (opcional)</label>
            <textarea id="c-obs-lista-negra" placeholder="ex: não compareceu à entrevista na empresa em 12/06, sem avisar">${escapeHtml(candidato.obsListaNegra || "")}</textarea>
          </div>
          ${candidato.dataListaNegra ? `<div class="sub" style="margin-top:-6px;">Marcado em ${formatarDataCurta(candidato.dataListaNegra)}.</div>` : ""}
        </div>
        <div class="form-row">
          <label>Currículo</label>
          <div id="curriculo-status"></div>
          <input type="file" id="c-curriculo-input" accept=".pdf,.doc,.docx" style="margin-top:8px;" />
          <div class="sub" style="margin-top:4px;">Formatos aceitos: PDF, DOC ou DOCX (até 10MB). Selecionar um novo arquivo substitui o anterior.</div>
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

    // Ao cadastrar um candidato novo, avisa (sem bloquear) se já existe alguém com
    // esse nome marcado na Lista Negra — evita reaproveitar por engano um candidato
    // problemático de outra vaga, já que cada vaga tem seu próprio registro.
    if (!editando) {
      const nomeInput = document.getElementById("c-nome");
      const avisoEl = document.getElementById("c-aviso-lista-negra");
      const verificarListaNegra = () => {
        const nomeDigitado = normalizar(nomeInput.value.trim());
        if (!nomeDigitado) {
          avisoEl.classList.add("hidden");
          return;
        }
        const encontrado = todosCandidatos.find((c) => c.listaNegra && normalizar(c.nome) === nomeDigitado);
        if (encontrado) {
          avisoEl.textContent = `⚠️ Já existe um candidato chamado "${encontrado.nome}" na Lista Negra (motivo: ${encontrado.motivoListaNegra}). Confira antes de prosseguir.`;
          avisoEl.classList.remove("hidden");
        } else {
          avisoEl.classList.add("hidden");
        }
      };
      nomeInput.addEventListener("input", verificarListaNegra);
      nomeInput.addEventListener("blur", verificarListaNegra);
    }

    if (editando) {
      const chkListaNegra = document.getElementById("c-lista-negra");
      const detalheListaNegra = document.getElementById("c-lista-negra-detalhe");
      chkListaNegra.addEventListener("change", () => {
        detalheListaNegra.style.display = chkListaNegra.checked ? "" : "none";
      });

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

      renderizarStatusCurriculo();
      renderizarListaPareceres();

      const inputCurriculo = document.getElementById("c-curriculo-input");
      inputCurriculo.addEventListener("change", async () => {
        const arquivo = inputCurriculo.files[0];
        if (!arquivo) return;
        try {
          const atualizado = await api.upload(`/api/candidatos/${candidato.id}/curriculo`, arquivo);
          candidato.curriculoArquivo = atualizado.curriculoArquivo;
          candidato.curriculoNomeOriginal = atualizado.curriculoNomeOriginal;
          candidato.curriculoTamanho = atualizado.curriculoTamanho;
          renderizarStatusCurriculo();
          showToast("Currículo anexado.", "sucesso");
          const idxCandidato = todosCandidatos.findIndex((c) => c.id === candidato.id);
          if (idxCandidato >= 0) todosCandidatos[idxCandidato] = { ...todosCandidatos[idxCandidato], ...atualizado };
        } catch (err) {
          showToast(err.message, "erro");
        } finally {
          inputCurriculo.value = "";
        }
      });

      const inputParecer = document.getElementById("c-parecer-input");
      if (inputParecer) {
        inputParecer.addEventListener("change", async () => {
          const arquivo = inputParecer.files[0];
          if (!arquivo) return;
          try {
            const atualizado = await api.upload(`/api/candidatos/${candidato.id}/pareceres`, arquivo);
            candidato.pareceres = atualizado.pareceres || [];
            renderizarListaPareceres();
            showToast("Parecer anexado.", "sucesso");
            const idxCandidato = todosCandidatos.findIndex((c) => c.id === candidato.id);
            if (idxCandidato >= 0) todosCandidatos[idxCandidato] = { ...todosCandidatos[idxCandidato], ...atualizado };
          } catch (err) {
            showToast(err.message, "erro");
          } finally {
            inputParecer.value = "";
          }
        });
      }
    }

    function renderizarStatusCurriculo() {
      const statusEl = document.getElementById("curriculo-status");
      if (!statusEl) return;
      if (!candidato.curriculoArquivo) {
        statusEl.innerHTML = '<span class="sub">Nenhum currículo anexado ainda.</span>';
        return;
      }
      statusEl.innerHTML = `
        <a href="/api/candidatos/${candidato.id}/curriculo" target="_blank" class="btn btn-outline btn-sm">📎 Baixar ${escapeHtml(candidato.curriculoNomeOriginal || "currículo")}${candidato.curriculoTamanho ? ` (${formatarTamanho(candidato.curriculoTamanho)})` : ""}</a>
        <button type="button" id="btn-remover-curriculo" class="btn btn-outline btn-sm" style="margin-left:8px;">Remover</button>
      `;
      document.getElementById("btn-remover-curriculo").addEventListener("click", async () => {
        if (!confirm("Remover o currículo anexado a este candidato?")) return;
        try {
          const atualizado = await api.del(`/api/candidatos/${candidato.id}/curriculo`);
          candidato.curriculoArquivo = null;
          candidato.curriculoNomeOriginal = null;
          candidato.curriculoTamanho = null;
          renderizarStatusCurriculo();
          showToast("Currículo removido.", "sucesso");
          const idxCandidato = todosCandidatos.findIndex((c) => c.id === candidato.id);
          if (idxCandidato >= 0) todosCandidatos[idxCandidato] = { ...todosCandidatos[idxCandidato], ...atualizado };
        } catch (err) {
          showToast(err.message, "erro");
        }
      });
    }

    function renderizarListaPareceres() {
      const listaEl = document.getElementById("pareceres-lista");
      if (!listaEl) return;
      const pareceres = candidato.pareceres || [];
      if (pareceres.length === 0) {
        listaEl.innerHTML = '<span class="sub">Nenhum parecer anexado ainda.</span>';
        return;
      }
      listaEl.innerHTML = `
        <div class="sub" style="margin-bottom:8px;">Pareceres anexados:</div>
        <div style="display:flex; flex-direction:column; gap:6px;">
          ${pareceres
            .map(
              (p, idx) => `
            <div style="display:flex; align-items:center; justify-content:space-between; padding:6px 8px; background:var(--bg-alt); border-radius:4px;">
              <div style="flex:1;">
                <a href="/api/candidatos/${candidato.id}/pareceres/${idx}" target="_blank" style="color:var(--text); text-decoration:none; font-weight:500;">📎 ${escapeHtml(p.nomeOriginal || "parecer")}${p.tamanho ? ` (${formatarTamanho(p.tamanho)})` : ""}</a>
                <div class="sub" style="margin-top:2px;">Enviado em ${new Date(p.uploadedAt).toLocaleDateString("pt-BR")}</div>
              </div>
              <button type="button" class="btn-remover-parecer" data-idx="${idx}" class="btn btn-outline btn-sm" style="margin-left:8px; padding:4px 8px; font-size:12px;">Remover</button>
            </div>
          `
            )
            .join("")}
        </div>
      `;
      listaEl.querySelectorAll(".btn-remover-parecer").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          const idx = parseInt(e.target.dataset.idx, 10);
          if (!confirm("Remover este parecer?")) return;
          try {
            const atualizado = await api.del(`/api/candidatos/${candidato.id}/pareceres/${idx}`);
            candidato.pareceres = atualizado.pareceres || [];
            renderizarListaPareceres();
            showToast("Parecer removido.", "sucesso");
            const idxCandidato = todosCandidatos.findIndex((c) => c.id === candidato.id);
            if (idxCandidato >= 0) todosCandidatos[idxCandidato] = { ...todosCandidatos[idxCandidato], ...atualizado };
          } catch (err) {
            showToast(err.message, "erro");
          }
        });
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
        linkedin: document.getElementById("c-linkedin").value.trim(),
        etapaCandidato: document.getElementById("c-etapa").value,
      };
      try {
        if (editando) {
          const listaNegra = document.getElementById("c-lista-negra").checked;
          const extra = {
            dataEntrevista: document.getElementById("c-data-entrevista").value || null,
            dataEntrevistaEmpresa: document.getElementById("c-data-entrevista-empresa").value || null,
            dataRetornoCliente: document.getElementById("c-data-retorno").value || null,
            jusbrasilOk: document.getElementById("c-jusbrasil").checked,
            obsReferencia: document.getElementById("c-obs-referencia").value,
            parecerComportamental: document.getElementById("c-parecer").value,
            listaNegra,
            motivoListaNegra: listaNegra ? document.getElementById("c-motivo-lista-negra").value : "",
            obsListaNegra: document.getElementById("c-obs-lista-negra").value,
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
