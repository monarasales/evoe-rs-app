import { api } from "../api.js";
import { formatarData, isGestor, store, showToast } from "../state.js";
import { abrirModal, fecharModal } from "../modal.js";
import { criarCombobox } from "../combobox.js";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function formatarReal(valor) {
  return (Number(valor) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function tagVencimento(dias) {
  if (dias === null) return '<span class="tag tag-encerrada">sem data</span>';
  if (dias < 0) return `<span class="tag tag-atrasada">vencida há ${Math.abs(dias)}d</span>`;
  if (dias === 0) return '<span class="tag tag-atraso">vence hoje</span>';
  if (dias <= 7) return `<span class="tag tag-atraso">em ${dias}d</span>`;
  return `<span class="tag tag-nprazo">em ${dias}d</span>`;
}

const hojeIso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const somarDias = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const telWhats = (t) => {
  let d = String(t || "").replace(/\D/g, "").replace(/^0+/, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  return d.length >= 10 ? `55${d}` : "";
};

/** Mensagem de cobrança (educada; muda se já venceu). */
function mensagemCobranca(p) {
  const nome = String(p.contatoNome || "").trim().split(/\s+/)[0];
  const venc = p.vencimento ? formatarData(p.vencimento) : "";
  return [
    `Olá${nome ? `, ${nome}` : ""}! Tudo bem? 😊`,
    p.situacao === "vencida"
      ? `Aqui é a Monara, da Evoé Gestão & RH. Passando para lembrar que a ${p.descricao}${p.vagaTitulo ? ` (vaga ${p.vagaTitulo})` : ""}, no valor de *${formatarReal(p.valor)}*, venceu em ${venc}. Pode me confirmar a previsão de pagamento?`
      : `Aqui é a Monara, da Evoé Gestão & RH. Passando para lembrar da ${p.descricao}${p.vagaTitulo ? ` (vaga ${p.vagaTitulo})` : ""}, no valor de *${formatarReal(p.valor)}*, com vencimento ${p.situacao === "hoje" ? "hoje" : `em ${venc}`}.`,
    "Qualquer dúvida, estou à disposição. Obrigada pela parceria! 💜",
  ].join("\n\n");
}

const FILTROS = [
  ["cobrar", "⚠️ Cobrar agora"],
  ["prox7", "Próximos 7 dias"],
  ["prox30", "Próximos 30 dias"],
  ["abertas", "Todas a receber"],
  ["pagas", "Recebidas"],
];
const SIT = {
  vencida: (p) => `<span class="tag tag-atrasada">vencida há ${-p.dias}d</span>`,
  hoje: () => '<span class="tag tag-atraso">vence hoje</span>',
  a_vencer: (p) => (p.dias <= 7 ? `<span class="tag tag-atraso">em ${p.dias}d</span>` : `<span class="tag tag-nprazo">em ${p.dias}d</span>`),
  sem_data: () => '<span class="tag tag-encerrada">sem vencimento</span>',
  paga: (p) => `<span class="tag tag-prospect-fechado">✅ recebida${p.pagamento && p.pagamento.em ? ` ${formatarData(p.pagamento.em)}` : ""}</span>${p.pagamento && p.pagamento.presumido ? '<div class="sub">presumida (paga na assinatura)</div>' : ""}`,
};

export async function renderFinanceiro(root) {
  if (!isGestor()) {
    root.innerHTML = '<div class="empty-state">Esta área é restrita ao perfil Gestor.</div>';
    return;
  }
  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Financeiro</h2>
        <div class="sub">Contas a receber: todas as parcelas dos clientes, com lembrete de cobrança até o pagamento.</div>
      </div>
      <button type="button" class="btn btn-primary btn-sm" id="cr-lancar">+ Lançar parcelas</button>
    </div>
    <div class="cr-kpis" id="cr-kpis"></div>
    <div class="funil-chips" id="cr-filtros"></div>
    <div id="cr-lista"><div class="empty-state">Carregando...</div></div>
    <details class="card" style="margin-top:18px;"><summary><strong>Contratos de vagas em aberto (faturamento)</strong></summary><div id="cr-antigo" style="margin-top:10px;"></div></details>
  `;
  let filtro = "cobrar";
  let dados = null;
  const $ = (id) => root.querySelector(`#${id}`);

  async function carregar() {
    dados = await api.get("/api/financeiro/parcelas");
    const r = dados.resumo;
    const kpi = (rot, v, sub, cls = "") => `<div class="kpi-card ${cls}"><div class="kpi-label">${rot}</div><div class="kpi-value">${formatarReal(v.valor)}</div><div class="sub">${sub}</div></div>`;
    $("cr-kpis").innerHTML =
      kpi("Vencidas", r.vencidas, `${r.vencidas.qtd} parcela(s)`, r.vencidas.qtd ? "cr-kpi-alerta" : "") +
      kpi("Vence hoje", r.hoje, `${r.hoje.qtd} parcela(s)`, r.hoje.qtd ? "cr-kpi-atencao" : "") +
      kpi("Próximos 7 dias", r.prox7, `${r.prox7.qtd} parcela(s)`) +
      kpi("Próximos 30 dias", r.prox30, `${r.prox30.qtd} parcela(s)`) +
      kpi("Total a receber", r.aReceber, `${r.aReceber.qtd} parcela(s) em aberto`) +
      kpi("Recebido no mês", r.recebidoMes, `${r.recebidoMes.qtd} baixa(s)`, "cr-kpi-ok");
    if (filtro === "cobrar" && !r.vencidas.qtd && !r.hoje.qtd) filtro = r.prox7.qtd ? "prox7" : "abertas";
    desenhar();
    if (window.__evoe.atualizarBadgeFinanceiro) window.__evoe.atualizarBadgeFinanceiro();
  }

  function desenhar() {
    const ps = dados.parcelas;
    const aberta = (p) => p.situacao !== "paga";
    const sel = {
      cobrar: (p) => p.situacao === "vencida" || p.situacao === "hoje",
      prox7: (p) => aberta(p) && p.dias != null && p.dias >= 0 && p.dias <= 7,
      prox30: (p) => aberta(p) && p.dias != null && p.dias >= 0 && p.dias <= 30,
      abertas: aberta,
      pagas: (p) => p.situacao === "paga",
    };
    $("cr-filtros").innerHTML = FILTROS.map(([id, rot]) => `<button type="button" class="funil-chip ${filtro === id ? "ativo" : ""}" data-f="${id}">${rot} <strong>${ps.filter(sel[id]).length}</strong></button>`).join("");
    $("cr-filtros").querySelectorAll("[data-f]").forEach((b) => b.addEventListener("click", () => ((filtro = b.dataset.f), desenhar())));
    const lista = ps.filter(sel[filtro]);
    if (filtro === "pagas") lista.sort((a, b) => String((b.pagamento || {}).em || "").localeCompare(String((a.pagamento || {}).em || "")));
    $("cr-lista").innerHTML = lista.length
      ? `<div class="tabela-rolavel"><table class="cr-tabela"><thead><tr><th>Cliente</th><th>Parcela</th><th>Valor</th><th>Vencimento</th><th>Situação</th><th></th></tr></thead><tbody>${lista
          .map((p) => {
            const ult = (p.cobrancas || []).slice(-1)[0];
            return `<tr class="${p.situacao === "vencida" ? "cr-vencida" : p.situacao === "hoje" ? "cr-hoje" : ""}">
              <td><strong>${escapeHtml(p.empresaNome)}</strong>${p.vagaTitulo ? `<div class="sub">${escapeHtml(p.vagaTitulo)}${p.vagaConcluida ? " · ✅ vaga concluída" : ""}</div>` : ""}</td>
              <td>${escapeHtml(p.descricao)}${p.origem === "proposta" ? `<div class="sub">proposta nº ${escapeHtml(p.numero)}</div>` : p.origem === "manual" ? '<div class="sub">lançamento manual</div>' : ""}</td>
              <td><strong>${p.salarioFaltando ? '<span class="sub">sem salário na vaga</span>' : formatarReal(p.valor)}</strong></td>
              <td>${p.vencimento ? formatarData(p.vencimento) : "—"}</td>
              <td>${SIT[p.situacao](p)}${ult ? `<div class="sub">cobrado ${new Date(ult.em).toLocaleDateString("pt-BR")} (${escapeHtml(ult.canal)})</div>` : ""}</td>
              <td class="link-acoes" style="white-space:nowrap;">${
                p.situacao === "paga"
                  ? `<button type="button" class="link-btn" data-desfazer="${escapeHtml(p.id)}">desfazer baixa</button>`
                  : `<button type="button" class="btn btn-secondary btn-sm" data-cobrar="${escapeHtml(p.id)}">💬 Cobrar</button>
                     <button type="button" class="btn btn-primary btn-sm" data-pagar="${escapeHtml(p.id)}">✅ Recebido</button>
                     ${p.recebivelId ? `<button type="button" class="link-btn" data-editar="${escapeHtml(p.id)}">editar</button>` : ""}`
              }</td></tr>`;
          })
          .join("")}</tbody></table></div>`
      : `<div class="empty-state">${filtro === "cobrar" ? "Nenhuma parcela vencida ou vencendo hoje. 🎉" : "Nenhuma parcela neste filtro."}${!ps.length ? '<br>Use "+ Lançar parcelas" ou gere as parcelas de uma proposta aceita (CRM › Propostas).' : ""}</div>`;
    const acha = (id) => dados.parcelas.find((p) => p.id === id);
    $("cr-lista").querySelectorAll("[data-cobrar]").forEach((b) => b.addEventListener("click", () => cobrar(acha(b.dataset.cobrar))));
    $("cr-lista").querySelectorAll("[data-pagar]").forEach((b) => b.addEventListener("click", () => darBaixa(acha(b.dataset.pagar))));
    $("cr-lista").querySelectorAll("[data-editar]").forEach((b) => b.addEventListener("click", () => editar(acha(b.dataset.editar))));
    $("cr-lista").querySelectorAll("[data-desfazer]").forEach((b) =>
      b.addEventListener("click", async () => {
        if (!confirm("Desfazer a baixa desta parcela? (O registro anterior fica guardado.)")) return;
        await api.post(`/api/financeiro/parcelas/${encodeURIComponent(b.dataset.desfazer)}/desfazer`);
        carregar();
      })
    );
  }

  function cobrar(p) {
    const texto = mensagemCobranca(p);
    const tel = telWhats(p.whatsapp);
    abrirModal(`<h2>💬 Cobrar ${escapeHtml(p.empresaNome)}</h2>
      <div class="sub" style="margin-bottom:8px;">${escapeHtml(p.descricao)} · ${formatarReal(p.valor)} · vencimento ${p.vencimento ? formatarData(p.vencimento) : "—"}</div>
      <div class="form-row"><label>Mensagem <span class="sub">(pode ajustar)</span></label><textarea id="cb-texto" rows="8">${escapeHtml(texto)}</textarea></div>
      ${tel ? "" : '<div class="ponto-aviso">Cliente sem WhatsApp no CRM — o WhatsApp abre para você escolher o contato.</div>'}
      <div class="modal-close-row"><button type="button" class="btn btn-outline" id="cb-fechar">Fechar</button>
        <button type="button" class="btn btn-outline" id="cb-copiar">Copiar</button>
        <button type="button" class="btn btn-primary" id="cb-whats">Abrir no WhatsApp</button></div>`);
    const registrar = (canal) => api.post(`/api/financeiro/parcelas/${encodeURIComponent(p.id)}/cobranca`, { canal }).then(carregar).catch(() => {});
    document.getElementById("cb-fechar").addEventListener("click", fecharModal);
    document.getElementById("cb-whats").addEventListener("click", () => {
      window.open(`https://wa.me/${tel}?text=${encodeURIComponent(document.getElementById("cb-texto").value)}`, "_blank", "noopener");
      registrar("WhatsApp");
      fecharModal();
      showToast("Cobrança registrada. Depois que o cliente pagar, clique em ✅ Recebido.", "sucesso");
    });
    document.getElementById("cb-copiar").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(document.getElementById("cb-texto").value);
      } catch (e) {
        prompt("Copie:", document.getElementById("cb-texto").value);
      }
      registrar("mensagem copiada");
      fecharModal();
    });
  }

  function darBaixa(p) {
    abrirModal(`<h2>✅ Registrar recebimento</h2>
      <div class="sub" style="margin-bottom:8px;">${escapeHtml(p.empresaNome)} — ${escapeHtml(p.descricao)}</div>
      <div class="form-cols">
        <div class="form-row"><label>Data do recebimento</label><input type="date" id="bx-data" value="${hojeIso()}" /></div>
        <div class="form-row"><label>Valor recebido (R$)</label><input type="text" inputmode="decimal" id="bx-valor" value="${String(p.valor || "").replace(".", ",")}" /></div>
      </div>
      <div class="form-cols">
        <div class="form-row"><label>Forma</label><select id="bx-forma"><option>PIX</option><option>Boleto</option><option>Transferência</option><option>Cartão</option><option>Dinheiro</option><option>Outro</option></select></div>
        <div class="form-row"><label>Observação <span class="sub">(opcional)</span></label><input type="text" id="bx-obs" /></div>
      </div>
      <div id="bx-erro" class="form-erro hidden"></div>
      <div class="modal-close-row"><button type="button" class="btn btn-outline" id="bx-fechar">Fechar</button><button type="button" class="btn btn-primary" id="bx-ok">Confirmar recebimento</button></div>`);
    document.getElementById("bx-fechar").addEventListener("click", fecharModal);
    document.getElementById("bx-ok").addEventListener("click", async () => {
      try {
        await api.post(`/api/financeiro/parcelas/${encodeURIComponent(p.id)}/pagar`, { em: document.getElementById("bx-data").value, valor: document.getElementById("bx-valor").value, forma: document.getElementById("bx-forma").value, obs: document.getElementById("bx-obs").value });
        fecharModal();
        showToast("Recebimento registrado. Os lembretes dessa parcela param.", "sucesso");
        carregar();
      } catch (e) {
        const el = document.getElementById("bx-erro");
        el.textContent = e.message;
        el.classList.remove("hidden");
      }
    });
  }

  function editar(p) {
    abrirModal(`<h2>Editar parcela</h2>
      <div class="form-row"><label>Descrição</label><input type="text" id="ed-desc" value="${escapeHtml(p.descricao)}" /></div>
      <div class="form-cols">
        <div class="form-row"><label>Valor (R$)</label><input type="text" inputmode="decimal" id="ed-valor" value="${String(p.valor || "").replace(".", ",")}" /></div>
        <div class="form-row"><label>Vencimento</label><input type="date" id="ed-venc" value="${escapeHtml(p.vencimento || "")}" /></div>
      </div>
      <div id="ed-erro" class="form-erro hidden"></div>
      <div class="modal-close-row"><button type="button" class="btn btn-outline" id="ed-cancelar" style="margin-right:auto;color:var(--danger);">Cancelar parcela</button><button type="button" class="btn btn-outline" id="ed-fechar">Fechar</button><button type="button" class="btn btn-primary" id="ed-ok">Salvar</button></div>`);
    const salvar = async (extra) => {
      try {
        await api.patch(`/api/financeiro/recebiveis/${p.recebivelId}`, extra || { descricao: document.getElementById("ed-desc").value, valor: document.getElementById("ed-valor").value, vencimento: document.getElementById("ed-venc").value });
        fecharModal();
        carregar();
      } catch (e) {
        const el = document.getElementById("ed-erro");
        el.textContent = e.message;
        el.classList.remove("hidden");
      }
    };
    document.getElementById("ed-fechar").addEventListener("click", fecharModal);
    document.getElementById("ed-ok").addEventListener("click", () => salvar());
    document.getElementById("ed-cancelar").addEventListener("click", () => confirm("Cancelar esta parcela? Ela sai da lista (fica guardada no histórico).") && salvar({ cancelar: true }));
  }

  $("cr-lancar").addEventListener("click", () => lancarParcelas({}, carregar));
  await carregar();
  secaoContratosAbertos($("cr-antigo"));
}

