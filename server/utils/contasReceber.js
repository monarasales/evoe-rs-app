// Contas a receber: todas as parcelas a cobrar dos clientes, de duas origens:
//  - contratos gerados no sistema (1ª e 2ª parcela, valores de utils/financeiro.js);
//  - lançamentos manuais / gerados de uma proposta aceita (coleção "recebiveis").
// Situação: paga | vencida | hoje | a_vencer | sem_data. Baixa ("recebido") e histórico de
// cobranças ficam gravados; desfazer a baixa guarda a anterior (nada se perde).
// Lembretes ao Gestor se repetem até o pagamento (ver checarLembretes).

const db = require("../db");
const { calcularParcelas } = require("./financeiro");
const { notify } = require("./notify");

const COL = "recebiveis";
// Contratos criados antes do controle de recebimento: a 1ª parcela era paga na assinatura.
const INICIO_CONTROLE = "2026-11-19";

const hojeLocal = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10); // Fortaleza
const diasAte = (data, hoje = hojeLocal()) => (data ? Math.round((new Date(`${data}T12:00:00Z`) - new Date(`${hoje}T12:00:00Z`)) / 86400000) : null);

function situacao(p, hoje) {
  if (p.pagamento) return "paga";
  if (!p.vencimento) return "sem_data";
  const d = diasAte(p.vencimento, hoje);
  return d < 0 ? "vencida" : d === 0 ? "hoje" : "a_vencer";
}

/** Lista unificada de parcelas (contratos + lançamentos). */
function listarParcelas(hoje = hojeLocal()) {
  const empresas = new Map(db.readCollection("empresas").map((e) => [e.id, e]));
  const vagas = new Map(db.readCollection("vagas").map((v) => [v.id, v]));
  const consultores = new Map(db.readCollection("consultores").map((c) => [c.id, c]));
  const out = [];

  for (const c of db.readCollection("contratos")) {
    if (c.status === "Cancelado") continue;
    const vaga = vagas.get(c.vagaId);
    const { valorParcela1, valorParcela2, salarioFaltando } = calcularParcelas(c, vaga);
    const pag = c.pagamentos || {};
    [
      [1, valorParcela1, c.dataVencimentoParcela1],
      [2, valorParcela2, c.dataVencimentoParcela2],
    ].forEach(([n, valor, venc]) => {
      let pagamento = pag[`p${n}`] || null;
      // contrato antigo: 1ª parcela presumida paga na assinatura (pode ser desfeito)
      if (!pagamento && n === 1 && !pag.p1Desfeita && String(c.createdAt || "").slice(0, 10) < INICIO_CONTROLE) pagamento = { presumido: true, em: c.dataContrato || String(c.createdAt).slice(0, 10), valor };
      out.push({
        id: `c:${c.id}:${n}`,
        origem: "contrato",
        contratoId: c.id,
        numero: c.numero,
        parcela: n,
        totalParcelas: 2,
        descricao: `${n}ª parcela — contrato nº ${c.numero}`,
        valor,
        salarioFaltando,
        vencimento: venc || null,
        pagamento,
        cobrancas: (c.cobrancas || []).filter((x) => x.parcela === n),
        empresaId: c.empresaId,
        vagaId: c.vagaId,
        consultorId: c.consultorId,
      });
    });
  }
  for (const r of db.readCollection(COL)) {
    if (r.cancelado) continue;
    out.push({
      id: `r:${r.id}`,
      origem: r.propostaId ? "proposta" : "manual",
      recebivelId: r.id,
      propostaId: r.propostaId || null,
      numero: r.numeroProposta || "",
      parcela: r.parcela || 1,
      totalParcelas: r.totalParcelas || 1,
      descricao: r.descricao || `${r.parcela || 1}ª parcela`,
      valor: Number(r.valor) || 0,
      vencimento: r.vencimento || null,
      pagamento: r.pagamento || null,
      cobrancas: r.cobrancas || [],
      empresaId: r.empresaId || null,
      clienteNome: r.clienteNome || "",
      vagaId: r.vagaId || null,
      consultorId: r.consultorId || null,
    });
  }
  return out.map((p) => {
    const e = empresas.get(p.empresaId) || {};
    const v = vagas.get(p.vagaId) || {};
    return {
      ...p,
      situacao: situacao(p, hoje),
      dias: diasAte(p.vencimento, hoje),
      empresaNome: e.nome || p.clienteNome || "—",
      contatoNome: e.contatoResponsavel || "",
      whatsapp: e.whatsappContato || "",
      email: e.emailContato || "",
      vagaTitulo: v.titulo || "",
      vagaConcluida: v.etapaAtual === "11. Aprovado",
      consultorNome: (consultores.get(p.consultorId || v.consultorId) || {}).nome || "",
    };
  });
}

