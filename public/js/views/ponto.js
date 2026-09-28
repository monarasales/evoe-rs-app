// Meu Ponto — tela do colaborador. Mostra SÓ os próprios dados (o servidor
// identifica a pessoa pela sessão). Sem rótulos de julgamento: os números
// aparecem, a conclusão da gestão sobre eles não.

import { api } from "../api.js";
import { showToast } from "../state.js";
import {
  escapeHtml,
  NOME_DIA,
  NOME_DIA_EXTENSO,
  NOME_MES,
  duracao,
  saldo,
  dataCurta,
  dataBr,
  situacaoDia,
  horariosDia,
  ocorrenciasDia,
} from "../pontoUtil.js";

function obterLocalizacao() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Este navegador não informa a localização"));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, long: pos.coords.longitude }),
      (err) => reject(new Error(err.code === 1 ? "Acesso à localização negado" : "Não foi possível obter a localização")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

function distanciaMetros(a, b) {
  const R = 6371000;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.long - a.long);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

export async function renderPonto(root) {
  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Meu Ponto</h2>
        <div class="sub">Registre suas marcações e acompanhe sua jornada.</div>
      </div>
    </div>
    <div id="mp-conteudo"><div class="empty-state">Carregando...</div></div>
  `;
  const conteudo = root.querySelector("#mp-conteudo");

  let situacao;
  try {
    situacao = await api.get("/api/ponto/meu/hoje");
  } catch (err) {
    conteudo.innerHTML = `<div class="card ponto-card"><div class="ponto-aviso">⚠️ ${escapeHtml(err.message)}</div></div>`;
    return;
  }

  let localizacao = null;
  const agora = new Date();
  let mesSel = { ano: agora.getFullYear(), mes: agora.getMonth() + 1 };

  conteudo.innerHTML = `
    <div class="ponto-layout">
      <div class="card ponto-card">
        <div class="ponto-data" id="mp-data"></div>
        <div class="sub" id="mp-escala"></div>
        <div class="ponto-local" id="mp-local">📍 Obtendo sua localização...</div>
        <button id="mp-bater" class="btn btn-primary btn-block ponto-botao" disabled>...</button>
        <div id="mp-erro" class="ponto-aviso hidden"></div>
        <div class="ponto-hoje-titulo">Marcações de hoje</div>
        <div id="mp-marcacoes" class="ponto-marcacoes"></div>
        <div class="sub" id="mp-cumprido"></div>
      </div>

      <div class="card">
        <div class="ponto-mes-nav">
          <button type="button" class="btn btn-outline btn-sm" id="mp-mes-ant" aria-label="Mês anterior">‹</button>
          <strong id="mp-mes-titulo"></strong>
          <button type="button" class="btn btn-outline btn-sm" id="mp-mes-prox" aria-label="Próximo mês">›</button>
        </div>
        <div id="mp-resumo" class="ponto-resumo"></div>
        <div id="mp-dias"></div>
      </div>
    </div>
  `;

  const $ = (id) => conteudo.querySelector(`#${id}`);
  const btn = $("mp-bater");

  function desenharHoje() {
    const s = situacao;
    const [, m, d] = s.hoje.split("-");
    $("mp-data").textContent = `${NOME_DIA_EXTENSO[s.diaSemana]}, ${d}/${m}`;
    const e = s.escalaHoje;
    $("mp-escala").textContent = s.feriado
      ? `Feriado: ${s.feriado}`
      : e
      ? `Sua escala hoje: ${e.entrada}${e.saidaAlmoco ? `–${e.saidaAlmoco} / ${e.voltaAlmoco}` : ""}–${e.saida} (${duracao(s.cargaEsperadaHoje)})`
      : "Hoje você não tem expediente na escala.";

    $("mp-marcacoes").innerHTML = s.marcacoes.length
      ? s.marcacoes
          .map((mk, i) => `<div class="ponto-marcacao"><span class="sub">${i + 1}ª</span> <strong>${mk.hora}</strong>${mk.dentroZona === false ? ' <span title="Fora do local esperado">⚠️</span>' : ""}</div>`)
          .join("")
      : '<div class="sub">Nenhuma marcação ainda.</div>';
    $("mp-cumprido").textContent = s.marcacoes.length
      ? `Trabalhado até agora: ${duracao(s.cargaCumpridaAteAgora)}${s.atrasoMin > 0 ? ` · entrada ${duracao(s.atrasoMin)} após o horário` : ""}`
      : "";

    btn.textContent = s.ativo ? s.proximaAcao : "Cadastro inativo";
    btn.disabled = !s.ativo || !localizacao;
  }

  async function carregarLocalizacao() {
    const localEl = $("mp-local");
    try {
      localizacao = await obterLocalizacao();
      const alvo = situacao.localEsperado;
      if (!alvo) {
        localEl.innerHTML = "📍 Localização obtida.";
      } else {
        const dist = distanciaMetros(localizacao, alvo.loc);
        const onde = alvo.nome === "casa" ? "casa (home office)" : "escritório";
        localEl.innerHTML =
          dist <= alvo.raio
            ? `✅ Você está no ${onde === "escritório" ? "escritório" : "local do home office"} <span class="sub">(${dist} m)</span>`
            : `⚠️ Você está a <strong>${dist} m</strong> do ${onde}. <span class="sub">O ponto será registrado com aviso.</span>`;
      }
    } catch (err) {
      localizacao = null;
      localEl.innerHTML = `⚠️ ${escapeHtml(err.message)}. <button type="button" class="link-btn" id="mp-tentar">Tentar de novo</button>
        <div class="sub">Para bater o ponto, permita o acesso à localização nas configurações do navegador.</div>`;
      $("mp-tentar").addEventListener("click", carregarLocalizacao);
    }
    desenharHoje();
  }

  btn.addEventListener("click", async () => {
    if (!localizacao) return;
    btn.disabled = true;
    btn.textContent = "Registrando...";
    $("mp-erro").classList.add("hidden");
    try {
      const r = await api.post("/api/ponto/bater", localizacao);
      showToast(`Ponto registrado às ${r.hora}`, "sucesso");
      situacao = await api.get("/api/ponto/meu/hoje");
      carregarMes();
    } catch (err) {
      $("mp-erro").textContent = `⚠️ ${err.message}`;
      $("mp-erro").classList.remove("hidden");
    }
    desenharHoje();
  });

  async function carregarMes() {
    $("mp-mes-titulo").textContent = `${NOME_MES[mesSel.mes - 1]} ${mesSel.ano}`;
    $("mp-dias").innerHTML = '<div class="empty-state">Carregando...</div>';
    try {
      const r = await api.get(`/api/ponto/meu/periodo?ano=${mesSel.ano}&mes=${mesSel.mes}`);
      const res = r.resumo;
      const ate = r.periodo.aberto ? ` até ${dataBr(r.periodo.fimFechado)}` : "";
      $("mp-resumo").innerHTML = `
        <div class="ponto-kpi"><div class="kpi-label">Banco de horas do mês${ate}</div><div class="kpi-value ${res.saldo < 0 ? "saldo-neg" : res.saldo > 0 ? "saldo-pos" : ""}">${saldo(res.saldo)}</div></div>
        <div class="ponto-kpi"><div class="kpi-label">Trabalhado / esperado</div><div class="kpi-value">${duracao(res.cargaCumprida)} <span class="sub">/ ${duracao(res.cargaEsperada)}</span></div></div>
        <div class="ponto-kpi"><div class="kpi-label">Atrasos</div><div class="kpi-value">${res.atrasos}</div></div>
        <div class="ponto-kpi"><div class="kpi-label">Faltas</div><div class="kpi-value">${res.faltas}</div></div>
        <div class="ponto-kpi"><div class="kpi-label">Pendências</div><div class="kpi-value">${res.pendentes}</div></div>
      `;
      const dias = r.dias.filter((d) => d.status !== "sem_escala" || d.foraDaEscala);
      $("mp-dias").innerHTML = dias.length
        ? `<div class="sub" style="margin:10px 0 6px;">Dias com marcação faltando ficam de fora do banco de horas até serem resolvidos.</div>
           <div class="tabela-rolavel"><table class="ponto-tabela">
            <thead><tr><th>Dia</th><th>Marcações</th><th>Trabalhado</th><th>Saldo</th></tr></thead>
            <tbody>${dias
              .map(
                (d) => `<tr>
                  <td><strong>${dataCurta(d.data)}</strong> <span class="sub">${NOME_DIA[d.diaSemana]}</span></td>
                  <td>${horariosDia(d)}<div>${ocorrenciasDia(d)}</div></td>
                  <td>${d.horarios.length ? duracao(d.cargaCumprida) : "—"}</td>
                  <td>${situacaoDia(d)}</td>
                </tr>`
              )
              .join("")}</tbody>
          </table></div>`
        : '<div class="empty-state">Nenhum dia de expediente neste mês até agora.</div>';
    } catch (err) {
      $("mp-dias").innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
    }
  }

  $("mp-mes-ant").addEventListener("click", () => {
    mesSel = mesSel.mes === 1 ? { ano: mesSel.ano - 1, mes: 12 } : { ano: mesSel.ano, mes: mesSel.mes - 1 };
    carregarMes();
  });
  $("mp-mes-prox").addEventListener("click", () => {
    mesSel = mesSel.mes === 12 ? { ano: mesSel.ano + 1, mes: 1 } : { ano: mesSel.ano, mes: mesSel.mes + 1 };
    carregarMes();
  });

  desenharHoje();
  carregarLocalizacao();
  carregarMes();
}
