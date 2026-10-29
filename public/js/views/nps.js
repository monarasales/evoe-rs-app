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
  root.querySelector("#nps-fila").addEventListener("click", () => abrirFilaWhatsapp(filaWhatsapp(ultimas), () => carregar()));
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
    const dg = d.diagnostico || {};
    const filaPendente = pendentesWhatsapp(d.pesquisas).length;
    const alertas = [
      dg.senhaRecusada
        ? `<div class="ponto-aviso">⚠️ <strong>Os e-mails não estão saindo:</strong> o Gmail recusou o usuário/senha configurados no servidor. ${dg.emailsComFalha} pesquisa(s) ficaram sem e-mail. Depois de corrigir a senha, clique em <button type="button" class="link-btn" id="nps-reenviar-falhas">Reenviar e-mails que falharam</button>.</div>`
        : dg.emailsComFalha
        ? `<div class="ponto-aviso">⚠️ ${dg.emailsComFalha} pesquisa(s) sem e-mail entregue${dg.erroEmail ? ` (último erro: ${esc(dg.erroEmail.slice(0, 90))})` : ""}. <button type="button" class="link-btn" id="nps-reenviar-falhas">Reenviar e-mails que falharam</button></div>`
        : "",
      filaPendente
        ? `<div class="ponto-aviso">💬 <strong>${filaPendente} cliente(s) ainda não receberam pelo WhatsApp</strong> — a mensagem só sai quando você clica em Enviar e confirma no WhatsApp. <button type="button" class="link-btn" id="nps-abrir-fila">Abrir a fila do WhatsApp</button></div>`
        : "",
    ].join("");
    alvo.innerHTML = `
      ${alertas}
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
    const btnFalhas = alvo.querySelector("#nps-reenviar-falhas");
    if (btnFalhas)
      btnFalhas.addEventListener("click", async () => {
        btnFalhas.disabled = true;
        btnFalhas.textContent = "Reenviando...";
        try {
          const r = await api.post("/api/nps/reenviar-falhas");
          showToast(r.enviados ? `${r.enviados} e-mail(s) enviado(s)${r.falhas ? `, ${r.falhas} ainda com erro` : ""}.` : `Nenhum e-mail saiu: ${r.ultimoErro || "sem e-mails para reenviar"}`, r.enviados ? "sucesso" : "erro");
        } catch (err) {
          showToast(err.message, "erro");
        }
        carregar();
      });
    const btnAbrirFila = alvo.querySelector("#nps-abrir-fila");
    if (btnAbrirFila) btnAbrirFila.addEventListener("click", () => abrirFilaWhatsapp(filaWhatsapp(ultimas), () => carregar()));
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

function linhaPesquisa(p, oculta) {
  const email = p.envios.filter((e) => e.canal.startsWith("email")).slice(-1)[0];
  const whats = p.envios.filter((e) => e.canal === "whatsapp").slice(-1)[0];
  const r = p.respostas;
  const cat = r ? (r.nps >= 9 ? "promotor" : r.nps >= 7 ? "neutro" : "detrator") : null;
  const semContato = !p.teste && !(p.whatsapp && p.whatsapp.length >= 10) && !(p.emails || []).length;
  return `<tr class="${oculta ? "nps-oculta hidden" : ""}">
    <td><strong>${esc(p.vagaTitulo)}</strong>${p.teste ? ' <span class="tag tag-encerrada">teste</span>' : ""}<div class="sub">${esc(p.empresaNome || "—")}${p.contatoNome ? ` · ${esc(p.contatoNome)}` : ""}</div></td>
    <td>${esc(p.consultorNome || "—")}</td>
    <td class="sub">${new Date(p.criadaEm).toLocaleDateString("pt-BR")}<br>
      ${email ? (email.ok ? "✉️ e-mail enviado" : '✉️ <span class="saldo-neg">não enviado</span>') : ""}${email && !email.ok ? `<div class="sub" title="${esc(email.erro || "")}">${esc((email.erro || "").slice(0, 60))}</div>` : ""}
      ${whats ? `<br>💬 enviado no WhatsApp em ${new Date(whats.em).toLocaleDateString("pt-BR")}` : ""}${semContato ? '<br><span class="saldo-neg">sem contato</span>' : ""}</td>
    <td>${
      r
        ? `<span class="tag nps-cat-${cat}">${r.nps}/10 · ${cat}</span>
           <div class="sub">respondida em ${new Date(p.respondidaEm).toLocaleDateString("pt-BR")}${r.respondente ? ` por ${esc(r.respondente)}` : ""}${p.respostaManual ? ` · registrada por ${esc(r.registradaPor || "Evoé")} (${esc(r.canal || "WhatsApp")})` : ""}</div>
           ${r.feedback ? `<div class="parecer-texto" style="margin-top:4px;">"${esc(r.feedback)}"</div>` : ""}`
        : '<span class="tag tag-standby">aguardando resposta</span>'
    }</td>
    <td style="white-space:nowrap;">${
      r
        ? ""
        : `${semContato ? `<button class="btn btn-primary btn-sm" data-contato="${esc(p.id)}">✏️ Adicionar contato</button>` : `<button class="btn btn-primary btn-sm" data-whats="${esc(p.id)}" data-link="${esc(p.linkWhatsapp)}">WhatsApp</button>`}
           ${p.vagaId && (p.emails || []).length ? `<button class="btn btn-outline btn-sm" data-reenviar="${esc(p.vagaId)}">Reenviar e-mail</button>` : ""}
           <button class="btn btn-outline btn-sm" data-copiar="${esc(p.link)}">Copiar link</button>
           <button class="btn btn-outline btn-sm" data-registrar="${esc(p.id)}" title="O cliente respondeu por mensagem? Registre a nota aqui.">📝 Registrar resposta</button>`
    }</td>
  </tr>`;
}

function tabelaPesquisas(lista) {
  if (!lista.length) return '<div class="empty-state">Nenhuma pesquisa ainda. Ela é criada quando uma vaga é marcada como "11. Aprovado".</div>';
  const cab = "<thead><tr><th>Vaga / cliente</th><th>Consultor(a)</th><th>Envio</th><th>Situação</th><th></th></tr></thead>";
  const respondidas = lista.filter((p) => p.respostas).sort((a, b) => String(b.respondidaEm).localeCompare(String(a.respondidaEm)));
  const pendentes = lista.filter((p) => !p.respostas);
  return `
    <h3 class="nps-subtitulo">✅ Respostas recebidas (${respondidas.length})</h3>
    ${respondidas.length ? `<div class="tabela-rolavel"><table class="nps-pesquisas">${cab}<tbody>${respondidas.map((p) => linhaPesquisa(p, false)).join("")}</tbody></table></div>` : '<div class="sub" style="margin-bottom:10px;">Nenhuma resposta ainda. Se um cliente respondeu por mensagem no WhatsApp, use "📝 Registrar resposta" na pesquisa dele, abaixo.</div>'}
    <h3 class="nps-subtitulo">⏳ Aguardando resposta (${pendentes.length})</h3>
    ${pendentes.length ? `<div class="tabela-rolavel"><table class="nps-pesquisas">${cab}<tbody>${pendentes.map((p, i) => linhaPesquisa(p, i >= 15)).join("")}</tbody></table></div>${pendentes.length > 15 ? `<button type="button" class="btn btn-outline btn-sm" id="nps-mostrar-todas" style="margin-top:10px;">Mostrar todas (${pendentes.length})</button>` : ""}` : '<div class="sub">Todas as pesquisas foram respondidas. 🎉</div>'}`;
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
  raiz.querySelectorAll("[data-contato]").forEach((b) => b.addEventListener("click", () => editarContato(b.dataset.contato, aoMudar)));
  raiz.querySelectorAll("[data-registrar]").forEach((b) => b.addEventListener("click", () => registrarResposta(b.dataset.registrar, aoMudar)));
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
/** Fila do WhatsApp: todas as pesquisas sem resposta (enviadas aparecem como "Enviado"). */
function filaWhatsapp(pesquisas) {
  return pesquisas.filter((p) => !p.respostas && !p.teste);
}

/** Pesquisas sem resposta que ainda não foram abertas no WhatsApp (contagem do aviso). */
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

const dataEnvioWhats = (p) => {
  const e = (p.envios || []).filter((x) => x.canal === "whatsapp").slice(-1)[0];
  return e ? new Date(e.em).toLocaleDateString("pt-BR") : "";
};
const temWhats = (p) => p.whatsapp && String(p.whatsapp).replace(/\D/g, "").length >= 10;

/** Fila de envio pelo WhatsApp: um clique por cliente, com progresso; sem contato → cadastrar ali mesmo. */
function abrirFilaWhatsapp(pesquisas, aoConcluir) {
  const fila = pesquisas.map((p) => ({ ...p, enviado: p.envios.some((e) => e.canal === "whatsapp") }));
  let editando = null;
  // Ordem: a enviar → sem contato → já enviadas
  const ordem = (p) => (temWhats(p) && !p.enviado ? 0 : !temWhats(p) ? 1 : 2);
  fila.sort((a, b) => ordem(a) - ordem(b));
  const desenhar = () => {
    const comWhats = fila.filter(temWhats);
    const feitos = comWhats.filter((p) => p.enviado).length;
    const proximo = comWhats.find((p) => !p.enviado);
    const semContato = fila.filter((p) => !temWhats(p)).length;
    abrirModal(`
      <h2>💬 Fila de envio pelo WhatsApp</h2>
      <p class="sub">Clique em <strong>Enviar</strong>: o WhatsApp abre na conversa do cliente com a mensagem pronta — é só apertar enviar e voltar aqui para o próximo.${semContato ? ` ${semContato} cliente(s) sem WhatsApp: clique em <strong>✏️ Adicionar contato</strong>.` : ""}</p>
      <div class="camp-progresso"><div class="bar-track"><div class="bar-fill bar-fill-ok" style="width:${comWhats.length ? (feitos / comWhats.length) * 100 : 0}%"></div></div><strong>${feitos} de ${comWhats.length} enviados</strong></div>
      <div class="tabela-rolavel camp-lista"><table><tbody>${fila
        .map((p) => {
          const acao = !temWhats(p)
            ? `<button type="button" class="btn btn-outline btn-sm" data-editar="${esc(p.id)}">✏️ Adicionar contato</button>${p.envios.some((e) => e.canal.startsWith("email") && e.ok) ? '<div class="sub">✉️ e-mail enviado</div>' : ""}`
            : p.enviado
            ? `<span class="tag tag-nprazo">✅ Enviado${dataEnvioWhats(p) ? ` em ${dataEnvioWhats(p)}` : ""}</span> <button type="button" class="link-btn" data-enviar="${esc(p.id)}">reenviar</button>`
            : `<button type="button" class="btn ${p === proximo ? "btn-primary" : "btn-outline"} btn-sm" data-enviar="${esc(p.id)}">Enviar</button>`;
          const form =
            editando === p.id
              ? `<tr class="fila-contato"><td colspan="2"><div class="form-cols">
                  <div class="form-row"><label>WhatsApp</label><input type="tel" id="fc-whats" placeholder="(85) 90000-0000" value="${esc(p.whatsapp || "")}" /></div>
                  <div class="form-row"><label>E-mail</label><input type="email" id="fc-email" value="${esc((p.emails || [])[0] || "")}" /></div>
                </div>
                <div class="form-row"><label>Nome do contato <span class="sub">(opcional)</span></label><input type="text" id="fc-nome" value="${esc(p.contatoNome || "")}" /></div>
                <div class="sub" style="margin-bottom:6px;">O contato também fica salvo no cadastro da empresa no CRM.</div>
                <div id="fc-erro" class="form-erro hidden"></div>
                <div class="link-acoes"><button type="button" class="btn btn-primary btn-sm" id="fc-salvar">Salvar contato</button><button type="button" class="btn btn-outline btn-sm" id="fc-cancelar">Cancelar</button></div></td></tr>`
              : "";
          return `<tr class="${p === proximo ? "camp-proximo" : ""}">
            <td><strong>${esc(p.empresaNome || p.vagaTitulo)}</strong><div class="sub">${esc(p.vagaTitulo)}${p.contatoNome ? ` · ${esc(p.contatoNome)}` : ""}${temWhats(p) ? ` · ${esc(p.whatsapp)}` : ""}</div></td>
            <td style="white-space:nowrap;text-align:right;">${acao}</td>
          </tr>${form}`;
        })
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
        p.envios = [...p.envios, { canal: "whatsapp", em: new Date().toISOString(), ok: true }];
        api.post(`/api/nps/${p.id}/whatsapp`).catch(() => {});
        desenhar();
      })
    );
    document.querySelectorAll("[data-editar]").forEach((b) =>
      b.addEventListener("click", () => {
        editando = b.dataset.editar;
        desenhar();
        document.getElementById("fc-whats").focus();
      })
    );
    const salvar = document.getElementById("fc-salvar");
    if (salvar) {
      document.getElementById("fc-cancelar").addEventListener("click", () => {
        editando = null;
        desenhar();
      });
      salvar.addEventListener("click", async () => {
        const erro = document.getElementById("fc-erro");
        erro.classList.add("hidden");
        try {
          const r = await api.patch(`/api/nps/${editando}/contato`, {
            whatsapp: document.getElementById("fc-whats").value,
            email: document.getElementById("fc-email").value,
            contatoNome: document.getElementById("fc-nome").value,
          });
          const i = fila.findIndex((x) => x.id === editando);
          fila[i] = { ...r.pesquisa, enviado: r.pesquisa.envios.some((e) => e.canal === "whatsapp") };
          // mesma empresa, outras vagas: recebem o contato também
          (r.atualizadas || []).forEach((u) => {
            const k = fila.findIndex((x) => x.id === u.id);
            if (k >= 0) fila[k] = { ...u, enviado: u.envios.some((e) => e.canal === "whatsapp") };
          });
          editando = null;
          showToast(`Contato salvo${r.email ? (r.email.ok ? " e pesquisa enviada por e-mail" : ` (e-mail não enviado: ${r.email.erro})`) : ""}. ${temWhats(fila[i]) ? "Agora é só clicar em Enviar." : ""}`, r.email && !r.email.ok ? "erro" : "sucesso");
          desenhar();
        } catch (e) {
          erro.textContent = e.message;
          erro.classList.remove("hidden");
        }
      });
    }
  };
  desenhar();
}

