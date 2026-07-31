import { api } from "../api.js";
import { store, showToast, podeGerenciarVagas, ehEstagiario } from "../state.js";
import { obterLocalizacao, linkMapa } from "../geo.js";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function formatarDataCurta(iso) {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return `${dia}/${mes}`;
}

function tagSaldo(saldo) {
  const v = Number(saldo) || 0;
  if (v > 0.05) return `<span class="tag tag-nprazo">+${v}h extra</span>`;
  if (v < -0.05) return `<span class="tag tag-atrasada">${v}h a descontar</span>`;
  return '<span class="tag tag-encerrada">Em dia</span>';
}

function localizacaoCelula(hora, lat, lng, foraDoLocal, distancia) {
  if (!hora) return "—";
  let html = hora;
  if (lat != null && lng != null) {
    html += ` <a href="${linkMapa(lat, lng)}" target="_blank" rel="noopener" title="Ver localização no mapa">📍</a>`;
  }
  if (foraDoLocal) {
    html += ` <span class="tag tag-atrasada" title="Distância aproximada: ${distancia ?? "?"}m do local esperado">⚠️ Fora do local</span>`;
  }
  return html;
}

// Início/fim (AAAA-MM-DD) de um mês relativo ao atual (0 = este mês, -1 = mês passado).
// O fim do mês atual é sempre "hoje" (não faz sentido pedir resumo do futuro).
function periodoMes(offsetMeses) {
  const hoje = new Date();
  const alvo = new Date(hoje.getFullYear(), hoje.getMonth() + offsetMeses, 1);
  const inicio = alvo.toISOString().slice(0, 10);
  const ultimoDiaMes = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).toISOString().slice(0, 10);
  const hojeStr = hoje.toISOString().slice(0, 10);
  const fim = offsetMeses === 0 && ultimoDiaMes > hojeStr ? hojeStr : ultimoDiaMes;
  return { inicio, fim };
}

export async function renderPonto(root) {
  if (podeGerenciarVagas()) {
    await renderGestor(root);
  } else if (ehEstagiario()) {
    await renderMeuPonto(root);
  } else {
    root.innerHTML = '<div class="empty-state">Controle de Ponto disponível apenas para estagiários e para a gestão.</div>';
  }
}

