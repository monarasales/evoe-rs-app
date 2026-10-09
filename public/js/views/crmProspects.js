// CRM › Prospects: funil comercial de quem pediu cotação (seleção, implantação de RH...).
// Indicadores no topo, funil por etapa (arrastar card muda a etapa) ou lista, busca,
// botão de WhatsApp, histórico de interações, lembrete de follow-up, importação em lote
// (ex.: contatos levantados no WhatsApp) e "converter em cliente" (cria a empresa).
import { api } from "../api.js";
import { store, showToast, formatarData } from "../state.js";
import { abrirModal, fecharModal } from "../modal.js";
import { lerTelefone, primeiroNome } from "../retornoCandidato.js";

const esc = (s) => {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
};
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const reais = (n) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const hoje = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const FINAIS = ["Fechado", "Perdido"];
const CANAIS = ["WhatsApp", "Ligação", "Reunião", "E-mail", "Visita", "Anotação"];
const TAG_ETAPA = {
  Novo: "tag-prospect-novo",
  "Em Contato": "tag-prospect-contato",
  "Proposta Enviada": "tag-prospect-proposta",
  "Negociação": "tag-prospect-proposta",
  Fechado: "tag-prospect-fechado",
  Perdido: "tag-prospect-perdido",
};
const ICONE_TEMP = { Quente: "🔥", Morno: "🌤️", Frio: "❄️" };

const servicoDe = (p) => (p.servicoDesejado === "Outro" && p.servicoOutro ? p.servicoOutro : p.servicoDesejado);
const followAtrasado = (p) => p.proximoFollowUp && p.proximoFollowUp < hoje() && !FINAIS.includes(p.etapa);
const followHoje = (p) => p.proximoFollowUp && p.proximoFollowUp <= hoje() && !FINAIS.includes(p.etapa);

function linkWhats(p) {
  const { numero } = lerTelefone(p.telefone);
  if (!numero) return "";
  const eu = primeiroNome(store.usuario && store.usuario.nome);
  const texto = `Olá, ${primeiroNome(p.nome)}! Tudo bem? ${eu ? `Aqui é ${eu}, da` : "Aqui é da"} Evoé Gestão & RH.`;
  return `<a class="btn-whats" href="https://wa.me/55${numero}?text=${encodeURIComponent(texto)}" target="_blank" rel="noopener" title="Conversar no WhatsApp">WhatsApp</a>`;
}