/** Contato da pesquisa (fora da fila: botão "✏️ Adicionar contato" na lista). */
function editarContato(id, aoMudar) {
  abrirModal(`<h2>✏️ Contato do cliente</h2>
    <div class="form-cols">
      <div class="form-row"><label>WhatsApp</label><input type="tel" id="ec-whats" placeholder="(85) 90000-0000" /></div>
      <div class="form-row"><label>E-mail</label><input type="email" id="ec-email" /></div>
    </div>
    <div class="form-row"><label>Nome do contato <span class="sub">(opcional)</span></label><input type="text" id="ec-nome" /></div>
    <div class="sub">O contato também fica salvo no cadastro da empresa no CRM.</div>
    <div id="ec-erro" class="form-erro hidden"></div>
    <div class="modal-close-row"><button type="button" class="btn btn-outline" id="ec-fechar">Fechar</button><button type="button" class="btn btn-primary" id="ec-salvar">Salvar contato</button></div>`);
  document.getElementById("ec-fechar").addEventListener("click", fecharModal);
  document.getElementById("ec-salvar").addEventListener("click", async () => {
    try {
      const r = await api.patch(`/api/nps/${id}/contato`, { whatsapp: document.getElementById("ec-whats").value, email: document.getElementById("ec-email").value, contatoNome: document.getElementById("ec-nome").value });
      fecharModal();
      showToast("Contato salvo. Agora já dá para enviar pelo WhatsApp.", "sucesso");
      if (aoMudar) aoMudar();
      if (temWhats(r.pesquisa) && confirm("Abrir o WhatsApp agora com a pesquisa pronta?")) {
        window.open(r.pesquisa.linkWhatsapp, "_blank", "noopener");
        api.post(`/api/nps/${id}/whatsapp`).then(() => aoMudar && aoMudar()).catch(() => {});
      }
    } catch (e) {
      const el = document.getElementById("ec-erro");
      el.textContent = e.message;
      el.classList.remove("hidden");
    }
  });
}

