import { api } from "../api.js";
import { store, isGestor } from "../state.js";

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
        <div class="sub">${isGestor() ? "Visão geral da operação." : "Seus indicadores como consultor(a)."}</div>
      </div>
      ${isGestor() ? `
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
    const qs = filtro && filtro.value ? `?consultorId=${filtro.value}` : "";
    const dados = await api.get(`/api/indicadores/dashboard${qs}`);

    const slaLimite = dados.slaConfig.diasLimite;
    const dentroDoSla = dados.tempoMedioFechamentoDias > 0 && dados.tempoMedioFechamentoDias <= slaLimite;
    const temFechamento = dados.tempoMedioFechamentoDias > 0;
    const resumo = dados.resumoOperacional || {};

    document.getElementById("resumo-row").innerHTML = `
      <div class="resumo-card resumo-aberto">
        <div class="resumo-icone">🗂️</div>
        <div>
          <div class="resumo-label">Vagas em Aberto</div>
          <div class="resumo-value">${resumo.vagasEmAberto ?? 0}</div>
        </div>
      </div>
      <div class="resumo-card resumo-andamento">
        <div class="resumo-icone">🚀</div>
        <div>
          <div class="resumo-label">Vagas em Andamento</div>
          <div class="resumo-value">${resumo.vagasEmAndamento ?? 0}</div>
        </div>
      </div>
      <div class="resumo-card resumo-backlog">
        <div class="resumo-icone">🗃️</div>
        <div>
          <div class="resumo-label">Vagas no Backlog</div>
          <div class="resumo-value">${resumo.vagasNoBacklog ?? 0}</div>
        </div>
      </div>
      <div class="resumo-card resumo-standby">
        <div class="resumo-icone">⏸️</div>
        <div>
          <div class="resumo-label">Vagas em Stand By</div>
          <div class="resumo-value">${resumo.vagasEmStandBy ?? 0}</div>
        </div>
      </div>
      <div class="resumo-card resumo-atraso">
        <div class="resumo-icone">⚠️</div>
        <div>
          <div class="resumo-label">Vagas em Atraso</div>
          <div class="resumo-value">${resumo.vagasEmAtraso ?? 0}</div>
        </div>
      </div>
      <div class="resumo-card resumo-andamento">
        <div class="resumo-icone">⏱️</div>
        <div>
          <div class="resumo-label">Tempo Médio em Aberto</div>
          <div class="resumo-value">${dados.tempoMedioEmAbertoDias}d</div>
        </div>
      </div>
    `;

    document.getElementById("kpi-row-fechamento").innerHTML = `
      <div class="kpi-card kpi-destaque">
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