export async function renderProspects(conteudo) {
  conteudo.innerHTML = '<div class="empty-state">Carregando...</div>';
  let opcoes = await api.get("/api/prospects/opcoes");
  let lista = [];
  const filtro = { busca: "", etapa: "", temperatura: "", followup: false };
  let modo = (() => {
    try {
      return localStorage.getItem("evoe_crm_modo") || "funil";
    } catch (e) {
      return "funil";
    }
  })();

  conteudo.innerHTML = `
    <div class="view-header" style="margin-bottom:10px;">
      <div class="sub">Todo mundo que entra em contato querendo cotar um serviço — para você fazer o follow-up.</div>
      <div class="link-acoes">
        <button id="pr-importar" class="btn btn-outline btn-sm">📥 Importar contatos</button>
        <button id="pr-novo" class="btn btn-primary btn-sm">+ Novo Prospect</button>
      </div>
    </div>
    <div id="pr-kpis" class="crm-kpis"></div>
    <div class="kanban-toolbar crm-toolbar">
      <input type="search" id="pr-busca" class="input-toolbar" placeholder="🔍 Buscar nome, empresa, telefone, cargo..." />
      <select id="pr-etapa"><option value="">Todas as etapas</option>${opcoes.etapas.map((e) => `<option>${esc(e)}</option>`).join("")}</select>
      <select id="pr-temp"><option value="">Toda temperatura</option>${opcoes.temperaturas.map((t) => `<option>${esc(t)}</option>`).join("")}</select>
      <div class="view-toggle"><button type="button" data-modo="funil">Funil</button><button type="button" data-modo="lista">Lista</button></div>
    </div>
    <div id="pr-filtro-follow" class="sub" hidden></div>
    <div id="pr-corpo"></div>`;
  const $ = (id) => conteudo.querySelector(`#${id}`);

  async function carregar() {
    lista = await api.get("/api/prospects");
    desenhar();
  }

  function filtrados() {
    const q = norm(filtro.busca);
    const qd = filtro.busca.replace(/\D/g, "");
    return lista.filter((p) => {
      if (filtro.etapa && p.etapa !== filtro.etapa) return false;
      if (filtro.temperatura && p.temperatura !== filtro.temperatura) return false;
      if (filtro.followup && !followHoje(p)) return false;
      if (!q) return true;
      const alvo = norm([p.nome, p.empresa, p.email, p.cargos, p.quemIndicou, p.observacoes, servicoDe(p)].join(" "));
      return alvo.includes(q) || (qd.length >= 4 && String(p.telefone || "").replace(/\D/g, "").includes(qd));
    });
  }

  function desenharKpis() {
    const abertos = lista.filter((p) => !FINAIS.includes(p.etapa));
    const valorAberto = abertos.reduce((s, p) => s + (Number(p.valorProposta) || 0), 0);
    const pend = abertos.filter(followHoje).length;
    const atras = abertos.filter(followAtrasado).length;
    const fech = lista.filter((p) => p.etapa === "Fechado").length;
    const perd = lista.filter((p) => p.etapa === "Perdido").length;
    const mes = hoje().slice(0, 7);
    const fechMes = lista.filter((p) => p.etapa === "Fechado" && String(p.encerradoEm || p.convertidoEm || p.updatedAt || "").slice(0, 7) === mes);
    $("pr-kpis").innerHTML = `
      <div class="kpi-card crm-kpi"><div class="kpi-label">Em aberto</div><div class="kpi-value">${abertos.length}</div><div class="sub">${abertos.filter((p) => p.temperatura === "Quente").length} quente(s) 🔥</div></div>
      <div class="kpi-card crm-kpi"><div class="kpi-label">Valor em negociação</div><div class="kpi-value">${reais(valorAberto)}</div><div class="sub">soma das propostas em aberto</div></div>
      <div class="kpi-card crm-kpi clicavel ${pend ? "crm-kpi-alerta" : ""}" id="pr-kpi-follow" title="Clique para ver só estes"><div class="kpi-label">Follow-up hoje</div><div class="kpi-value">${pend}</div><div class="sub">${atras ? `${atras} atrasado(s)` : "nenhum atrasado"}</div></div>
      <div class="kpi-card crm-kpi"><div class="kpi-label">Conversão</div><div class="kpi-value">${fech + perd ? Math.round((fech / (fech + perd)) * 100) : 0}%</div><div class="sub">${fech} fechado(s) · ${perd} perdido(s)</div></div>
      <div class="kpi-card crm-kpi"><div class="kpi-label">Fechados no mês</div><div class="kpi-value">${fechMes.length}</div><div class="sub">${reais(fechMes.reduce((s, p) => s + (Number(p.valorProposta) || 0), 0))}</div></div>`;
    $("pr-kpi-follow").addEventListener("click", () => {
      filtro.followup = !filtro.followup;
      desenhar();
    });
  }

  function cartao(p) {
    const atras = followAtrasado(p);
    return `<div class="crm-card" draggable="true" data-id="${p.id}">
      <div class="crm-card-topo"><strong>${esc(p.empresa || p.nome)}</strong>${p.temperatura ? `<span title="${esc(p.temperatura)}">${ICONE_TEMP[p.temperatura] || ""}</span>` : ""}</div>
      ${p.empresa ? `<div class="sub">${esc(p.nome)}</div>` : ""}
      <div class="sub">${esc(p.cargos || servicoDe(p))}${p.qtdVagas ? ` · ${p.qtdVagas} vaga(s)` : ""}</div>
      ${p.valorProposta ? `<div class="crm-valor">${reais(p.valorProposta)}</div>` : ""}
      <div class="crm-card-rodape">
        ${p.proximoFollowUp && !FINAIS.includes(p.etapa) ? `<span class="${atras ? "tag tag-atrasada" : "sub"}">📅 ${formatarData(p.proximoFollowUp)}</span>` : "<span></span>"}
        ${linkWhats(p)}
      </div>
    </div>`;
  }

  function desenhar() {
    desenharKpis();
    const itens = filtrados();
    conteudo.querySelectorAll(".view-toggle button").forEach((b) => b.classList.toggle("ativo", b.dataset.modo === modo));
    const ff = $("pr-filtro-follow");
    ff.hidden = !filtro.followup;
    ff.innerHTML = filtro.followup ? 'Mostrando só follow-ups para hoje ou atrasados. <button type="button" class="link-btn" id="pr-limpar-follow">Ver todos</button>' : "";
    if (filtro.followup)
      $("pr-limpar-follow").addEventListener("click", () => {
        filtro.followup = false;
        desenhar();
      });
    const corpo = $("pr-corpo");
    if (!lista.length) {
      corpo.innerHTML = '<div class="empty-state">Nenhum prospect por aqui ainda. Use "+ Novo Prospect" ou "📥 Importar contatos".</div>';
      return;
    }
    if (modo === "funil") {
      const etapas = filtro.etapa ? [filtro.etapa] : opcoes.etapas;
      corpo.innerHTML = `<div class="crm-funil">${etapas
        .map((e) => {
          const da = itens.filter((p) => p.etapa === e).sort((a, b) => (a.proximoFollowUp || "9999") < (b.proximoFollowUp || "9999") ? -1 : 1);
          const soma = da.reduce((s, p) => s + (Number(p.valorProposta) || 0), 0);
          return `<div class="crm-coluna" data-etapa="${esc(e)}">
            <div class="crm-coluna-topo"><span class="tag ${TAG_ETAPA[e] || ""}">${esc(e)}</span> <strong>${da.length}</strong>${soma ? `<div class="sub">${reais(soma)}</div>` : ""}</div>
            <div class="crm-coluna-cards">${da.map(cartao).join("") || '<div class="sub crm-vazio">—</div>'}</div>
          </div>`;
        })
        .join("")}</div>`;
      ligarArrastar(corpo);
    } else {
      const ord = itens.slice().sort((a, b) => ((a.proximoFollowUp || "9999") < (b.proximoFollowUp || "9999") ? -1 : 1));
      corpo.innerHTML = `<div class="table-wrap"><table>
        <thead><tr><th>Contato</th><th>Serviço / cargos</th><th>Valor</th><th>Origem</th><th>Etapa</th><th>Próximo follow-up</th><th></th></tr></thead>
        <tbody>${ord
          .map(
            (p) => `<tr data-id="${p.id}">
              <td><strong>${esc(p.empresa || p.nome)}</strong> ${p.temperatura ? ICONE_TEMP[p.temperatura] : ""}<div class="sub">${p.empresa ? `${esc(p.nome)} · ` : ""}${esc(p.telefone || "")} ${linkWhats(p)}</div></td>
              <td>${esc(servicoDe(p))}${p.cargos ? `<div class="sub">${esc(p.cargos)}</div>` : ""}</td>
              <td>${p.valorProposta ? reais(p.valorProposta) : "—"}</td>
              <td>${esc(p.origem || "—")}${p.quemIndicou ? `<div class="sub">por ${esc(p.quemIndicou)}</div>` : ""}</td>
              <td><span class="tag ${TAG_ETAPA[p.etapa] || ""}">${esc(p.etapa)}</span>${p.etapa === "Perdido" && p.motivoPerda ? `<div class="sub">${esc(p.motivoPerda)}</div>` : ""}</td>
              <td>${p.proximoFollowUp && !FINAIS.includes(p.etapa) ? `<span class="${followAtrasado(p) ? "tag tag-atrasada" : ""}">${formatarData(p.proximoFollowUp)}</span>` : "—"}</td>
              <td><button class="btn btn-outline btn-sm" data-abrir="${p.id}">Abrir</button></td>
            </tr>`
          )
          .join("")}</tbody></table></div>`;
    }
    corpo.querySelectorAll(".crm-card, [data-abrir]").forEach((el) =>
      el.addEventListener("click", (ev) => {
        if (ev.target.closest("a")) return; // clique no WhatsApp não abre a ficha
        abrir(lista.find((p) => p.id === (el.dataset.id || el.dataset.abrir)));
      })
    );
  }

  // Arrastar o card para outra coluna muda a etapa ("Perdido" pede o motivo na ficha).
  function ligarArrastar(corpo) {
    corpo.querySelectorAll(".crm-card").forEach((c) => c.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/plain", c.dataset.id)));
    corpo.querySelectorAll(".crm-coluna").forEach((col) => {
      col.addEventListener("dragover", (e) => {
        e.preventDefault();
        col.classList.add("crm-coluna-alvo");
      });
      col.addEventListener("dragleave", () => col.classList.remove("crm-coluna-alvo"));
      col.addEventListener("drop", async (e) => {
        e.preventDefault();
        col.classList.remove("crm-coluna-alvo");
        const p = lista.find((x) => x.id === e.dataTransfer.getData("text/plain"));
        const etapa = col.dataset.etapa;
        if (!p || p.etapa === etapa) return;
        if (etapa === "Perdido") return abrir(p, { etapa: "Perdido" });
        try {
          Object.assign(p, await api.patch(`/api/prospects/${p.id}`, { etapa }));
          desenhar();
          showToast(`${p.empresa || p.nome}: ${etapa}.`, "sucesso");
        } catch (err) {
          showToast(err.message, "erro");
        }
      });
    });
  }

  function abrir(p, preset = {}) {
    const ed = !!p;
    const v = (k) => esc(ed ? p[k] || "" : "");
    const etapaAtual = preset.etapa || (ed ? p.etapa : "Novo");
    const sel = (id, ops, atual, vazio) => `<select id="${id}">${vazio !== undefined ? `<option value="">${vazio}</option>` : ""}${ops.map((o) => `<option ${o === atual ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
    const interacoes = ed ? (p.interacoes || []).slice().reverse() : [];
    abrirModal(`
      <h2>${ed ? esc(p.empresa || p.nome) : "Novo Prospect"}</h2>
      ${ed && p.empresaId ? '<div class="funil-final aprovado" style="margin-bottom:10px;">✅ Virou cliente — empresa cadastrada em Clientes.</div>' : ""}
      <form id="form-prospect">
        <div class="form-cols">
          <div class="form-row"><label>Nome da pessoa de contato *</label><input type="text" id="p-nome" required value="${v("nome")}" /></div>
          <div class="form-row"><label>Empresa</label><input type="text" id="p-empresa" value="${v("empresa")}" /></div>
        </div>
        <div class="form-cols">
          <div class="form-row"><label>Telefone / WhatsApp</label><input type="tel" id="p-telefone" value="${v("telefone")}" placeholder="(85) 90000-0000" /><div class="sub" id="p-tel-whats" style="margin-top:4px;"></div></div>
          <div class="form-row"><label>E-mail</label><input type="email" id="p-email" value="${v("email")}" /></div>
        </div>
        <div class="form-cols">
          <div class="form-row"><label>Como chegou</label>${sel("p-origem", opcoes.origens, ed ? p.origem : "WhatsApp", "—")}</div>
          <div class="form-row"><label>Quem nos indicou</label><input type="text" id="p-indicou" value="${v("quemIndicou")}" /></div>
        </div>
        <div class="form-cols">
          <div class="form-row"><label>Serviço que deseja</label>${sel("p-servico", opcoes.servicos, ed ? p.servicoDesejado : opcoes.servicos[0])}</div>
          <div class="form-row" id="p-row-outro"><label>Qual serviço</label><input type="text" id="p-servico-outro" value="${v("servicoOutro")}" /></div>
        </div>
        <div class="form-cols">
          <div class="form-row"><label>Cargo(s) a contratar</label><input type="text" id="p-cargos" value="${v("cargos")}" placeholder="ex.: 2 vendedores, 1 auxiliar administrativo" /></div>
          <div class="form-row"><label>Quantidade de vagas</label><input type="number" id="p-qtd" min="0" value="${ed && p.qtdVagas ? p.qtdVagas : ""}" /></div>
        </div>
        <div class="form-cols">
          <div class="form-row"><label>Valor da proposta (R$)</label><input type="text" id="p-valor" inputmode="decimal" value="${ed && p.valorProposta ? String(p.valorProposta).replace(".", ",") : ""}" placeholder="ex.: 1.500,00" /></div>
          <div class="form-row"><label>Temperatura</label>${sel("p-temp", opcoes.temperaturas, ed ? p.temperatura : "", "—")}</div>
        </div>
        <div class="form-cols">
          <div class="form-row"><label>Etapa</label>${sel("p-etapa", opcoes.etapas, etapaAtual)}</div>
          <div class="form-row"><label>Data do primeiro contato</label><input type="date" id="p-data-contato" value="${ed ? p.dataContato || "" : hoje()}" /></div>
        </div>
        <div class="form-row"><label>Próximo follow-up</label><input type="date" id="p-follow" value="${ed ? p.proximoFollowUp || "" : ""}" /></div>
        <div class="form-cols" id="p-row-perda">
          <div class="form-row"><label>Motivo da perda</label>${sel("p-motivo-perda", opcoes.motivosPerda, ed ? p.motivoPerda : "", "Escolha...")}</div>
          <div class="form-row"><label>Detalhe <span class="sub">(opcional)</span></label><input type="text" id="p-motivo" value="${v("motivoNaoFechou")}" /></div>
        </div>
        <div class="form-row"><label>Observações</label><textarea id="p-obs" rows="3">${v("observacoes")}</textarea></div>
        ${
          ed
            ? `<div class="section-title">Histórico de contatos</div>
              <div class="crm-interacao-nova">
                <div class="form-cols">
                  <div class="form-row"><label>Canal</label>${sel("i-canal", CANAIS, "WhatsApp")}</div>
                  <div class="form-row"><label>Próximo follow-up <span class="sub">(opcional)</span></label><input type="date" id="i-follow" /></div>
                </div>
                <div class="form-row"><textarea id="i-texto" rows="2" placeholder="O que foi conversado? Ex.: pediu proposta para 2 vendedores, retorno na sexta."></textarea></div>
                <button type="button" class="btn btn-secondary btn-sm" id="i-salvar">Registrar contato</button>
              </div>
              <ul class="funil-historico" id="i-lista">${
                interacoes.length
                  ? interacoes.map((i) => `<li><strong>${esc(i.canal)}</strong> · ${new Date(i.em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · ${esc(i.por)}<div>${esc(i.texto)}</div></li>`).join("")
                  : '<li class="sub">Nenhum contato registrado ainda.</li>'
              }</ul>
              ${(p.historicoEtapas || []).length ? `<details><summary class="sub">Histórico de etapas</summary><ul class="funil-historico">${p.historicoEtapas.slice().reverse().map((h) => `<li>${esc(h.de)} → <strong>${esc(h.para)}</strong> · ${new Date(h.em).toLocaleDateString("pt-BR")} · ${esc(h.por)}</li>`).join("")}</ul></details>` : ""}`
            : ""
        }
        <div id="prospect-form-erro" class="form-erro hidden"></div>
        <div class="modal-close-row">
          ${ed ? '<button type="button" id="p-excluir" class="btn btn-danger" style="margin-right:auto;">Excluir</button>' : ""}
          ${ed && !p.empresaId ? '<button type="button" id="p-converter" class="btn btn-secondary">✅ Fechou! Virar cliente</button>' : ""}
          <button type="button" id="p-fechar" class="btn btn-outline">Fechar</button>
          <button type="submit" class="btn btn-primary">${ed ? "Salvar" : "Criar prospect"}</button>
        </div>
      </form>`);
    const $m = (id) => document.getElementById(id);
    const erro = (msg) => {
      $m("prospect-form-erro").innerHTML = msg;
      $m("prospect-form-erro").classList.toggle("hidden", !msg);
    };
    const visOutro = () => ($m("p-row-outro").style.display = $m("p-servico").value === "Outro" ? "" : "none");
    const visPerda = () => ($m("p-row-perda").style.display = $m("p-etapa").value === "Perdido" ? "" : "none");
    const visWhats = () => ($m("p-tel-whats").innerHTML = linkWhats({ ...(p || {}), nome: $m("p-nome").value, telefone: $m("p-telefone").value }));
    $m("p-servico").addEventListener("change", visOutro);
    $m("p-etapa").addEventListener("change", visPerda);
    $m("p-telefone").addEventListener("input", visWhats);
    visOutro();
    visPerda();
    visWhats();
    $m("p-fechar").addEventListener("click", fecharModal);
    const recarregarFicha = async (atual) => {
      Object.assign(p, atual);
      await carregar();
      abrir(lista.find((x) => x.id === p.id));
    };
    if (ed) {
      $m("p-excluir").addEventListener("click", async () => {
        if (!confirm(`Excluir o prospect "${p.nome}"? Essa ação não pode ser desfeita.`)) return;
        try {
          await api.del(`/api/prospects/${p.id}`);
          showToast("Prospect excluído.", "sucesso");
          fecharModal();
          carregar();
        } catch (err) {
          showToast(err.message, "erro");
        }
      });
      $m("i-salvar").addEventListener("click", async () => {
        try {
          const corpo = { canal: $m("i-canal").value, texto: $m("i-texto").value };
          if ($m("i-follow").value) corpo.proximoFollowUp = $m("i-follow").value;
          await recarregarFicha(await api.post(`/api/prospects/${p.id}/interacoes`, corpo));
          showToast("Contato registrado.", "sucesso");
        } catch (err) {
          erro(esc(err.message));
        }
      });
      const conv = $m("p-converter");
      if (conv)
        conv.addEventListener("click", async () => {
          if (!confirm(`Marcar "${p.empresa || p.nome}" como Fechado e cadastrar a empresa em Clientes?`)) return;
          try {
            const r = await api.post(`/api/prospects/${p.id}/converter`);
            if (!store.empresas.some((e) => e.id === r.empresa.id)) store.empresas.push(r.empresa);
            await recarregarFicha(r.prospect);
            showToast(`"${r.empresa.nome}" agora é cliente. Complete CNPJ e endereço na aba Clientes.`, "sucesso");
          } catch (err) {
            erro(esc(err.message));
          }
        });
    }
    $m("form-prospect").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if ($m("p-etapa").value === "Perdido" && !$m("p-motivo-perda").value) return erro("Escolha o motivo da perda — ajuda a entender por que não fechamos.");
      const payload = {
        nome: $m("p-nome").value,
        empresa: $m("p-empresa").value,
        telefone: $m("p-telefone").value,
        email: $m("p-email").value,
        origem: $m("p-origem").value,
        quemIndicou: $m("p-indicou").value,
        servicoDesejado: $m("p-servico").value,
        servicoOutro: $m("p-servico-outro").value,
        cargos: $m("p-cargos").value,
        qtdVagas: $m("p-qtd").value,
        valorProposta: $m("p-valor").value,
        temperatura: $m("p-temp").value,
        etapa: $m("p-etapa").value,
        dataContato: $m("p-data-contato").value,
        proximoFollowUp: $m("p-follow").value,
        motivoPerda: $m("p-motivo-perda").value,
        motivoNaoFechou: $m("p-motivo").value,
        observacoes: $m("p-obs").value,
      };
      try {
        if (ed) await api.patch(`/api/prospects/${p.id}`, payload);
        else await api.post("/api/prospects", payload);
        showToast("Prospect salvo.", "sucesso");
        fecharModal();
        carregar();
      } catch (err) {
        erro(esc(err.message));
      }
    });
  }

  // ---------- Importar contatos (colar uma lista) ----------
  function importar() {
    abrirModal(`
      <h2>📥 Importar contatos</h2>
      <div class="sub" style="margin-bottom:8px;">Cole uma linha por contato, separando por <strong>;</strong> ou <strong>|</strong> (ou colunas copiadas de uma planilha):<br>
      <code>Nome ; Empresa ; Telefone ; O que pediu / resumo da conversa ; Valor</code><br>
      Só o nome ou o telefone são obrigatórios. Telefone já cadastrado não duplica: o resumo entra no histórico do prospect.</div>
      <div class="form-row"><textarea id="im-texto" rows="9" placeholder="Carla Mendes ; Transportes Boa Viagem ; (85) 99999-0000 ; quer 2 motoristas, perguntou o valor da seleção ; 1.500"></textarea></div>
      <div class="form-cols">
        <div class="form-row"><label>Origem</label><select id="im-origem">${opcoes.origens.map((o) => `<option>${esc(o)}</option>`).join("")}</select></div>
        <div class="form-row"><label>Serviço</label><select id="im-servico">${opcoes.servicos.map((o) => `<option>${esc(o)}</option>`).join("")}</select></div>
      </div>
      <div id="im-previa"></div>
      <div id="im-erro" class="form-erro hidden"></div>
      <div class="modal-close-row">
        <button type="button" id="im-fechar" class="btn btn-outline">Fechar</button>
        <button type="button" id="im-enviar" class="btn btn-primary" disabled>Importar</button>
      </div>`);
    const $m = (id) => document.getElementById(id);
    let linhas = [];
    const ler = () => {
      linhas = $m("im-texto")
        .value.split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const partes = l.split(/[;|\t]/).map((x) => x.trim()); // cada tab é uma coluna (planilha com célula vazia)
          const iTel = partes.findIndex((x) => x.replace(/\D/g, "").length >= 10 && /^[\d\s()+.-]+$/.test(x));
          const telefone = iTel >= 0 ? partes.splice(iTel, 1)[0] : "";
          const iValor = partes.findIndex((x, i) => i > 0 && /^(R\$\s*)?\d[\d.]*(,\d{1,2})?$/.test(x));
          const valorProposta = iValor >= 0 ? partes.splice(iValor, 1)[0] : "";
          const [nome = "", empresa = "", ...resto] = partes;
          return { nome, empresa, telefone, resumo: resto.join(" — "), valorProposta };
        });
      $m("im-enviar").disabled = !linhas.length;
      $m("im-enviar").textContent = linhas.length ? `Importar ${linhas.length} contato(s)` : "Importar";
      $m("im-previa").innerHTML = linhas.length
        ? `<div class="table-wrap"><table><thead><tr><th>Nome</th><th>Empresa</th><th>Telefone</th><th>Resumo</th><th>Valor</th></tr></thead><tbody>${linhas
            .slice(0, 50)
            .map((l) => `<tr><td>${esc(l.nome)}</td><td>${esc(l.empresa)}</td><td>${esc(l.telefone)}</td><td class="sub">${esc(l.resumo)}</td><td>${esc(l.valorProposta)}</td></tr>`)
            .join("")}</tbody></table></div>${linhas.length > 50 ? `<div class="sub">... e mais ${linhas.length - 50}</div>` : ""}`
        : "";
    };
    $m("im-texto").addEventListener("input", ler);
    $m("im-fechar").addEventListener("click", fecharModal);
    $m("im-enviar").addEventListener("click", async () => {
      try {
        const r = await api.post("/api/prospects/importar", {
          prospects: linhas.map((l) => ({ ...l, origem: $m("im-origem").value, servicoDesejado: $m("im-servico").value })),
        });
        fecharModal();
        showToast(`${r.criados} novo(s) prospect(s)${r.atualizados ? ` · ${r.atualizados} já existia(m) (histórico atualizado)` : ""}.`, "sucesso");
        carregar();
      } catch (err) {
        $m("im-erro").textContent = err.message;
        $m("im-erro").classList.remove("hidden");
      }
    });
  }

  $("pr-novo").addEventListener("click", () => abrir(null));
  $("pr-importar").addEventListener("click", importar);
  $("pr-busca").addEventListener("input", (e) => {
    filtro.busca = e.target.value;
    desenhar();
  });
  $("pr-etapa").addEventListener("change", (e) => {
    filtro.etapa = e.target.value;
    desenhar();
  });
  $("pr-temp").addEventListener("change", (e) => {
    filtro.temperatura = e.target.value;
    desenhar();
  });
  conteudo.querySelectorAll(".view-toggle button").forEach((b) =>
    b.addEventListener("click", () => {
      modo = b.dataset.modo;
      try {
        localStorage.setItem("evoe_crm_modo", modo);
      } catch (e) {
        /* sem armazenamento: só não lembra a escolha */
      }
      desenhar();
    })
  );
  await carregar();
}
