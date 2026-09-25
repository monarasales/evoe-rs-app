import { api } from "../api.js";
import { store, podeGerenciarVagas, nomeEmpresa, nomeConsultor, formatarData } from "../state.js";
import { abrirModal, fecharModal } from "../modal.js";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

const ETAPAS_ENCERRADAS_DASH = ["11. Aprovado", "12. Cancelada/Encerrada"];
const ETAPA_BACKLOG_DASH = "1. Backlog";

// Reproduz a mesma classificação usada pelo backend (server/routes/indicadores.js) para
// poder listar, ao clicar em cada indicador, exatamente as vagas que compõem aquele número.
function categorizarVagas(vagas) {
  const abertas = vagas.filter((v) => !ETAPAS_ENCERRADAS_DASH.includes(v.etapaAtual));
  const standby = abertas.filter((v) => v.emStandBy);
  const ativas = abertas.filter((v) => !v.emStandBy);
  const backlog = ativas.filter((v) => v.etapaAtual === ETAPA_BACKLOG_DASH);
  const andamento = ativas.filter((v) => v.etapaAtual !== ETAPA_BACKLOG_DASH);
  const atraso = ativas.filter((v) => v.statusPrazo === "Atrasada");
  const fechadas = vagas.filter((v) => v.etapaAtual === "11. Aprovado");
  return { abertas, standby, backlog, andamento, atraso, fechadas };
}

// Pequena legenda explicativa de cada indicador — para não confundir "Aberto" com
// "Andamento", nem o Tempo Médio em Aberto com o SLA de Fechamento (que só entra em
// jogo depois que a vaga já foi fechada).
const LEGENDAS = {
  aberto: "Todas as vagas que ainda não foram fechadas (Aprovado) nem canceladas/encerradas. É a soma de Backlog + Andamento + Stand By + Atrasadas — tudo que ainda está \"vivo\" no funil.",
  andamento: "Vagas abertas que já saíram do Backlog — alguém já está atuando ativamente nelas — e que não estão em Stand By.",
  backlog: "Vagas abertas que ainda estão na 1ª etapa do funil: já foram cadastradas, mas ainda não começaram a ser trabalhadas.",
  standby: "Vagas pausadas por motivo do cliente ou do candidato (ex: aguardando decisão interna). O prazo e o SLA ficam congelados enquanto a vaga estiver aqui — não contam como Backlog nem Andamento.",
  atraso: "Vagas abertas (fora do Stand By) cujo prazo combinado com o cliente já passou da data.",
  tempoAberto: "Média de dias que as vagas abertas (Backlog + Andamento + Stand By + Atrasadas) já estão em aberto até hoje. Não confunda com o SLA de Fechamento, mais abaixo: aquele mede só as vagas que já foram fechadas.",
  fechadas: "Vagas que chegaram à etapa \"11. Aprovado\" — processo concluído com sucesso. O SLA de Fechamento (mais abaixo na página) mede quanto tempo cada uma levou, do início ao fim.",
};

function tagStatusDash(status) {
  const map = {
    "No Prazo": "tag-nprazo",
    Atrasada: "tag-atrasada",
    "Concluída no Prazo": "tag-concluida",
    "Concluída com Atraso": "tag-atraso",
    Encerrada: "tag-encerrada",
    "Em Stand By": "tag-standby",
  };
  return `<span class="tag ${map[status] || ""}">${status || "—"}</span>`;
}