function resumo(parcelas, hoje = hojeLocal()) {
  const soma = (l) => Math.round(l.reduce((s, p) => s + (p.valor || 0), 0) * 100) / 100;
  const abertas = parcelas.filter((p) => p.situacao !== "paga");
  const mes = hoje.slice(0, 7);
  const pagasMes = parcelas.filter((p) => p.pagamento && !p.pagamento.presumido && String(p.pagamento.em || "").slice(0, 7) === mes);
  const ate = (n) => abertas.filter((p) => p.dias != null && p.dias >= 0 && p.dias <= n);
  return {
    vencidas: { qtd: abertas.filter((p) => p.situacao === "vencida").length, valor: soma(abertas.filter((p) => p.situacao === "vencida")) },
    hoje: { qtd: abertas.filter((p) => p.situacao === "hoje").length, valor: soma(abertas.filter((p) => p.situacao === "hoje")) },
    prox7: { qtd: ate(7).length, valor: soma(ate(7)) },
    prox30: { qtd: ate(30).length, valor: soma(ate(30)) },
    aReceber: { qtd: abertas.length, valor: soma(abertas) },
    recebidoMes: { qtd: pagasMes.length, valor: Math.round(pagasMes.reduce((s, p) => s + (Number(p.pagamento.valor) || p.valor || 0), 0) * 100) / 100 },
    vagaConcluidaACobrar: abertas.filter((p) => p.parcela === p.totalParcelas && p.vagaConcluida && p.situacao === "a_vencer").length,
  };
}

/** Grava baixa/cobrança/lembrete na origem certa (contrato ou lançamento). */
function atualizarParcela(id, fn) {
  const [tipo, oid, n] = String(id).split(":");
  if (tipo === "c") {
    const c = db.findById("contratos", oid);
    if (!c) throw new Error("Contrato não encontrado.");
    return db.update("contratos", c.id, fn({ alvo: c, chave: `p${n}`, parcela: Number(n), contrato: true }));
  }
  const r = db.findById(COL, oid);
  if (!r) throw new Error("Parcela não encontrada.");
  return db.update(COL, r.id, fn({ alvo: r, chave: null, parcela: r.parcela || 1, contrato: false }));
}

function registrarPagamento(id, dados, por) {
  const pagamento = { em: dados.em, valor: Number(dados.valor) || null, forma: String(dados.forma || "").slice(0, 40), obs: String(dados.obs || "").slice(0, 300), por, registradoEm: new Date().toISOString() };
  return atualizarParcela(id, ({ alvo, chave, contrato }) =>
    contrato ? { pagamentos: { ...(alvo.pagamentos || {}), [chave]: pagamento } } : { pagamento }
  );
}

function desfazerPagamento(id, por) {
  return atualizarParcela(id, ({ alvo, chave, contrato, parcela }) => {
    const anterior = contrato ? (alvo.pagamentos || {})[chave] : alvo.pagamento;
    const historico = [...(alvo.pagamentosDesfeitos || []), { parcela, anterior: anterior || { presumido: true }, desfeitoEm: new Date().toISOString(), por }];
    if (contrato) {
      const pagamentos = { ...(alvo.pagamentos || {}) };
      delete pagamentos[chave];
      if (parcela === 1) pagamentos.p1Desfeita = true;
      return { pagamentos, pagamentosDesfeitos: historico };
    }
    return { pagamento: null, pagamentosDesfeitos: historico };
  });
}