// ================== Visão do Gestor/Supervisora ==================
async function renderGestor(root) {
  let offsetMeses = 0;

  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Controle de Ponto</h2>
        <div class="sub">Horas trabalhadas x esperadas dos estagiários, com aviso de localização fora do combinado.</div>
      </div>
      <select id="ponto-periodo">
        <option value="0">Este mês</option>
        <option value="-1">Mês passado</option>
      </select>
    </div>
    <div id="ponto-conteudo"></div>
  `;

  const conteudo = root.querySelector("#ponto-conteudo");
  const periodoSelect = root.querySelector("#ponto-periodo");

  async function carregar() {
    const { inicio, fim } = periodoMes(offsetMeses);
    const dados = await api.get(`/api/ponto/resumo?inicio=${inicio}&fim=${fim}`);
    renderizarResumo(dados);
  }

  function renderizarResumo(dados) {
    if (dados.resumo.length === 0) {
      conteudo.innerHTML = '<div class="empty-state">Nenhum estagiário cadastrado ainda (Configurações &gt; Funcionários, vínculo "Estágio").</div>';
      return;
    }
    conteudo.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Estagiário</th><th>Modalidade</th><th>Horas Trabalhadas</th><th>Horas Esperadas</th>
            <th>Saldo</th><th>Dias com Ponto</th><th>Avisos</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${dados.resumo
            .map(
              (r) => `
            <tr data-id="${r.consultor.id}" class="linha-clicavel" style="cursor:pointer;">
              <td>${escapeHtml(r.consultor.nome)}${r.consultor.ativo === false ? ' <span class="tag tag-encerrada">Inativo</span>' : ""}</td>
              <td>${escapeHtml(r.consultor.modalidadeTrabalho || "—")}</td>
              <td>${r.horasTrabalhadas}h</td>
              <td>${r.horasEsperadas}h</td>
              <td>${tagSaldo(r.saldoHoras)}</td>
              <td>${r.diasComPonto}</td>
              <td>
                ${r.diasForaDoLocal > 0 ? `<span class="tag tag-atrasada">⚠️ ${r.diasForaDoLocal} fora do local</span> ` : ""}
                ${r.diasSemSaida > 0 ? `<span class="tag tag-standby">⏳ ${r.diasSemSaida} sem saída</span>` : ""}
              </td>
              <td><button class="btn btn-outline btn-sm btn-detalhe-ponto">Ver dias</button></td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
      <div id="ponto-detalhe" style="margin-top:18px;"></div>
    `;

    conteudo.querySelectorAll(".btn-detalhe-ponto, .linha-clicavel").forEach((el) => {
      el.addEventListener("click", (e) => {
        const tr = e.target.closest("tr");
        const r = dados.resumo.find((x) => x.consultor.id === tr.dataset.id);
        abrirDetalhe(r.consultor, dados.inicio, dados.fim);
      });
    });
  }

  async function abrirDetalhe(consultor, inicio, fim) {
    const detalheEl = conteudo.querySelector("#ponto-detalhe");
    detalheEl.innerHTML = '<div class="empty-state">Carregando...</div>';
    const registros = (await api.get(`/api/ponto?consultorId=${consultor.id}`)).filter((p) => p.data >= inicio && p.data <= fim);
    detalheEl.innerHTML = `
      <h3 class="section-title">${escapeHtml(consultor.nome)} — dia a dia</h3>
      ${
        registros.length === 0
          ? '<div class="empty-state">Nenhuma batida de ponto neste período.</div>'
          : `<table>
              <thead><tr><th>Data</th><th>Dia</th><th>Entrada</th><th>Saída</th><th>Trabalhadas</th><th>Esperadas</th><th>Saldo</th></tr></thead>
              <tbody>
                ${registros
                  .map(
                    (p) => `
                  <tr>
                    <td>${formatarDataCurta(p.data)}</td>
                    <td>${p.diaSemana}</td>
                    <td>${localizacaoCelula(p.horaEntrada, p.entradaLat, p.entradaLng, p.entradaForaDoLocal, p.entradaDistanciaMetros)}</td>
                    <td>${localizacaoCelula(p.horaSaida, p.saidaLat, p.saidaLng, p.saidaForaDoLocal, p.saidaDistanciaMetros)}</td>
                    <td>${p.horasTrabalhadas != null ? p.horasTrabalhadas + "h" : "—"}</td>
                    <td>${p.horasEsperadas}h</td>
                    <td>${p.horasTrabalhadas != null ? tagSaldo(p.saldoHoras) : "—"}</td>
                  </tr>`
                  )
                  .join("")}
              </tbody>
            </table>`
      }
    `;
  }

  periodoSelect.addEventListener("change", () => {
    offsetMeses = Number(periodoSelect.value);
    carregar();
  });

  await carregar();
}

// ================== Visão do próprio estagiário ("Meu Ponto") ==================
async function renderMeuPonto(root) {
  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Meu Ponto</h2>
        <div class="sub">A entrada é batida automaticamente quando você faz login. Não esqueça de bater a saída ao final do expediente.</div>
      </div>
    </div>
    <div id="ponto-hoje-card" class="card" style="margin-bottom:18px;"></div>
    <h3 class="section-title">Meu histórico</h3>
    <div id="ponto-historico"></div>
  `;

  async function carregar() {
    const [hoje, historico] = await Promise.all([api.get("/api/ponto/hoje"), api.get("/api/ponto/meu")]);
    renderizarHoje(hoje);
    renderizarHistorico(historico);
  }

  function renderizarHoje(hoje) {
    const cardEl = root.querySelector("#ponto-hoje-card");
    if (!hoje) {
      cardEl.innerHTML = '<div class="sub">Nenhuma batida de ponto hoje ainda — ela é registrada automaticamente no login.</div>';
      return;
    }
    cardEl.innerHTML = `
      <div class="kpi-row">
        <div class="kpi-card">
          <div class="kpi-label">Entrada de hoje</div>
          <div class="kpi-value">${hoje.horaEntrada}</div>
          ${hoje.entradaForaDoLocal ? '<div class="sub" style="color:var(--danger); margin-top:4px;">⚠️ Fora do local esperado</div>' : ""}
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Saída de hoje</div>
          <div class="kpi-value">${hoje.horaSaida || "—"}</div>
          ${!hoje.horaSaida ? '<button id="btn-bater-saida" class="btn btn-primary btn-sm" style="margin-top:8px;">Bater Saída</button>' : ""}
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Horas hoje</div>
          <div class="kpi-value">${hoje.horasTrabalhadas != null ? hoje.horasTrabalhadas + "h" : "—"}</div>
          <div class="sub" style="margin-top:4px;">Esperado: ${hoje.horasEsperadas}h</div>
        </div>
      </div>
    `;
    const btn = cardEl.querySelector("#btn-bater-saida");
    if (btn) {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "Registrando...";
        try {
          const localizacao = await obterLocalizacao();
          await api.post("/api/ponto/bater-saida", localizacao || {});
          showToast("Saída registrada.", "sucesso");
          carregar();
        } catch (err) {
          showToast(err.message, "erro");
          btn.disabled = false;
          btn.textContent = "Bater Saída";
        }
      });
    }
  }

  function renderizarHistorico(registros) {
    const el = root.querySelector("#ponto-historico");
    if (registros.length === 0) {
      el.innerHTML = '<div class="empty-state">Nenhum registro ainda.</div>';
      return;
    }
    el.innerHTML = `
      <table>
        <thead><tr><th>Data</th><th>Dia</th><th>Entrada</th><th>Saída</th><th>Trabalhadas</th><th>Esperadas</th><th>Saldo</th></tr></thead>
        <tbody>
          ${registros
            .map(
              (p) => `
            <tr>
              <td>${formatarDataCurta(p.data)}</td>
              <td>${p.diaSemana}</td>
              <td>${localizacaoCelula(p.horaEntrada, p.entradaLat, p.entradaLng, p.entradaForaDoLocal, p.entradaDistanciaMetros)}</td>
              <td>${localizacaoCelula(p.horaSaida, p.saidaLat, p.saidaLng, p.saidaForaDoLocal, p.saidaDistanciaMetros)}</td>
              <td>${p.horasTrabalhadas != null ? p.horasTrabalhadas + "h" : "—"}</td>
              <td>${p.horasEsperadas}h</td>
              <td>${p.horasTrabalhadas != null ? tagSaldo(p.saldoHoras) : "—"}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    `;
  }

  await carregar();
}