function abrirListaVagas(titulo, legenda, lista) {
  abrirModal(`
    <h2>${escapeHtml(titulo)}</h2>
    <p class="sub">${legenda}</p>
    ${
      lista.length === 0
        ? '<div class="empty-state">Nenhuma vaga nessa situação no momento.</div>'
        : `<table>
            <thead><tr><th>Vaga</th><th>Empresa</th><th>Consultor</th><th>Etapa</th><th>Prazo</th><th>Status</th></tr></thead>
            <tbody>
              ${lista
                .map(
                  (v) => `
                <tr>
                  <td>${escapeHtml(v.titulo)}</td>
                  <td>${escapeHtml(nomeEmpresa(v.empresaId))}</td>
                  <td>${escapeHtml(nomeConsultor(v.consultorId))}</td>
                  <td>${escapeHtml(v.etapaAtual)}</td>
                  <td>${formatarData(v.prazoFechamento)}</td>
                  <td>${tagStatusDash(v.statusPrazo)}</td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table>`
    }
    <div class="modal-close-row">
      <button type="button" id="btn-fechar-lista-vagas" class="btn btn-outline">Fechar</button>
    </div>
  `);
  document.getElementById("btn-fechar-lista-vagas").addEventListener("click", fecharModal);
}

function barras(obj) {
  const entradas = Object.entries(obj).filter(([, v]) => v > 0);
  if (entradas.length === 0) return '<div class="empty-state">Sem dados ainda.</div>';
  const max = Math.max(...entradas.map(([, v]) => v));
  return entradas
    .map(
      ([label, valor]) => `
      <div class="bar-row">
        <div class="bar-label" title="${label}">${label}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.max(4, (valor / max) * 100)}%"></div></div>
        <div class="bar-value">${valor}</div>
      </div>`
    )
    .join("");
}

// Igual a "barras", mas recebe uma lista [{label, valor}] já ordenada (em vez de um
// objeto), para poder destacar as etapas mais lentas do funil (gargalos) com uma cor
// de alerta quando o tempo médio passa de um limiar.
function barrasEtapas(lista) {
  const comDados = lista.filter((e) => e.qtdPassagens > 0);
  if (comDados.length === 0) return '<div class="empty-state">Ainda não há passagens de etapa encerradas para calcular o tempo médio.</div>';
  const max = Math.max(...comDados.map((e) => e.tempoMedioDias));
  return comDados
    .map((e) => {
      const alerta = max > 0 && e.tempoMedioDias >= max * 0.75 && e.tempoMedioDias > 0;
      return `
      <div class="bar-row">
        <div class="bar-label" title="${e.etapa}">${e.etapa}</div>
        <div class="bar-track"><div class="bar-fill ${alerta ? "bar-fill-alerta" : ""}" style="width:${Math.max(4, (e.tempoMedioDias / max) * 100)}%"></div></div>
        <div class="bar-value">${e.tempoMedioDias}d</div>
      </div>`;
    })
    .join("");
}

function tabelaSla(slaPorConsultor, slaConfig) {
  if (!slaPorConsultor || slaPorConsultor.length === 0) {
    return '<div class="empty-state">Sem consultores para exibir.</div>';
  }
  return `
    <table>
      <thead>
        <tr>
          <th>Consultor</th>
          <th>Fechadas</th>
          <th>SLA Ideal (≤${slaConfig.diasIdeal}d)</th>
          <th>Dentro do SLA (≤${slaConfig.diasLimite}d)</th>
          <th>Fora do SLA</th>
          <th>Pontuação SLA</th>
          <th>Tempo Médio Fechamento</th>
          <th>Meta Mensal (${slaConfig.metaMensal}/mês)</th>
        </tr>
      </thead>
      <tbody>
        ${slaPorConsultor
          .map(
            (s) => `
          <tr>
            <td>${s.nome}</td>
            <td>${s.totalFechadas}</td>
            <td>${s.fechadasSlaIdeal}</td>
            <td>${s.fechadasSlaDentro}</td>
            <td>${s.fechadasSlaFora}</td>
            <td>${s.pontuacaoSla}</td>
            <td>${s.tempoMedioFechamentoDias}d</td>
            <td>
              <div class="meta-cell">
                <div class="bar-track" style="width:110px;display:inline-block;vertical-align:middle;">
                  <div class="bar-fill ${s.metaMensal.percentual >= 100 ? "bar-fill-ok" : ""}" style="width:${Math.max(4, s.metaMensal.percentual)}%"></div>
                </div>
                <span style="margin-left:8px;">${s.metaMensal.fechadasNoMes}/${s.metaMensal.meta}</span>
              </div>
            </td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function tabelaPareceres(pareceresPorVaga) {
  if (!pareceresPorVaga || pareceresPorVaga.length === 0) {
    return '<div class="empty-state">Nenhuma vaga com candidatos ainda.</div>';
  }
  return `
    <table>
      <thead><tr><th>Vaga</th><th>Pareceres enviados</th><th>Candidatos</th><th>Cobertura</th></tr></thead>
      <tbody>
        ${pareceresPorVaga
          .map((v) => {
            const pct = v.qtdCandidatos ? Math.round((v.qtdPareceresEnviados / v.qtdCandidatos) * 100) : 0;
            return `
          <tr>
            <td>${v.titulo}</td>
            <td>${v.qtdPareceresEnviados}</td>
            <td>${v.qtdCandidatos}</td>
            <td>
              <div class="bar-track" style="width:110px;display:inline-block;vertical-align:middle;">
                <div class="bar-fill" style="width:${Math.max(4, pct)}%"></div>
              </div>
              <span style="margin-left:8px;">${pct}%</span>
            </td>
          </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

const MEDALHAS = { 1: "🥇", 2: "🥈", 3: "🥉" };

function tabelaRanking(rankingConsultores) {
  if (!rankingConsultores || rankingConsultores.length === 0) {
    return '<div class="empty-state">Sem consultores para comparar.</div>';
  }
  if (rankingConsultores.length === 1) {
    return '<div class="empty-state">Com apenas um consultor no filtro atual, não há ranking a comparar — remova o filtro para ver a equipe toda.</div>';
  }
  return `
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Consultor</th>
          <th>Pontuação SLA</th>
          <th>Fechadas no Mês</th>
          <th>Meta Mensal</th>
          <th>Taxa de Conversão</th>
        </tr>
      </thead>
      <tbody>
        ${rankingConsultores
          .map(
            (r) => `
          <tr>
            <td>${MEDALHAS[r.posicao] || `#${r.posicao}`}</td>
            <td>${r.nome}</td>
            <td>${r.pontuacaoSla}</td>
            <td>${r.metaMensal.fechadasNoMes}</td>
            <td>
              <div class="bar-track" style="width:90px;display:inline-block;vertical-align:middle;">
                <div class="bar-fill ${r.metaMensal.percentual >= 100 ? "bar-fill-ok" : ""}" style="width:${Math.max(4, r.metaMensal.percentual)}%"></div>
              </div>
              <span style="margin-left:8px;">${r.metaMensal.percentual}%</span>
            </td>
            <td>${r.conversao.taxaConversaoPct}% <span style="color:var(--text-muted);">(${r.conversao.candidatosAprovados}/${r.conversao.candidatosInscritos})</span></td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function tabelaConversao(slaPorConsultor) {
  if (!slaPorConsultor || slaPorConsultor.length === 0) {
    return '<div class="empty-state">Sem consultores para exibir.</div>';
  }
  return `
    <table>
      <thead><tr><th>Consultor</th><th>Candidatos Inscritos</th><th>Aprovados pelo Cliente</th><th>Taxa de Conversão</th></tr></thead>
      <tbody>
        ${slaPorConsultor
          .map(
            (s) => `
          <tr>
            <td>${s.nome}</td>
            <td>${s.conversao.candidatosInscritos}</td>
            <td>${s.conversao.candidatosAprovados}</td>
            <td>
              <div class="bar-track" style="width:110px;display:inline-block;vertical-align:middle;">
                <div class="bar-fill" style="width:${Math.max(4, s.conversao.taxaConversaoPct)}%"></div>
              </div>
              <span style="margin-left:8px;">${s.conversao.taxaConversaoPct}%</span>
            </td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
}

export async function renderDashboard(root) {
  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Dashboard</h2>
        <div class="sub">${podeGerenciarVagas() ? "Visão geral da operação." : "Seus indicadores como consultor(a)."}</div>
      </div>
      ${podeGerenciarVagas() ? `
        <select id="filtro-consultor-dash">
          <option value="">Todos os consultores</option>
          ${store.consultores.filter((c) => c.perfil === "Recrutador").map((c) => `<option value="${c.id}">${c.nome}</option>`).join("")}
        </select>` : ""}
    </div>

    <h3 class="section-title">Saúde do Funil agora</h3>
    <div class="sub" style="margin:-8px 0 12px;">Onde as vagas estão neste momento — o que precisa da sua atenção hoje.</div>
    <div class="resumo-row" id="resumo-row"></div>

    <h3 class="section-title">Performance de Fechamento</h3>
    <div class="sub" style="margin:-8px 0 12px;">Resultados entregues: o que já foi fechado e em quanto tempo.</div>
    <div class="kpi-row" id="kpi-row-fechamento"></div>

    <h3 class="section-title">Visão Geral da Carteira</h3>
    <div class="sub" style="margin:-8px 0 12px;">Volume total sob gestão, desde o início.</div>
    <div class="kpi-row" id="kpi-row-carteira"></div>

    <div class="charts-row">
      <div class="chart-card"><h3>Vagas por Consultor</h3><div id="chart-consultor"></div></div>
      <div class="chart-card"><h3>Vagas Fechadas por Consultor</h3><div id="chart-fechadas-consultor"></div></div>
      <div class="chart-card"><h3>Vagas por Status de Prazo</h3><div id="chart-status"></div></div>
      <div class="chart-card"><h3>Vagas por Etapa do Funil</h3><div id="chart-etapa"></div></div>
      <div class="chart-card"><h3>Candidatos por Etapa</h3><div id="chart-candidatos"></div></div>
      <div class="chart-card"><h3>Tempo Médio por Etapa do Funil (gargalos)</h3><div id="chart-tempo-etapa"></div></div>
    </div>

    <h3 class="section-title">Ranking de Consultores</h3>
    <div class="sub" style="margin:-8px 0 12px;">Placar comparativo: pontuação de SLA, ritmo de fechamento e qualidade de conversão, lado a lado.</div>
    <div id="tabela-ranking"></div>

    <h3 class="section-title">Taxa de Conversão do Funil por Consultor</h3>
    <div class="sub" style="margin:-8px 0 12px;">Dos candidatos inscritos, quantos chegaram a Aprovado pelo Cliente — mede qualidade da triagem, não só volume.</div>
    <div id="tabela-conversao"></div>

    <h3 class="section-title">SLA de Fechamento (ideal até 10 dias, dentro até 15 dias) e Meta Mensal por Consultor</h3>
    <div id="tabela-sla"></div>

    <h3 class="section-title">Pareceres Comportamentais Enviados por Vaga</h3>
    <div id="tabela-pareceres"></div>
  `;

  async function carregar() {
    const filtro = document.getElementById("filtro-consultor-dash");
    const consultorEscopo = filtro && filtro.value ? filtro.value : (!podeGerenciarVagas() ? store.usuario.id : "");
    const qs = consultorEscopo ? `?consultorId=${consultorEscopo}` : "";
    const dados = await api.get(`/api/indicadores/dashboard${qs}`);
    const vagasEscopo = await api.get(`/api/vagas${qs}`);
    const categorias = categorizarVagas(vagasEscopo);

    const slaLimite = dados.slaConfig.diasLimite;
    const dentroDoSla = dados.tempoMedioFechamentoDias > 0 && dados.tempoMedioFechamentoDias <= slaLimite;
    const temFechamento = dados.tempoMedioFechamentoDias > 0;
    const resumo = dados.resumoOperacional || {};

    document.getElementById("resumo-row").innerHTML = `
      <div class="resumo-card resumo-aberto clicavel" data-indicador="aberto" title="Clique para ver a lista">
        <div class="resumo-icone">🗂️</div>
        <div>
          <div class="resumo-label">Vagas em Aberto</div>
          <div class="resumo-value">${resumo.vagasEmAberto ?? 0}</div>
        </div>
      </div>
      <div class="resumo-card resumo-andamento clicavel" data-indicador="andamento" title="Clique para ver a lista">
        <div class="resumo-icone">🚀</div>
        <div>
          <div class="resumo-label">Vagas em Andamento</div>
          <div class="resumo-value">${resumo.vagasEmAndamento ?? 0}</div>
        </div>
      </div>
      <div class="resumo-card resumo-backlog clicavel" data-indicador="backlog" title="Clique para ver a lista">
        <div class="resumo-icone">🗃️</div>
        <div>
          <div class="resumo-label">Vagas no Backlog</div>
          <div class="resumo-value">${resumo.vagasNoBacklog ?? 0}</div>
        </div>
      </div>
      <div class="resumo-card resumo-standby clicavel" data-indicador="standby" title="Clique para ver a lista">
        <div class="resumo-icone">⏸️</div>
        <div>
          <div class="resumo-label">Vagas em Stand By</div>
          <div class="resumo-value">${resumo.vagasEmStandBy ?? 0}</div>
        </div>
      </div>
      <div class="resumo-card resumo-atraso clicavel" data-indicador="atraso" title="Clique para ver a lista">
        <div class="resumo-icone">⚠️</div>
        <div>
          <div class="resumo-label">Vagas em Atraso</div>
          <div class="resumo-value">${resumo.vagasEmAtraso ?? 0}</div>
        </div>
      </div>
      <div class="resumo-card resumo-andamento clicavel" data-indicador="tempoAberto" title="Clique para ver a lista">
        <div class="resumo-icone">⏱️</div>
        <div>
          <div class="resumo-label">Tempo Médio em Aberto</div>
          <div class="resumo-value">${dados.tempoMedioEmAbertoDias}d</div>
        </div>
      </div>
    `;

    document.getElementById("kpi-row-fechamento").innerHTML = `
      <div class="kpi-card kpi-destaque clicavel" data-indicador="fechadas" title="Clique para ver a lista">
        <div class="kpi-label">Total de Vagas Fechadas</div>
        <div class="kpi-value">${dados.totalVagasFechadas}</div>
      </div>
      <div class="kpi-card kpi-destaque">
        <div class="kpi-label">Total de Pareceres Enviados</div>
        <div class="kpi-value">${dados.totalPareceresEnviados}</div>
      </div>
      <div class="kpi-card kpi-destaque ${temFechamento ? (dentroDoSla ? "kpi-destaque-ok" : "kpi-destaque-alerta") : ""}">
        <div class="kpi-label">Tempo Médio de Vaga Fechada</div>
        <div class="kpi-value">${temFechamento ? `${dados.tempoMedioFechamentoDias}d` : "—"}</div>
        <div class="kpi-sub">Nosso SLA: ${slaLimite} dias${temFechamento ? (dentroDoSla ? " · dentro do SLA" : " · acima do SLA") : ""}</div>
      </div>
    `;

    const TITULOS_INDICADOR = {
      aberto: "Vagas em Aberto",
      andamento: "Vagas em Andamento",
      backlog: "Vagas no Backlog",
      standby: "Vagas em Stand By",
      atraso: "Vagas em Atraso",
      tempoAberto: "Vagas em Aberto (base do Tempo Médio)",
      fechadas: "Vagas Fechadas",
    };
    const LISTAS_INDICADOR = {
      aberto: categorias.abertas,
      andamento: categorias.andamento,
      backlog: categorias.backlog,
      standby: categorias.standby,
      atraso: categorias.atraso,
      tempoAberto: categorias.abertas,
      fechadas: categorias.fechadas,
    };
    document.querySelectorAll(".clicavel[data-indicador]").forEach((card) => {
      card.addEventListener("click", () => {
        const chave = card.dataset.indicador;
        abrirListaVagas(TITULOS_INDICADOR[chave], LEGENDAS[chave], LISTAS_INDICADOR[chave]);
      });
    });

    document.getElementById("kpi-row-carteira").innerHTML = `
      <div class="kpi-card"><div class="kpi-label">Total de Vagas (histórico)</div><div class="kpi-value">${dados.totalVagas}</div></div>
      <div class="kpi-card"><div class="kpi-label">Total de Candidatos</div><div class="kpi-value">${dados.totalCandidatos}</div></div>
      <div class="kpi-card"><div class="kpi-label">Empresas Clientes</div><div class="kpi-value">${dados.totalEmpresas}</div></div>
    `;

    document.getElementById("chart-consultor").innerHTML = barras(dados.vagasPorConsultor);
    document.getElementById("chart-fechadas-consultor").innerHTML = barras(dados.vagasFechadasPorConsultor);
    document.getElementById("chart-status").innerHTML = barras(dados.vagasPorStatusPrazo);
    document.getElementById("chart-etapa").innerHTML = barras(dados.vagasPorEtapa);
    document.getElementById("chart-candidatos").innerHTML = barras(dados.candidatosPorEtapa);
    document.getElementById("chart-tempo-etapa").innerHTML = barrasEtapas(dados.tempoMedioPorEtapa || []);
    document.getElementById("tabela-ranking").innerHTML = tabelaRanking(dados.rankingConsultores);
    document.getElementById("tabela-conversao").innerHTML = tabelaConversao(dados.slaPorConsultor);
    document.getElementById("tabela-sla").innerHTML = tabelaSla(dados.slaPorConsultor, dados.slaConfig);
    document.getElementById("tabela-pareceres").innerHTML = tabelaPareceres(dados.pareceresPorVaga);
  }

  const filtro = document.getElementById("filtro-consultor-dash");
  if (filtro) filtro.addEventListener("change", carregar);

  await carregar();
}
