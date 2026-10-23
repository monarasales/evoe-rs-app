// CRM › Propostas (só Gestor): lista, editor da proposta (condições, vagas com valores
// calculados, textos de cada seção), PDF com a identidade visual, Word editável, status e
// "Modelo padrão" (o texto-base que toda proposta nova copia).
import { api } from "../api.js";
import { store, showToast, formatarData } from "../state.js";
import { abrirModal, fecharModal } from "../modal.js";
import { criarCombobox } from "../combobox.js";

const esc = (s) => {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
};
const brl = (n) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dinheiro = (v) => {
  let s = String(v == null ? "" : v).replace(/[^\d,.]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  return Number(s) || 0;
};
const moedaCampo = (n) => (n ? String(n).replace(".", ",") : "");
const TAG = { Rascunho: "tag-standby", Enviada: "tag-prospect-proposta", Aceita: "tag-prospect-fechado", Recusada: "tag-prospect-perdido", Arquivada: "tag-encerrada" };
const telWhats = (t) => {
  let d = String(t || "").replace(/\D/g, "").replace(/^0+/, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  return d.length >= 10 ? `55${d}` : "";
};

/** Mesmo cálculo do servidor (só para mostrar ao vivo enquanto edita). */
function calcular(p) {
  const taxa = (Number(p.percentual) || 0) / 100;
  const minimo = Number(p.salarioMinimo) || 0;
  const linhas = (p.vagas || []).filter((v) => v.cargo || v.salario).map((v) => {
    const salario = dinheiro(v.salario);
    const qtd = Math.max(1, parseInt(v.quantidade, 10) || 1);
    const calc = Math.round(salario * taxa * 100) / 100;
    const unit = Math.max(calc, minimo);
    return { unit, total: unit * qtd, minimo: calc < minimo };
  });
  return { linhas, total: linhas.reduce((s, l) => s + l.total, 0) };
}

/** Cria a proposta (a partir de empresa do CRM ou prospect) e abre o editor. */
export async function novaProposta(origem = {}, aoMudar = () => {}) {
  try {
    const p = await api.post("/api/propostas", origem);
    showToast(`Proposta nº ${p.numero} criada a partir do modelo padrão. Ajuste o que precisar.`, "sucesso");
    editor(p, { modo: "proposta", aoMudar });
  } catch (err) {
    showToast(err.message, "erro");
  }
}

function blocoSecoes(secoes, marcadores) {
  return `<div class="pp-marcadores sub">Marcadores que o sistema preenche: ${marcadores.map(([m, d]) => `<code title="${esc(d)}">${m}</code>`).join(" ")} · linha começando com “• ” vira item de lista.</div>
    ${secoes
      .map(
        (s, i) => `<div class="pp-secao" data-i="${i}">
          <div class="pp-secao-topo">
            <input type="text" class="pp-titulo" value="${esc(s.titulo)}" placeholder="${s.id === "carta" ? "(carta de apresentação — sem título)" : "Título da seção"}" />
            <label class="pp-chk"><input type="checkbox" class="pp-incluir" ${s.incluir !== false ? "checked" : ""} /> incluir</label>
            <label class="pp-chk"><input type="checkbox" class="pp-novapag" ${s.novaPagina ? "checked" : ""} /> nova página</label>
          </div>
          <textarea class="pp-texto" rows="${Math.min(14, Math.max(3, Math.ceil(s.texto.length / 90) + s.texto.split("\n").length))}">${esc(s.texto)}</textarea>
          ${s.tabelaVagas ? '<div class="sub">A tabela com as vagas e valores entra logo abaixo desta seção.</div>' : ""}
        </div>`
      )
      .join("")}`;
}

function lerSecoes(raiz, originais) {
  return [...raiz.querySelectorAll(".pp-secao")].map((el) => {
    const o = originais[Number(el.dataset.i)];
    return { ...o, titulo: el.querySelector(".pp-titulo").value, texto: el.querySelector(".pp-texto").value, incluir: el.querySelector(".pp-incluir").checked, novaPagina: el.querySelector(".pp-novapag").checked };
  });
}

/** Editor de proposta (modo "proposta") ou do modelo padrão (modo "modelo"). */
async function editor(p, { modo, aoMudar = () => {} }) {
  const ehModelo = modo === "modelo";
  const { marcadores } = await api.get("/api/propostas/modelo");
  let vagas = (p.vagas || []).map((v) => ({ ...v }));
  abrirModal(`
    <div class="pp-editor">
    <h2>${ehModelo ? "⚙️ Modelo padrão da proposta" : `📄 Proposta nº ${esc(p.numero)} <span class="tag ${TAG[p.status] || ""}">${esc(p.status)}</span>`}</h2>
    ${ehModelo ? '<div class="sub" style="margin-bottom:10px;">Toda proposta nova começa com estes textos e condições. Propostas já criadas não mudam.</div>' : ""}
    ${
      ehModelo
        ? ""
        : `<div class="section-title">Cliente</div>
      <div class="form-cols">
        <div class="form-row"><label>Empresa (cliente)</label><input type="text" id="pp-cliente" value="${esc(p.clienteNome)}" /></div>
        <div class="form-row"><label>Contato</label><input type="text" id="pp-contato" value="${esc(p.contatoNome)}" /></div>
      </div>
      <div class="form-cols">
        <div class="form-row"><label>WhatsApp</label><input type="tel" id="pp-whats" value="${esc(p.contatoWhatsapp)}" /></div>
        <div class="form-row"><label>E-mail</label><input type="email" id="pp-email" value="${esc(p.contatoEmail)}" /></div>
      </div>
      <div class="form-row" style="max-width:220px;"><label>Data da proposta</label><input type="date" id="pp-data" value="${esc(p.data)}" /></div>`
    }
    <div class="section-title">Condições</div>
    <div class="form-cols">
      <div class="form-row"><label>Taxa da proposta (%)</label><input type="text" inputmode="decimal" id="pp-pct" value="${esc(p.percentual)}" /></div>
      <div class="form-row"><label>Taxa de tabela (%)</label><input type="text" inputmode="decimal" id="pp-pct-tab" value="${esc(p.percentualTabela)}" /></div>
    </div>
    <div class="form-row"><label>Forma de pagamento</label><input type="text" id="pp-pag" value="${esc(p.pagamento)}" /></div>
    <div class="form-cols">
      <div class="form-row"><label>Garantia de reposição (dias)</label><input type="number" id="pp-garantia" value="${esc(p.garantiaDias)}" /></div>
      <div class="form-row"><label>Prazo de entrega (dias úteis)</label><input type="number" id="pp-prazo" value="${esc(p.prazoDias)}" /></div>
    </div>
    <div class="form-cols">
      <div class="form-row"><label>Validade da proposta (dias)</label><input type="number" id="pp-validade" value="${esc(p.validadeDias)}" /></div>
      <div class="form-row"><label>Salário mínimo vigente (R$)</label><input type="text" inputmode="decimal" id="pp-minimo" value="${esc(moedaCampo(p.salarioMinimo))}" /><div class="sub">Valor mínimo cobrado por vaga. Confira todo início de ano.</div></div>
    </div>
    ${
      ehModelo
        ? ""
        : `<div class="section-title">Vagas e investimento</div>
      <div id="pp-vagas"></div>
      <button type="button" class="btn btn-outline btn-sm" id="pp-add-vaga">+ Adicionar vaga</button>
      <div class="pp-total" id="pp-total"></div>`
    }
    <div class="section-title">Textos da proposta</div>
    <div id="pp-secoes">${blocoSecoes(p.secoes || [], marcadores)}</div>
    <div class="section-title">Assinatura e páginas</div>
    <div class="form-cols">
      <div class="form-row"><label>Nome na assinatura</label><input type="text" id="pp-ass-nome" value="${esc(p.assinaturaNome)}" /></div>
      <div class="form-row"><label>Cargo</label><input type="text" id="pp-ass-cargo" value="${esc(p.assinaturaCargo)}" /></div>
    </div>
    <div class="checkbox-row"><input type="checkbox" id="pp-parceiros" ${p.incluirParceiros !== false ? "checked" : ""} /><label for="pp-parceiros" style="margin:0;font-weight:400;">Incluir a página "Nossos parceiros"</label></div>
    <div id="pp-erro" class="form-erro hidden"></div>
    <div class="modal-close-row pp-acoes">
      ${ehModelo ? '<button type="button" class="btn btn-outline" id="pp-restaurar" style="margin-right:auto;">Restaurar texto original</button>' : `<button type="button" class="btn btn-outline" id="pp-arquivar" style="margin-right:auto;">${p.status === "Arquivada" ? "Desarquivar" : "Arquivar"}</button>`}
      <button type="button" class="btn btn-outline" id="pp-fechar">Fechar</button>
      ${ehModelo ? "" : '<button type="button" class="btn btn-outline" id="pp-word">⬇️ Word</button><button type="button" class="btn btn-secondary" id="pp-pdf">👁️ Salvar e ver PDF</button>'}
      <button type="button" class="btn btn-primary" id="pp-salvar">Salvar</button>
    </div>
    ${
      ehModelo
        ? ""
        : `<div class="pp-envio">
        <strong>Enviar ao cliente:</strong> baixe o PDF e anexe na conversa.
        <div class="link-acoes" style="margin-top:6px;">
          <a class="btn btn-outline btn-sm" id="pp-baixar" href="/api/propostas/${p.id}/pdf?baixar=1">⬇️ Baixar PDF</a>
          <a class="btn btn-outline btn-sm" id="pp-whats-link" target="_blank" rel="noopener">💬 Abrir conversa no WhatsApp</a>
          <button type="button" class="btn btn-primary btn-sm" id="pp-enviada">✅ Marcar como enviada</button>
          <button type="button" class="btn btn-outline btn-sm" id="pp-aceita">👍 Aceita</button>
          <button type="button" class="btn btn-outline btn-sm" id="pp-recusada">👎 Recusada</button>
        </div>
        ${p.prospectId ? '<div class="sub" style="margin-top:4px;">Ligada a um prospect do CRM: ao marcar como enviada, ele vai para "Proposta Enviada" com o valor total.</div>' : ""}
      </div>`
    }
    </div>`);
  const $ = (id) => document.getElementById(id);
  const erro = (m) => {
    $("pp-erro").textContent = m;
    $("pp-erro").classList.toggle("hidden", !m);
    if (m) $("pp-erro").scrollIntoView({ block: "nearest" });
  };
  const condicoes = () => ({ percentual: $("pp-pct").value, percentualTabela: $("pp-pct-tab").value, salarioMinimo: dinheiro($("pp-minimo").value), vagas });

  function desenharVagas() {
    if (ehModelo) return;
    $("pp-vagas").innerHTML = vagas.length
      ? `<div class="pp-vaga pp-vaga-cab sub"><span>Cargo</span><span>Salário (R$)</span><span>Qtd.</span><span>Valor por vaga</span><span></span></div>` +
        vagas
          .map(
            (v, i) => `<div class="pp-vaga" data-i="${i}">
              <input type="text" class="pv-cargo" value="${esc(v.cargo)}" placeholder="Cargo" />
              <input type="text" class="pv-salario" inputmode="decimal" value="${esc(moedaCampo(v.salario))}" placeholder="0,00" />
              <input type="number" class="pv-qtd" min="1" value="${esc(v.quantidade || 1)}" />
              <span class="pv-valor"></span>
              <button type="button" class="link-btn pv-rem" style="color:var(--danger);">remover</button></div>`
          )
          .join("")
      : '<div class="sub">Nenhuma vaga ainda. Adicione o cargo e o salário para calcular o investimento.</div>';
    $("pp-vagas").querySelectorAll(".pp-vaga[data-i]").forEach((linha) => {
      const i = Number(linha.dataset.i);
      linha.querySelector(".pv-cargo").addEventListener("input", (e) => (vagas[i].cargo = e.target.value));
      linha.querySelector(".pv-salario").addEventListener("input", (e) => ((vagas[i].salario = dinheiro(e.target.value)), atualizarTotais()));
      linha.querySelector(".pv-qtd").addEventListener("input", (e) => ((vagas[i].quantidade = e.target.value), atualizarTotais()));
      linha.querySelector(".pv-rem").addEventListener("click", () => (vagas.splice(i, 1), desenharVagas()));
    });
    atualizarTotais();
  }
  function atualizarTotais() {
    if (ehModelo) return;
    const c = calcular(condicoes());
    let j = 0;
    $("pp-vagas").querySelectorAll(".pp-vaga[data-i]").forEach((linha) => {
      const v = vagas[Number(linha.dataset.i)];
      const l = v.cargo || v.salario ? c.linhas[j++] : null;
      linha.querySelector(".pv-valor").innerHTML = l ? `${brl(l.unit)}${l.minimo ? ' <span class="sub" title="Ajustado ao salário mínimo">(mín.)</span>' : ""}` : "—";
    });
    $("pp-total").innerHTML = c.total ? `Total do investimento: <strong>${brl(c.total)}</strong>` : "";
  }
  if (!ehModelo) {
    desenharVagas();
    $("pp-add-vaga").addEventListener("click", () => {
      vagas.push({ cargo: "", salario: 0, quantidade: 1 });
      desenharVagas();
    });
    ["pp-pct", "pp-minimo"].forEach((id) => $(id).addEventListener("input", atualizarTotais));
    const atualizarWhats = () => {
      const nome = ($("pp-contato").value || "").trim().split(/\s+/)[0];
      const texto = `Olá${nome ? `, ${nome}` : ""}! Tudo bem? 😊\n\nAqui é a Monara, da Evoé Gestão & RH. Conforme conversamos, segue a nossa proposta de Recrutamento e Seleção (nº ${p.numero}).\n\nFico à disposição para qualquer dúvida. 💜`;
      $("pp-whats-link").href = `https://wa.me/${telWhats($("pp-whats").value)}?text=${encodeURIComponent(texto)}`;
    };
    ["pp-contato", "pp-whats"].forEach((id) => $(id).addEventListener("input", atualizarWhats));
    atualizarWhats();
  }

  const payload = () => ({
    ...(ehModelo
      ? {}
      : { clienteNome: $("pp-cliente").value, contatoNome: $("pp-contato").value, contatoWhatsapp: $("pp-whats").value, contatoEmail: $("pp-email").value, data: $("pp-data").value, vagas }),
    percentual: $("pp-pct").value,
    percentualTabela: $("pp-pct-tab").value,
    pagamento: $("pp-pag").value,
    garantiaDias: $("pp-garantia").value,
    prazoDias: $("pp-prazo").value,
    validadeDias: $("pp-validade").value,
    salarioMinimo: $("pp-minimo").value,
    assinaturaNome: $("pp-ass-nome").value,
    assinaturaCargo: $("pp-ass-cargo").value,
    incluirParceiros: $("pp-parceiros").checked,
    secoes: lerSecoes($("pp-secoes"), p.secoes || []),
  });
  const salvar = async () => {
    erro("");
    if (ehModelo) return api.put("/api/propostas/modelo", payload());
    const r = await api.patch(`/api/propostas/${p.id}`, payload());
    Object.assign(p, r);
    aoMudar();
    return r;
  };
  $("pp-fechar").addEventListener("click", fecharModal);
  $("pp-salvar").addEventListener("click", async () => {
    try {
      await salvar();
      showToast(ehModelo ? "Modelo padrão salvo." : "Proposta salva.", "sucesso");
      if (ehModelo) fecharModal();
    } catch (e) {
      erro(e.message);
    }
  });
  if (ehModelo) {
    $("pp-restaurar").addEventListener("click", async () => {
      if (!confirm("Voltar ao texto original do modelo? (O modelo atual fica guardado no histórico.)")) return;
      try {
        await api.put("/api/propostas/modelo", { restaurar: true });
        showToast("Modelo original restaurado.", "sucesso");
        fecharModal();
      } catch (e) {
        erro(e.message);
      }
    });
    return;
  }
  $("pp-pdf").addEventListener("click", async () => {
    const janela = window.open("about:blank", "_blank"); // abre já (navegador bloqueia janela aberta depois de esperar)
    try {
      await salvar();
      if (janela) janela.location = `/api/propostas/${p.id}/pdf?v=${Date.now()}`;
      else window.open(`/api/propostas/${p.id}/pdf`, "_blank");
    } catch (e) {
      if (janela) janela.close();
      erro(e.message);
    }
  });
  $("pp-word").addEventListener("click", async () => {
    try {
      await salvar();
      location.href = `/api/propostas/${p.id}/docx`;
    } catch (e) {
      erro(e.message);
    }
  });
  $("pp-baixar").addEventListener("click", async (ev) => {
    ev.preventDefault();
    try {
      await salvar();
      location.href = `/api/propostas/${p.id}/pdf?baixar=1`;
    } catch (e) {
      erro(e.message);
    }
  });
  const mudarStatus = async (status, aviso) => {
    try {
      await salvar();
      Object.assign(p, await api.post(`/api/propostas/${p.id}/status`, { status }));
      showToast(aviso, "sucesso");
      aoMudar();
      editor(p, { modo, aoMudar });
    } catch (e) {
      erro(e.message);
    }
  };
  $("pp-enviada").addEventListener("click", () => mudarStatus("Enviada", "Proposta marcada como enviada."));
  $("pp-aceita").addEventListener("click", () => mudarStatus("Aceita", "Proposta aceita! 🎉"));
  $("pp-recusada").addEventListener("click", () => mudarStatus("Recusada", "Proposta marcada como recusada."));
  $("pp-arquivar").addEventListener("click", () => mudarStatus(p.status === "Arquivada" ? "Rascunho" : "Arquivada", p.status === "Arquivada" ? "Proposta desarquivada." : "Proposta arquivada."));
}

export async function renderPropostas(conteudo) {
  conteudo.innerHTML = `
    <div class="view-header" style="margin-bottom:10px;">
      <div class="sub">Propostas comerciais com a identidade da Evoé: gere a partir de um cliente ou prospect, ajuste os textos e baixe em PDF ou Word.</div>
      <div class="link-acoes">
        <button class="btn btn-outline btn-sm" id="pp-modelo">⚙️ Modelo padrão</button>
        <button class="btn btn-primary btn-sm" id="pp-nova">+ Nova proposta</button>
      </div>
    </div>
    <div class="cand-filtros"><input type="search" id="pp-busca" class="input-toolbar" placeholder="🔍 Buscar por cliente ou número" /></div>
    <div id="pp-lista"><div class="empty-state">Carregando...</div></div>`;
  let lista = [];
  const desenhar = () => {
    const q = conteudo.querySelector("#pp-busca").value.trim().toLowerCase();
    const itens = lista.filter((p) => !q || `${p.clienteNome} ${p.numero}`.toLowerCase().includes(q));
    const el = conteudo.querySelector("#pp-lista");
    if (!itens.length) {
      el.innerHTML = `<div class="empty-state">${lista.length ? "Nenhuma proposta encontrada." : 'Nenhuma proposta ainda. Use "+ Nova proposta" ou o botão "📄 Proposta" em um cliente/prospect.'}</div>`;
      return;
    }
    el.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Nº</th><th>Cliente</th><th>Vagas</th><th>Total</th><th>Status</th><th>Data</th><th></th></tr></thead><tbody>${itens
      .map(
        (p) => `<tr data-id="${p.id}"><td><strong>${esc(p.numero)}</strong></td><td>${esc(p.clienteNome)}<div class="sub">${esc(p.contatoNome || "")}</div></td>
          <td>${(p.vagas || []).map((v) => esc(v.cargo)).join(", ") || "—"}</td><td>${p.calculo && p.calculo.total ? brl(p.calculo.total) : "—"}</td>
          <td><span class="tag ${TAG[p.status] || ""}">${esc(p.status)}</span></td><td>${formatarData(p.data)}</td>
          <td class="link-acoes"><a class="btn btn-outline btn-sm" href="/api/propostas/${p.id}/pdf" target="_blank" rel="noopener">PDF</a><button class="btn btn-outline btn-sm" data-abrir="${p.id}">Abrir</button></td></tr>`
      )
      .join("")}</tbody></table></div>`;
    el.querySelectorAll("[data-abrir]").forEach((b) => b.addEventListener("click", () => editor(lista.find((p) => p.id === b.dataset.abrir), { modo: "proposta", aoMudar: carregar })));
  };
  async function carregar() {
    lista = await api.get("/api/propostas");
    desenhar();
  }
  conteudo.querySelector("#pp-busca").addEventListener("input", desenhar);
  conteudo.querySelector("#pp-modelo").addEventListener("click", async () => {
    const { modelo } = await api.get("/api/propostas/modelo");
    editor(modelo, { modo: "modelo" });
  });
  conteudo.querySelector("#pp-nova").addEventListener("click", () => escolherCliente(carregar));
  await carregar();
}

/** Nova proposta: escolher cliente do CRM, prospect ou digitar um nome. */
async function escolherCliente(aoMudar) {
  const prospects = await api.get("/api/prospects").catch(() => []);
  abrirModal(`
    <h2>+ Nova proposta</h2>
    <div class="form-row"><label>Cliente ou prospect do CRM</label><div id="np-cliente"></div></div>
    <div class="form-row"><label>ou digite o nome de um cliente novo</label><input type="text" id="np-nome" /></div>
    <div id="np-erro" class="form-erro hidden"></div>
    <div class="modal-close-row"><button type="button" class="btn btn-outline" id="np-fechar">Fechar</button><button type="button" class="btn btn-primary" id="np-criar">Criar proposta</button></div>`);
  let escolha = "";
  criarCombobox(document.getElementById("np-cliente"), {
    opcoes: [
      ...store.empresas.map((e) => ({ valor: `e:${e.id}`, rotulo: e.nome, detalhe: "Cliente" })),
      ...prospects.filter((p) => !["Fechado", "Perdido"].includes(p.etapa)).map((p) => ({ valor: `p:${p.id}`, rotulo: p.empresa || p.nome, detalhe: `Prospect · ${p.etapa}`, termos: [p.nome, p.empresa] })),
    ],
    opcaoVazia: "— escolha —",
    placeholder: "Digite o nome...",
    aoEscolher: (v) => (escolha = v),
  });
  document.getElementById("np-fechar").addEventListener("click", fecharModal);
  document.getElementById("np-criar").addEventListener("click", () => {
    const nome = document.getElementById("np-nome").value.trim();
    if (!escolha && !nome) {
      const e = document.getElementById("np-erro");
      e.textContent = "Escolha um cliente/prospect ou digite o nome.";
      e.classList.remove("hidden");
      return;
    }
    const origem = escolha.startsWith("e:") ? { empresaId: escolha.slice(2) } : escolha.startsWith("p:") ? { prospectId: escolha.slice(2) } : { clienteNome: nome };
    novaProposta(origem, aoMudar);
  });
}
