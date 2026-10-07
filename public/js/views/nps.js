// Satisfação dos clientes (NPS) — painel do Gestor.
// Gráficos em HTML/SVG puro. Cores: NPS positivo azul / negativo vermelho (par divergente);
// promotores azul · neutros cinza · detratores vermelho (validado para daltonismo; o cinza
// tem pouco contraste, por isso há rótulos visíveis e a tabela de dados).

import { api } from "../api.js";
import { showToast, isGestor } from "../state.js";
import { abrirModal, fecharModal } from "../modal.js";

const esc = (s) => {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
};
const NOME_MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (m) => `${NOME_MES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;
const COR = { promotor: "#2a78d6", neutro: "#b9b7b0", detrator: "#e34948" };
const ZONA = {
  "Excelência": { icone: "🏆", classe: "nps-z-exc" },
  Qualidade: { icone: "✅", classe: "nps-z-qual" },
  "Aperfeiçoamento": { icone: "⚠️", classe: "nps-z-aperf" },
  "Crítica": { icone: "🚨", classe: "nps-z-crit" },
};
const estrelas = (n) => (n == null ? "—" : `${n.toFixed(1)} ★`);

export async function renderNps(root) {
  if (!isGestor()) {
    root.innerHTML = '<div class="empty-state">A área Comercial é exclusiva do perfil Gestor.</div>';
    return;
  }
  let meses = 12;
  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Satisfação dos clientes (NPS)</h2>
        <div class="sub">A pesquisa é criada quando a vaga vai para "11. Aprovado" (vaga fechada): e-mail automático ao cliente e envio por WhatsApp em 1 clique.</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button type="button" class="btn btn-primary btn-sm" id="nps-campanha">📣 Disparar para vagas fechadas</button>
        <button type="button" class="btn btn-outline btn-sm hidden" id="nps-fila">💬 Fila do WhatsApp</button>
        <button type="button" class="btn btn-outline btn-sm" id="nps-teste">📱 Enviar pesquisa de teste</button>
        <select id="nps-periodo" class="input-toolbar"><option value="6">Últimos 6 meses</option><option value="12" selected>Últimos 12 meses</option><option value="24">Últimos 24 meses</option></select>
      </div>
    </div>
    <div id="nps-conteudo"><div class="empty-state">Carregando...</div></div>
    <div id="nps-tip" class="nps-tip hidden" role="tooltip"></div>
  `;
  const alvo = root.querySelector("#nps-conteudo");
  let ultimas = [];
  root.querySelector("#nps-campanha").addEventListener("click", () => abrirCampanha(() => carregar()));
  root.querySelector("#nps-fila").addEventListener("click", () => abrirFilaWhatsapp(pendentesWhatsapp(ultimas), () => carregar()));
  root.querySelector("#nps-teste").addEventListener("click", () => {
    abrirModal(`
      <h2>Enviar pesquisa de teste</h2>
      <p class="sub">Cria uma pesquisa de teste e abre o WhatsApp com a mensagem pronta para o número abaixo. A resposta do teste não entra nos indicadores do NPS.</p>
      <div class="form-row"><label>WhatsApp (com DDD)</label><input type="tel" id="nps-teste-tel" inputmode="numeric" placeholder="(85) 90000-0000" /></div>
      <div id="nps-teste-erro" class="form-erro hidden"></div>
      <div class="modal-close-row">
        <button type="button" class="btn btn-outline" id="nps-teste-fechar">Fechar</button>
        <button type="button" class="btn btn-primary" id="nps-teste-enviar">Abrir WhatsApp</button>
      </div>`);
    const tel = document.getElementById("nps-teste-tel");
    tel.addEventListener("input", () => {
      const d = tel.value.replace(/\D/g, "").slice(0, 11);
      tel.value = d.length <= 2 ? (d ? `(${d}` : "") : d.length <= 7 ? `(${d.slice(0, 2)}) ${d.slice(2)}` : `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    });
    document.getElementById("nps-teste-fechar").addEventListener("click", fecharModal);
    document.getElementById("nps-teste-enviar").addEventListener("click", async () => {
      // Abre a aba já no clique (o Safari bloqueia janelas abertas depois de uma espera).
      const janela = window.open("", "_blank");
      try {
        const p = await api.post("/api/nps/teste", { telefone: tel.value });
        if (janela) janela.location = p.linkWhatsapp;
        else window.location.href = p.linkWhatsapp;
        fecharModal();
        showToast("Pesquisa de teste criada. Envie a mensagem no WhatsApp.", "sucesso");
        carregar();
      } catch (err) {
        if (janela) janela.close();
        const box = document.getElementById("nps-teste-erro");
        box.textContent = err.message;
        box.classList.remove("hidden");
      }
    });
  });
  root.querySelector("#nps-periodo").addEventListener("change", (e) => {
    meses = Number(e.target.value);
    carregar();
  });

  // Tooltip único (conteúdo sempre via textContent).
  const tip = root.querySelector("#nps-tip");
  root.addEventListener("pointermove", (e) => {
    const el = e.target.closest("[data-tip]");
    if (!el) return tip.classList.add("hidden");
    tip.textContent = "";
    el.dataset.tip.split("\n").forEach((linha, i) => {
      const div = document.createElement("div");
      if (i === 0) div.className = "nps-tip-titulo";
      div.textContent = linha;
      tip.appendChild(div);
    });
    tip.classList.remove("hidden");
    const x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
    tip.style.left = `${x}px`;
    tip.style.top = `${e.clientY + 14}px`;
  });
  root.addEventListener("pointerleave", () => tip.classList.add("hidden"));

  async function carregar() {
    alvo.innerHTML = '<div class="empty-state">Carregando...</div>';
    let d;
    try {
      d = await api.get(`/api/nps/painel?meses=${meses}`);
    } catch (err) {
      alvo.innerHTML = `<div class="empty-state">${esc(err.message)}</div>`;
      return;
    }
    ultimas = d.pesquisas;
    const nFila = pendentesWhatsapp(ultimas).length;
    const btnFila = root.querySelector("#nps-fila");
    btnFila.classList.toggle("hidden", !nFila);
    btnFila.textContent = `💬 Fila do WhatsApp (${nFila})`;
    const g = d.geral;
    const z = ZONA[g.zona];
    alvo.innerHTML = `
      <div class="nps-kpis">
        <div class="card nps-hero">
          <div class="kpi-label">NPS do período</div>
          <div class="nps-hero-valor">${g.nps == null ? "—" : (g.nps > 0 ? "+" : "") + g.nps}</div>
          <div class="nps-zona ${z ? z.classe : ""}">${z ? `${z.icone} Zona de ${esc(g.zona)}` : "Ainda sem respostas"}</div>
          <div class="sub">Escala de −100 a +100 · % promotores − % detratores</div>
        </div>
        <div class="card"><div class="kpi-label">Respostas</div><div class="kpi-value">${g.respostas}</div><div class="sub">de ${g.enviadas} pesquisa(s) enviada(s)</div></div>
        <div class="card"><div class="kpi-label">Taxa de resposta</div><div class="kpi-value">${g.taxaResposta == null ? "—" : g.taxaResposta + "%"}</div><div class="sub">quanto maior, mais confiável o NPS</div></div>
        <div class="card"><div class="kpi-label">Média geral</div><div class="kpi-value">${estrelas(g.mediaGeral)}</div><div class="sub">critérios de 1 a 5</div></div>
        <div class="card"><div class="kpi-label">Promotores · Neutros · Detratores</div>
          <div class="nps-pnd"><span><i style="background:${COR.promotor}"></i>${g.pctPromotores}%</span><span><i style="background:${COR.neutro}"></i>${g.pctNeutros}%</span><span><i style="background:${COR.detrator}"></i>${g.pctDetratores}%</span></div>
          <div class="sub">${g.promotores} · ${g.neutros} · ${g.detratores} respostas</div></div>
      </div>

      <div class="charts-row">
        <div class="chart-card"><h3>NPS por mês</h3>${graficoNps(d.mensal)}</div>
        <div class="chart-card"><h3>Promotores, neutros e detratores por mês</h3>${graficoPnd(d.mensal)}</div>
      </div>
      <div class="charts-row" style="margin-top:16px;">
        <div class="chart-card"><h3>Média por critério (1 a 5)</h3>${graficoCriterios(d.criterios, g.medias)}</div>
        <div class="chart-card"><h3>Por consultor</h3>${tabelaConsultores(d.consultores)}</div>
      </div>
      <details class="card" style="margin-top:16px;"><summary><strong>Ver dados mensais em tabela</strong></summary>${tabelaMensal(d.mensal, d.criterios)}</details>

      <div class="section-title">Pesquisas</div>
      ${tabelaPesquisas(d.pesquisas)}
    `;
    ligarAcoes(alvo, carregar);
  }
  carregar();
}

// ---------- Gráficos ----------
function graficoNps(mensal) {
  const L = 460, A = 256, M = { t: 18, r: 6, b: 38, l: 34 };
  const w = L - M.l - M.r, h = A - M.t - M.b;
  const y = (v) => M.t + h / 2 - (v / 100) * (h / 2);
  const passo = w / mensal.length;
  const larg = Math.min(34, passo * 0.6);
  const ticks = [100, 50, 0, -50, -100];
  const temDado = mensal.some((m) => m.nps != null);
  const ultimo = [...mensal].reverse().find((m) => m.nps != null);
  const barras = mensal
    .map((m, i) => {
      const cx = M.l + passo * i + passo / 2;
      // Eixo: só o mês; o ano aparece numa 2ª linha no primeiro mês e em janeiro.
      // Com muitos meses (24), rotula um sim, um não para não encavalar.
      const mostra = mensal.length <= 12 || i % 2 === 0 || m.mes.endsWith("-01");
      const ano = i === 0 || m.mes.endsWith("-01") ? `<tspan x="${cx}" dy="12">${m.mes.slice(0, 4)}</tspan>` : "";
      const rot = mostra ? `<text x="${cx}" y="${A - 16}" class="nps-eixo" text-anchor="middle">${NOME_MES[Number(m.mes.slice(5, 7)) - 1]}${ano}</text>` : "";
      if (m.nps == null) return `${rot}<text x="${cx}" y="${y(0) - 6}" class="nps-eixo" text-anchor="middle">·</text>`;
      const topo = Math.min(y(m.nps), y(0));
      const alt = Math.max(2, Math.abs(y(m.nps) - y(0)));
      const cor = m.nps >= 0 ? COR.promotor : COR.detrator;
      const raio = 4;
      const tip = `${rotuloMes(m.mes)}\nNPS ${m.nps > 0 ? "+" : ""}${m.nps}\n${m.respostas} resposta(s)\nPromotores ${m.pctPromotores}% · Detratores ${m.pctDetratores}%`;
      const label = m === ultimo ? `<text x="${cx}" y="${m.nps >= 0 ? topo - 6 : topo + alt + 14}" class="nps-valor" text-anchor="middle">${m.nps > 0 ? "+" : ""}${m.nps}</text>` : "";
      return `${rot}<rect x="${cx - larg / 2}" y="${topo}" width="${larg}" height="${alt}" rx="${raio}" fill="${cor}"></rect>${label}
        <rect x="${cx - passo / 2}" y="${M.t}" width="${passo}" height="${h}" fill="transparent" data-tip="${esc(tip)}"></rect>`;
    })
    .join("");
  return `<div class="nps-svg"><svg viewBox="0 0 ${L} ${A}" role="img" aria-label="NPS por mês">
    ${ticks.map((t) => `<line x1="${M.l}" x2="${L - M.r}" y1="${y(t)}" y2="${y(t)}" class="${t === 0 ? "nps-zero" : "nps-grade"}"></line><text x="${M.l - 6}" y="${y(t) + 4}" class="nps-eixo" text-anchor="end">${t > 0 ? "+" : ""}${t}</text>`).join("")}
    ${barras}
  </svg></div>${temDado ? "" : '<div class="sub">Sem respostas no período.</div>'}`;
}

function graficoPnd(mensal) {
  const comDado = mensal.filter((m) => m.respostas > 0);
  if (!comDado.length) return '<div class="sub" style="padding:40px 0;text-align:center;">Sem respostas no período.</div>';
  const legenda = `<div class="nps-legenda-viz">${[["promotor", "Promotores (9–10)"], ["neutro", "Neutros (7–8)"], ["detrator", "Detratores (0–6)"]].map(([k, t]) => `<span><i style="background:${COR[k]}"></i>${t}</span>`).join("")}</div>`;
  const linhas = mensal
    .map((m) => {
      if (!m.respostas) return `<div class="pnd-linha"><span class="pnd-mes">${rotuloMes(m.mes)}</span><div class="pnd-vazio">sem respostas</div></div>`;
      const seg = (k, pct, n) => (pct > 0 ? `<div class="pnd-seg" style="width:${pct}%;background:${COR[k]}" data-tip="${esc(`${rotuloMes(m.mes)}\n${pct}% ${k === "promotor" ? "promotores" : k === "neutro" ? "neutros" : "detratores"}\n${n} resposta(s)`)}">${pct >= 14 ? `<span class="${k === "neutro" ? "escuro" : ""}">${Math.round(pct)}%</span>` : ""}</div>` : "");
      return `<div class="pnd-linha"><span class="pnd-mes">${rotuloMes(m.mes)}</span><div class="pnd-barra">${seg("detrator", m.pctDetratores, m.detratores)}${seg("neutro", m.pctNeutros, m.neutros)}${seg("promotor", m.pctPromotores, m.promotores)}</div></div>`;
    })
    .join("");
  return `${legenda}<div class="pnd">${linhas}</div>`;
}

function graficoCriterios(criterios, medias) {
  if (!criterios.some((c) => medias[c.id] != null)) return '<div class="sub" style="padding:40px 0;text-align:center;">Sem respostas no período.</div>';
  return `<div class="crit">${criterios
    .map((c) => {
      const v = medias[c.id];
      return `<div class="crit-linha" data-tip="${esc(`${c.nome}\nMédia ${v == null ? "—" : v.toFixed(1)} de 5`)}"><span class="crit-nome">${esc(c.nome)}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${v == null ? 0 : (v / 5) * 100}%;background:${COR.promotor}"></div></div><strong>${v == null ? "—" : v.toFixed(1)}</strong></div>`;
    })
    .join("")}</div>`;
}

function tabelaConsultores(lista) {
  if (!lista.length) return '<div class="sub" style="padding:40px 0;text-align:center;">Sem respostas no período.</div>';
  return `<div class="tabela-rolavel"><table><thead><tr><th>Consultor(a)</th><th>Respostas</th><th>NPS</th><th>Nota do consultor</th><th>Média geral</th></tr></thead><tbody>${lista
    .map((c) => `<tr><td><strong>${esc(c.nome)}</strong></td><td>${c.respostas}</td><td><strong>${c.nps > 0 ? "+" : ""}${c.nps}</strong></td><td>${estrelas(c.medias.consultor)}</td><td>${estrelas(c.mediaGeral)}</td></tr>`)
    .join("")}</tbody></table></div>`;
}

function tabelaMensal(mensal, criterios) {
  return `<div class="tabela-rolavel" style="margin-top:10px;"><table><thead><tr><th>Mês</th><th>Enviadas</th><th>Respostas</th><th>NPS</th><th>Promotores</th><th>Neutros</th><th>Detratores</th>${criterios.map((c) => `<th>${esc(c.nome)}</th>`).join("")}</tr></thead><tbody>${mensal
    .slice()
    .reverse()
    .map(
      (m) =>
        `<tr><td>${rotuloMes(m.mes)}</td><td>${m.enviadas}</td><td>${m.respostas}</td><td>${m.nps == null ? "—" : (m.nps > 0 ? "+" : "") + m.nps}</td><td>${m.respostas ? m.pctPromotores + "%" : "—"}</td><td>${m.respostas ? m.pctNeutros + "%" : "—"}</td><td>${m.respostas ? m.pctDetratores + "%" : "—"}</td>${criterios.map((c) => `<td>${m.medias[c.id] == null ? "—" : m.medias[c.id].toFixed(1)}</td>`).join("")}</tr>`
    )
    .join("")}</tbody></table></div>`;
}

function tabelaPesquisas(listaOriginal) {
  // Pendentes primeiro (são as que pedem ação), depois as respondidas mais recentes.
  const lista = [...listaOriginal.filter((p) => !p.respostas), ...listaOriginal.filter((p) => p.respostas)];
  if (!lista.length) return '<div class="empty-state">Nenhuma pesquisa ainda. Ela é criada quando uma vaga é marcada como "11. Aprovado".</div>';
  return `<div class="tabela-rolavel"><table class="nps-pesquisas"><thead><tr><th>Vaga / cliente</th><th>Consultor(a)</th><th>Envio</th><th>Situação</th><th></th></tr></thead><tbody>${lista
    .map((p, i) => {
      const email = p.envios.filter((e) => e.canal.startsWith("email")).slice(-1)[0];
      const whats = p.envios.filter((e) => e.canal === "whatsapp").slice(-1)[0];
      const r = p.respostas;
      const cat = r ? (r.nps >= 9 ? "promotor" : r.nps >= 7 ? "neutro" : "detrator") : null;
      return `<tr class="${i >= 15 ? "nps-oculta hidden" : ""}">
        <td><strong>${esc(p.vagaTitulo)}</strong>${p.teste ? ' <span class="tag tag-encerrada">teste</span>' : ""}<div class="sub">${esc(p.empresaNome || "—")}${p.contatoNome ? ` · ${esc(p.contatoNome)}` : ""}</div></td>
        <td>${esc(p.consultorNome || "—")}</td>
        <td class="sub">${new Date(p.criadaEm).toLocaleDateString("pt-BR")}<br>
          ${email ? (email.ok ? `✉️ e-mail enviado` : `✉️ <span class="saldo-neg">não enviado</span>`) : ""}${email && !email.ok ? `<div class="sub" title="${esc(email.erro || "")}">${esc((email.erro || "").slice(0, 60))}</div>` : ""}
          ${whats ? "<br>💬 WhatsApp aberto" : ""}</td>
        <td>${
          r
            ? `<span class="tag nps-cat-${cat}">${r.nps}/10 · ${cat === "promotor" ? "promotor" : cat === "neutro" ? "neutro" : "detrator"}</span>
               <div class="sub">respondida em ${new Date(p.respondidaEm).toLocaleDateString("pt-BR")}${r.respondente ? ` por ${esc(r.respondente)}` : ""}</div>
               ${r.feedback ? `<details><summary class="sub">ver comentário</summary><div class="parecer-texto">${esc(r.feedback)}</div></details>` : ""}`
            : '<span class="tag tag-standby">aguardando resposta</span>'
        }</td>
        <td style="white-space:nowrap;">${
          r
            ? ""
            : `<button class="btn btn-primary btn-sm" data-whats="${esc(p.id)}" data-link="${esc(p.linkWhatsapp)}">WhatsApp</button>
               ${p.vagaId ? `<button class="btn btn-outline btn-sm" data-reenviar="${esc(p.vagaId)}">Reenviar e-mail</button>` : ""}
               <button class="btn btn-outline btn-sm" data-copiar="${esc(p.link)}">Copiar link</button>`
        }</td>
      </tr>`;
    })
    .join("")}</tbody></table></div>${lista.length > 15 ? `<button type="button" class="btn btn-outline btn-sm" id="nps-mostrar-todas" style="margin-top:10px;">Mostrar todas (${lista.length})</button>` : ""}`;
}

/** Ações dos botões de envio (painel e cadastro da vaga usam as mesmas). */
export function ligarAcoes(raiz, aoMudar) {
  const todas = raiz.querySelector("#nps-mostrar-todas");
  if (todas)
    todas.addEventListener("click", () => {
      raiz.querySelectorAll(".nps-oculta").forEach((tr) => tr.classList.remove("hidden"));
      todas.remove();
    });
  raiz.querySelectorAll("[data-whats]").forEach((b) =>
    b.addEventListener("click", async () => {
      window.open(b.dataset.link, "_blank", "noopener");
      try {
        await api.post(`/api/nps/${b.dataset.whats}/whatsapp`);
        if (aoMudar) aoMudar();
      } catch (e) {
        /* registro do envio é opcional */
      }
    })
  );
  raiz.querySelectorAll("[data-reenviar]").forEach((b) =>
    b.addEventListener("click", async () => {
      b.disabled = true;
      try {
        const r = await api.post(`/api/nps/vaga/${b.dataset.reenviar}/enviar`);
        showToast(r.email.ok ? "Pesquisa enviada por e-mail." : `E-mail não enviado: ${r.email.erro}`, r.email.ok ? "sucesso" : "erro");
        if (aoMudar) aoMudar();
      } catch (err) {
        showToast(err.message, "erro");
      }
      b.disabled = false;
    })
  );
  raiz.querySelectorAll("[data-copiar]").forEach((b) =>
    b.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(b.dataset.copiar);
        showToast("Link da pesquisa copiado.", "sucesso");
      } catch (e) {
        prompt("Copie o link:", b.dataset.copiar);
      }
    })
  );
}

// ---------- Disparo para vagas já fechadas ----------
/** Pesquisas sem resposta que ainda não foram abertas no WhatsApp (fila de envio). */
function pendentesWhatsapp(pesquisas) {
  return pesquisas.filter((p) => !p.respostas && !p.teste && !p.envios.some((e) => e.canal === "whatsapp"));
}

async function abrirCampanha(aoConcluir) {
  abrirModal('<div class="empty-state">Carregando vagas fechadas...</div>');
  let vagas;
  try {
    vagas = await api.get("/api/nps/campanha/candidatas");
  } catch (err) {
    abrirModal(`<div class="form-erro">${esc(err.message)}</div><div class="modal-close-row"><button class="btn btn-outline" id="camp-fechar">Fechar</button></div>`);
    document.getElementById("camp-fechar").addEventListener("click", fecharModal);
    return;
  }
  if (!vagas.length) {
    abrirModal(`<h2>Disparar pesquisa para vagas fechadas</h2><div class="empty-state">Todas as vagas fechadas já têm pesquisa. 🎉</div><div class="modal-close-row"><button class="btn btn-outline" id="camp-fechar">Fechar</button></div>`);
    document.getElementById("camp-fechar").addEventListener("click", fecharModal);
    return;
  }
  const semContato = (v) => v.whatsapp.length < 10 && !v.emails.length;
  abrirModal(`
    <h2>Disparar pesquisa para vagas fechadas</h2>
    <p class="sub">Valide a lista antes de disparar. Vêm marcadas a vaga fechada <strong>mais recente de cada empresa</strong> (para não enviar várias pesquisas ao mesmo cliente) e só quem tem contato no CRM.</p>
    <div class="camp-acoes">
      <button type="button" class="link-btn" data-marcar="sugeridas">Marcar sugeridas</button> ·
      <button type="button" class="link-btn" data-marcar="todas">Marcar todas</button> ·
      <button type="button" class="link-btn" data-marcar="nenhuma">Desmarcar todas</button>
    </div>
    <div class="tabela-rolavel camp-lista"><table>
      <thead><tr><th></th><th>Vaga / cliente</th><th>Fechada em</th><th>WhatsApp</th><th>E-mail</th></tr></thead>
      <tbody>${vagas
        .map(
          (v) => `<tr class="${semContato(v) ? "camp-sem" : ""}">
            <td><input type="checkbox" class="camp-check" value="${esc(v.vagaId)}" ${v.sugerida ? "checked" : ""} ${semContato(v) ? "disabled" : ""} /></td>
            <td><strong>${esc(v.vagaTitulo)}</strong><div class="sub">${esc(v.empresaNome)}${v.contatoNome ? ` · ${esc(v.contatoNome)}` : ""}${v.consultorNome ? ` · consultor(a): ${esc(v.consultorNome)}` : ""}</div></td>
            <td class="sub">${v.dataFechamento ? new Date(v.dataFechamento + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</td>
            <td>${v.whatsapp.length >= 10 ? `✅ <span class="sub">${esc(v.whatsapp)}</span>` : '<span class="saldo-neg">sem WhatsApp</span>'}</td>
            <td>${v.emails.length ? `✅ <span class="sub">${esc(v.emails.join(", "))}</span>` : '<span class="sub">—</span>'}</td>
          </tr>`
        )
        .join("")}</tbody></table></div>
    <div class="sub" style="margin-top:6px;">Clientes sem WhatsApp e sem e-mail ficam bloqueados — cadastre o contato no CRM e volte aqui.</div>
    <label class="checkbox-row" style="margin-top:12px;"><input type="checkbox" id="camp-email" checked /> Enviar também por e-mail (automático) para quem tem e-mail</label>
    <div id="camp-erro" class="form-erro hidden"></div>
    <div class="modal-close-row">
      <button type="button" class="btn btn-outline" id="camp-fechar">Cancelar</button>
      <button type="button" class="btn btn-primary" id="camp-disparar">Validar e disparar</button>
    </div>`);

  const checks = () => [...document.querySelectorAll(".camp-check:not(:disabled)")];
  const atualizar = () => {
    const n = checks().filter((c) => c.checked).length;
    document.getElementById("camp-disparar").textContent = n ? `Validar e disparar (${n})` : "Validar e disparar";
    document.getElementById("camp-disparar").disabled = !n;
  };
  document.querySelectorAll("[data-marcar]").forEach((b) =>
    b.addEventListener("click", () => {
      checks().forEach((c) => {
        const v = vagas.find((x) => x.vagaId === c.value);
        c.checked = b.dataset.marcar === "todas" || (b.dataset.marcar === "sugeridas" && v.sugerida);
      });
      atualizar();
    })
  );
  document.querySelectorAll(".camp-check").forEach((c) => c.addEventListener("change", atualizar));
  atualizar();
  document.getElementById("camp-fechar").addEventListener("click", fecharModal);
  document.getElementById("camp-disparar").addEventListener("click", async () => {
    const ids = checks().filter((c) => c.checked).map((c) => c.value);
    if (!confirm(`Criar e disparar ${ids.length} pesquisa(s) de satisfação?`)) return;
    const botao = document.getElementById("camp-disparar");
    botao.disabled = true;
    botao.textContent = "Disparando...";
    try {
      const r = await api.post("/api/nps/campanha", { vagaIds: ids, enviarEmail: document.getElementById("camp-email").checked });
      const emails = r.pesquisas.filter((p) => p.envios.some((e) => e.canal === "email" && e.ok)).length;
      showToast(`${r.pesquisas.length} pesquisa(s) criada(s)${emails ? `, ${emails} enviada(s) por e-mail` : ""}. Agora envie pelo WhatsApp.`, "sucesso");
      if (aoConcluir) aoConcluir();
      abrirFilaWhatsapp(r.pesquisas, aoConcluir);
    } catch (err) {
      const box = document.getElementById("camp-erro");
      box.textContent = err.message;
      box.classList.remove("hidden");
      botao.disabled = false;
      atualizar();
    }
  });
}

/** Fila de envio pelo WhatsApp: um clique por cliente, com progresso. */
function abrirFilaWhatsapp(pesquisas, aoConcluir) {
  const fila = pesquisas.map((p) => ({ ...p, enviado: p.envios.some((e) => e.canal === "whatsapp") }));
  const desenhar = () => {
    const comWhats = fila.filter((p) => p.whatsapp && p.whatsapp.length >= 10);
    const feitos = comWhats.filter((p) => p.enviado).length;
    const proximo = comWhats.find((p) => !p.enviado);
    abrirModal(`
      <h2>💬 Fila de envio pelo WhatsApp</h2>
      <p class="sub">Clique em <strong>Enviar</strong>: o WhatsApp abre na conversa do cliente com a mensagem pronta — é só apertar enviar e voltar aqui para o próximo.</p>
      <div class="camp-progresso"><div class="bar-track"><div class="bar-fill bar-fill-ok" style="width:${comWhats.length ? (feitos / comWhats.length) * 100 : 0}%"></div></div><strong>${feitos} de ${comWhats.length}</strong></div>
      <div class="tabela-rolavel camp-lista"><table><tbody>${fila
        .map(
          (p) => `<tr class="${p === proximo ? "camp-proximo" : ""}">
            <td><strong>${esc(p.empresaNome || p.vagaTitulo)}</strong><div class="sub">${esc(p.vagaTitulo)}${p.contatoNome ? ` · ${esc(p.contatoNome)}` : ""}</div></td>
            <td style="white-space:nowrap;text-align:right;">${
              !p.whatsapp || p.whatsapp.length < 10
                ? `<span class="sub">sem WhatsApp${p.envios.some((e) => e.canal === "email" && e.ok) ? " · ✉️ e-mail enviado" : ""}</span>`
                : p.enviado
                ? '<span class="tag tag-nprazo">✓ aberto no WhatsApp</span>'
                : `<button type="button" class="btn ${p === proximo ? "btn-primary" : "btn-outline"} btn-sm" data-enviar="${esc(p.id)}">Enviar</button>`
            }</td>
          </tr>`
        )
        .join("")}</tbody></table></div>
      ${!proximo && comWhats.length ? '<div class="funil-final aprovado" style="margin-top:10px;">🎉 Todos os clientes com WhatsApp foram enviados!</div>' : ""}
      <div class="modal-close-row"><button type="button" class="btn btn-outline" id="fila-fechar">${proximo ? "Continuar depois" : "Fechar"}</button></div>`);
    document.getElementById("fila-fechar").addEventListener("click", () => {
      fecharModal();
      if (aoConcluir) aoConcluir();
    });
    document.querySelectorAll("[data-enviar]").forEach((b) =>
      b.addEventListener("click", () => {
        const p = fila.find((x) => x.id === b.dataset.enviar);
        window.open(p.linkWhatsapp, "_blank", "noopener");
        p.enviado = true;
        api.post(`/api/nps/${p.id}/whatsapp`).catch(() => {});
        desenhar();
      })
    );
  };
  desenhar();
}