/** Cliente respondeu por mensagem (fora do link): a gestão registra a nota. */
function registrarResposta(id, aoMudar) {
  const CRIT = [["atendimento", "Atendimento"], ["qualidade", "Qualidade da seleção"], ["prazo", "Prazo"], ["atualizacao", "Atualização do processo"], ["consultor", "Consultor(a)"]];
  let nota = null;
  abrirModal(`<h2>📝 Registrar resposta do cliente</h2>
    <p class="sub">Use quando o cliente respondeu por mensagem (WhatsApp, ligação...) em vez de abrir o link. A resposta fica marcada como registrada por você.</p>
    <label>Nota de 0 a 10 (recomendaria a Evoé?) *</label>
    <div class="nps-escala-adm">${Array.from({ length: 11 }, (_, n) => `<button type="button" class="nota-btn" data-n="${n}">${n}</button>`).join("")}</div>
    <div class="sub" style="margin:10px 0 4px;">Notas dos critérios (1 a 5) — preencha só se o cliente informou:</div>
    <div class="form-cols">${CRIT.map(([k, rot]) => `<div class="form-row"><label>${rot}</label><select data-crit="${k}"><option value="">—</option>${[5, 4, 3, 2, 1].map((n) => `<option value="${n}">${n}</option>`).join("")}</select></div>`).join("")}</div>
    <div class="form-cols">
      <div class="form-row"><label>Quem respondeu</label><input type="text" id="rr-quem" /></div>
      <div class="form-row"><label>Por onde</label><select id="rr-canal"><option>WhatsApp</option><option>Ligação</option><option>E-mail</option><option>Pessoalmente</option></select></div>
    </div>
    <div class="form-row"><label>Comentário do cliente</label><textarea id="rr-feedback" rows="3" placeholder="Cole aqui o que o cliente escreveu"></textarea></div>
    <div id="rr-erro" class="form-erro hidden"></div>
    <div class="modal-close-row"><button type="button" class="btn btn-outline" id="rr-fechar">Fechar</button><button type="button" class="btn btn-primary" id="rr-salvar">Registrar resposta</button></div>`);
  document.querySelectorAll(".nota-btn").forEach((b) =>
    b.addEventListener("click", () => {
      nota = Number(b.dataset.n);
      document.querySelectorAll(".nota-btn").forEach((x) => x.classList.toggle("on", x === b));
    })
  );
  document.getElementById("rr-fechar").addEventListener("click", fecharModal);
  document.getElementById("rr-salvar").addEventListener("click", async () => {
    const erro = document.getElementById("rr-erro");
    if (nota === null) {
      erro.textContent = "Escolha a nota de 0 a 10.";
      return erro.classList.remove("hidden");
    }
    const criterios = {};
    document.querySelectorAll("[data-crit]").forEach((s) => s.value && (criterios[s.dataset.crit] = Number(s.value)));
    try {
      await api.post(`/api/nps/${id}/resposta-manual`, { nps: nota, criterios, respondente: document.getElementById("rr-quem").value, canal: document.getElementById("rr-canal").value, feedback: document.getElementById("rr-feedback").value });
      fecharModal();
      showToast("Resposta registrada.", "sucesso");
      if (aoMudar) aoMudar();
    } catch (e) {
      erro.textContent = e.message;
      erro.classList.remove("hidden");
    }
  });
}