/** Lançar parcelas (manual ou a partir de uma proposta aceita). inicial: { empresaId, clienteNome, total, propostaId, vagaId, descricao } */
export function lancarParcelas(inicial = {}, aoSalvar = () => {}) {
  let empresaId = inicial.empresaId || "";
  let vagaId = inicial.vagaId || "";
  const hoje = hojeIso();
  abrirModal(`<h2>💰 Lançar parcelas a receber</h2>
    <div class="form-row"><label>Cliente</label><div id="lp-cliente"></div></div>
    <div class="form-row"><label>Vaga <span class="sub">(opcional)</span></label><div id="lp-vaga"></div></div>
    <div class="form-row"><label>Descrição</label><input type="text" id="lp-desc" value="${escapeHtml(inicial.descricao || "")}" placeholder="Ex.: Recrutamento e Seleção — Vendedor" /></div>
    <div class="form-cols">
      <div class="form-row"><label>Valor total (R$)</label><input type="text" inputmode="decimal" id="lp-total" value="${inicial.total ? String(inicial.total).replace(".", ",") : ""}" /></div>
      <div class="form-row"><label>Como será pago</label><select id="lp-modelo"><option value="50-50">2 parcelas: 50% agora + 50% em 30 dias</option><option value="1">À vista (1 parcela)</option><option value="3">3 parcelas mensais</option><option value="livre">Personalizar</option></select></div>
    </div>
    <div id="lp-parcelas"></div>
    <div id="lp-erro" class="form-erro hidden"></div>
    <div class="modal-close-row"><button type="button" class="btn btn-outline" id="lp-fechar">Fechar</button><button type="button" class="btn btn-primary" id="lp-ok">Lançar</button></div>`);
  const $ = (id) => document.getElementById(id);
  const dinheiro = (v) => {
    let s = String(v || "").replace(/[^\d,.]/g, "");
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    return Number(s) || 0;
  };
  let parcelas = [];
  const gerar = () => {
    const total = dinheiro($("lp-total").value);
    const m = $("lp-modelo").value;
    if (m === "livre") return desenhar();
    const n = m === "50-50" ? 2 : Number(m);
    const base = Math.floor((total / n) * 100) / 100;
    parcelas = Array.from({ length: n }, (_, i) => ({ valor: i === n - 1 ? Math.round((total - base * (n - 1)) * 100) / 100 : base, vencimento: somarDias(hoje, i * 30) }));
    desenhar();
  };
  const desenhar = () => {
    if (!parcelas.length) parcelas = [{ valor: 0, vencimento: hoje }];
    $("lp-parcelas").innerHTML = `${parcelas
      .map((p, i) => `<div class="form-cols lp-linha" data-i="${i}"><div class="form-row"><label class="sub">${i + 1}ª parcela — valor</label><input type="text" inputmode="decimal" class="lp-v" value="${p.valor ? String(p.valor).replace(".", ",") : ""}" /></div><div class="form-row"><label class="sub">Vencimento</label><input type="date" class="lp-d" value="${p.vencimento}" /></div></div>`)
      .join("")}<button type="button" class="link-btn" id="lp-mais">+ parcela</button>`;
    $("lp-parcelas").querySelectorAll(".lp-linha").forEach((l) => {
      const i = Number(l.dataset.i);
      l.querySelector(".lp-v").addEventListener("input", (e) => (parcelas[i].valor = dinheiro(e.target.value)));
      l.querySelector(".lp-d").addEventListener("input", (e) => (parcelas[i].vencimento = e.target.value));
    });
    $("lp-mais").addEventListener("click", () => {
      parcelas.push({ valor: 0, vencimento: somarDias(parcelas[parcelas.length - 1].vencimento || hoje, 30) });
      $("lp-modelo").value = "livre";
      desenhar();
    });
  };
  criarCombobox($("lp-cliente"), {
    opcoes: store.empresas.map((e) => ({ valor: e.id, rotulo: e.nome })),
    valor: empresaId,
    placeholder: "Digite o nome do cliente...",
    aoEscolher: (v) => (empresaId = v),
  });
  api.get("/api/vagas").then((vagas) =>
    criarCombobox($("lp-vaga"), {
      opcoes: vagas.map((v) => ({ valor: v.id, rotulo: `${(store.empresas.find((e) => e.id === v.empresaId) || {}).nome || ""} — ${v.titulo}` })),
      valor: vagaId,
      opcaoVazia: "— sem vaga —",
      placeholder: "Digite a empresa ou o cargo...",
      aoEscolher: (v) => (vagaId = v),
    })
  );
  $("lp-total").addEventListener("input", gerar);
  $("lp-modelo").addEventListener("change", gerar);
  gerar();
  $("lp-fechar").addEventListener("click", fecharModal);
  $("lp-ok").addEventListener("click", async () => {
    try {
      await api.post("/api/financeiro/recebiveis", { empresaId, clienteNome: inicial.clienteNome || "", vagaId, propostaId: inicial.propostaId || null, descricao: $("lp-desc").value, parcelas });
      fecharModal();
      showToast(`${parcelas.length} parcela(s) lançada(s) em Financeiro › Contas a receber. Você será lembrada de cobrar.`, "sucesso");
      aoSalvar();
    } catch (e) {
      $("lp-erro").textContent = e.message;
      $("lp-erro").classList.remove("hidden");
    }
  });
}