function registrarCobranca(id, canal, por) {
  return atualizarParcela(id, ({ alvo, parcela }) => ({ cobrancas: [...(alvo.cobrancas || []), { parcela, canal, em: new Date().toISOString(), por }] }));
}

// ---------- Lembretes ao Gestor (repetem até o pagamento) ----------
// 3 dias antes · no dia · a cada 3 dias depois de vencida · vaga concluída com a última parcela em aberto.
function estagioLembrete(p) {
  if (p.situacao === "paga" || p.dias == null) return null;
  if (p.dias < 0) return `atraso-${Math.floor(-p.dias / 3)}`; // muda a cada 3 dias de atraso
  if (p.dias === 0) return "hoje";
  if (p.dias <= 3) return "d-3";
  if (p.vagaConcluida && p.parcela === p.totalParcelas) return "vaga-concluida";
  return null;
}

function checarLembretes() {
  const hoje = hojeLocal();
  const gestores = db.readCollection("consultores").filter((c) => c.perfil === "Gestor" && c.ativo !== false);
  if (!gestores.length) return;
  const brl = (n) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dataBr = (d) => d.split("-").reverse().join("/");
  for (const p of listarParcelas(hoje)) {
    const est = estagioLembrete(p);
    if (!est) continue;
    const lembretes = (p.origem === "contrato" ? (db.findById("contratos", p.contratoId) || {}).lembretesCobranca : (db.findById(COL, p.recebivelId) || {}).lembretesCobranca) || {};
    if (lembretes[`p${p.parcela}`] === est) continue;
    const quem = `${p.empresaNome}${p.vagaTitulo ? ` (vaga ${p.vagaTitulo})` : ""}`;
    const msg =
      est === "hoje"
        ? `Vence HOJE a ${p.descricao} de ${quem}: ${brl(p.valor)}. Cobre o cliente em Financeiro › Contas a receber.`
        : est === "d-3"
        ? `A ${p.descricao} de ${quem} vence em ${p.dias} dia(s) (${dataBr(p.vencimento)}): ${brl(p.valor)}. Prepare a cobrança.`
        : est === "vaga-concluida"
        ? `A vaga de ${quem} foi concluída: a ${p.descricao} (${brl(p.valor)}, vencimento ${dataBr(p.vencimento)}) já pode ser cobrada.`
        : `⚠️ A ${p.descricao} de ${quem} está VENCIDA há ${-p.dias} dia(s) (${dataBr(p.vencimento)}): ${brl(p.valor)}. Cobre o cliente.`;
    gestores.forEach((g) => notify({ tipo: "Cobrança de parcela", vagaId: p.vagaId || null, destinatarioId: g.id, assunto: `${est.startsWith("atraso") ? "⚠️ Parcela vencida" : "Cobrança de parcela"}: ${p.empresaNome}`, mensagem: msg }));
    try {
      atualizarParcela(p.id, ({ alvo }) => ({ lembretesCobranca: { ...(alvo.lembretesCobranca || {}), [`p${p.parcela}`]: est } }));
    } catch (e) {
      /* parcela removida no meio: ignora */
    }
  }
}

function startLembretesCobranca(intervaloMin = 60) {
  const rodar = () => {
    try {
      checarLembretes();
    } catch (e) {
      console.error("[financeiro] lembretes:", e.message);
    }
  };
  setTimeout(rodar, 45 * 1000);
  setInterval(rodar, intervaloMin * 60 * 1000);
}

module.exports = { COL, listarParcelas, resumo, registrarPagamento, desfazerPagamento, registrarCobranca, estagioLembrete, checarLembretes, startLembretesCobranca, hojeLocal };