async function secaoContratosAbertos(root) {
  root.innerHTML = `
    <div class="sub" style="margin-bottom:10px;">Faturamento das vagas em aberto: o que já entrou (1ª parcela) e o que está previsto para os próximos 30 dias (2ª parcela).</div>
    <div id="financeiro-avisos"></div>
    <div class="kpi-row" id="financeiro-kpis"></div>
    <h3 class="section-title">Vagas em Aberto com Contrato</h3>
    <div class="sub" style="margin:-8px 0 12px;">Uma linha por contrato de vaga ainda aberta — ordenado pela 2ª parcela mais próxima de vencer.</div>
    <div id="financeiro-tabela"><div class="empty-state">Carregando...</div></div>
  `;

  const dados = await api.get("/api/financeiro");
  const { linhas, resumo } = dados;

  const avisosEl = root.querySelector("#financeiro-avisos");
  const avisos = [];
  if (resumo.qtdSemSalario > 0) {
    avisos.push(
      `${resumo.qtdSemSalario} contrato(s) cobrado(s) por percentual sem o salário do cargo preenchido na vaga — o valor deles não entra nos totais abaixo. Edite a vaga (Funil de Vagas) e preencha o campo "Salário do cargo".`
    );
  }
  if (resumo.vagasAbertasSemContrato > 0) {
    avisos.push(
      `${resumo.vagasAbertasSemContrato} vaga(s) em aberto ainda não têm contrato gerado — não entram no faturamento até você gerar o contrato em Contratos.`
    );
  }
  avisosEl.innerHTML = avisos.length
    ? avisos.map((a) => `<div class="form-erro" style="background:var(--warning-bg); color:var(--warning); margin-bottom:10px;">${escapeHtml(a)}</div>`).join("")
    : "";

  root.querySelector("#financeiro-kpis").innerHTML = `
    <div class="kpi-card kpi-destaque kpi-destaque-ok">
      <div class="kpi-label">Já Recebido (1ª parcela)</div>
      <div class="kpi-value">${formatarReal(resumo.recebido)}</div>
      <div class="kpi-sub">Das vagas em aberto com contrato</div>
    </div>
    <div class="kpi-card kpi-destaque">
      <div class="kpi-label">Previsto — Próximos 30 dias</div>
      <div class="kpi-value">${formatarReal(resumo.previsto30dias)}</div>
      <div class="kpi-sub">2ª parcela com vencimento nos próximos 30 dias</div>
    </div>
    <div class="kpi-card kpi-destaque ${resumo.vencidoNaoRecebido > 0 ? "kpi-destaque-alerta" : ""}">
      <div class="kpi-label">Vencido e Não Cobrado</div>
      <div class="kpi-value">${formatarReal(resumo.vencidoNaoRecebido)}</div>
      <div class="kpi-sub">2ª parcela com vencimento já passado</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Total Contratado (vagas abertas)</div>
      <div class="kpi-value">${formatarReal(resumo.totalContratado)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Ainda a Receber</div>
      <div class="kpi-value">${formatarReal(resumo.aReceberTotal)}</div>
    </div>
  `;

  const tabelaEl = root.querySelector("#financeiro-tabela");
  if (linhas.length === 0) {
    tabelaEl.innerHTML = '<div class="empty-state">Nenhum contrato vinculado a vagas em aberto ainda.</div>';
    return;
  }
  tabelaEl.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Contrato</th><th>Vaga</th><th>Empresa</th><th>Consultor</th>
          <th>Valor Total</th><th>1ª Parcela (recebido)</th><th>2ª Parcela (previsto)</th><th>Vencimento 2ª Parcela</th>
        </tr>
      </thead>
      <tbody>
        ${linhas
          .map(
            (l) => `
          <tr>
            <td><strong>${escapeHtml(l.numero)}</strong></td>
            <td>${escapeHtml(l.vagaTitulo)}</td>
            <td>${escapeHtml(l.empresaNome)}</td>
            <td>${escapeHtml(l.consultorNome)}</td>
            <td>${l.salarioFaltando ? '<span class="sub">sem salário</span>' : formatarReal(l.valorTotal)}</td>
            <td>${formatarReal(l.valorParcela1)}</td>
            <td>${formatarReal(l.valorParcela2)}</td>
            <td>${l.dataVencimentoParcela2 ? formatarData(l.dataVencimentoParcela2) : "—"} ${tagVencimento(l.diasParcela2)}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
}
