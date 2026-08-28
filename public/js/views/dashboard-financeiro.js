import { api } from "../api.js";
import { store, showToast, formatarData, isGestor } from "../state.js";

function formatarReal(valor) {
  return (Number(valor) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export async function renderDashboardFinanceiro(root) {
  if (!isGestor()) {
    root.innerHTML = '<div class="empty-state">Esta área é restrita ao perfil Gestor.</div>';
    return;
  }

  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Dashboard Financeiro</h2>
        <div class="sub">Visão completa de entradas (faturamento de vagas) e saídas (despesas da consultoria).</div>
      </div>
    </div>
    <div id="fin-dashboard"><div class="empty-state">Carregando...</div></div>
  `;

  const dashEl = root.querySelector("#fin-dashboard");

  try {
    const financeiro = await api.get("/api/financeiro");
    const despesas = await api.get("/api/despesas");

    const resumoFinanceiro = financeiro.resumo || {};
    const todasAsDespesas = despesas || [];

    // Calcular totais de despesas por status
    const despesasAprovadas = todasAsDespesas.filter(d => d.status === "Aprovada").reduce((s, d) => s + (Number(d.valor) || 0), 0);
    const despesasPagas = todasAsDespesas.filter(d => d.dataPagamento).reduce((s, d) => s + (Number(d.valor) || 0), 0);
    const despesasPendentes = todasAsDespesas.filter(d => d.status === "Aprovada" && !d.dataPagamento).reduce((s, d) => s + (Number(d.valor) || 0), 0);
    const totalDespesas = todasAsDespesas.filter(d => d.status === "Aprovada").reduce((s, d) => s + (Number(d.valor) || 0), 0);

    // Entradas
    const entradaRecebida = resumoFinanceiro.recebido || 0;
    const entradaPrevista = resumoFinanceiro.previsto30dias || 0;
    const totalEntrada = resumoFinanceiro.totalContratado || 0;

    // Cálculos do fluxo
    const saldoCaixa = entradaRecebida - despesasPagas;
    const saldoPrevisto = totalEntrada - totalDespesas;

    dashEl.innerHTML = `
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:16px; margin-bottom:24px;">
        <!-- ENTRADAS -->
        <div style="background:linear-gradient(135deg, #2E7D32 0%, #1B5E20 100%); color:white; padding:20px; border-radius:8px;">
          <div style="font-size:12px; opacity:0.9; margin-bottom:8px;">ENTRADAS — 1ª PARCELA</div>
          <div style="font-size:28px; font-weight:700; margin-bottom:4px;">${formatarReal(entradaRecebida)}</div>
          <div style="font-size:12px; opacity:0.8;">Já faturado</div>
        </div>

        <div style="background:linear-gradient(135deg, #1976D2 0%, #0D47A1 100%); color:white; padding:20px; border-radius:8px;">
          <div style="font-size:12px; opacity:0.9; margin-bottom:8px;">ENTRADAS — PRÓXIMOS 30 DIAS</div>
          <div style="font-size:28px; font-weight:700; margin-bottom:4px;">${formatarReal(entradaPrevista)}</div>
          <div style="font-size:12px; opacity:0.8;">Próximas parcelas</div>
        </div>

        <div style="background:linear-gradient(135deg, #7B1FA2 0%, #4A148C 100%); color:white; padding:20px; border-radius:8px;">
          <div style="font-size:12px; opacity:0.9; margin-bottom:8px;">ENTRADAS — TOTAL CONTRATADO</div>
          <div style="font-size:28px; font-weight:700; margin-bottom:4px;">${formatarReal(totalEntrada)}</div>
          <div style="font-size:12px; opacity:0.8;">De vagas em aberto</div>
        </div>

        <!-- SAÍDAS -->
        <div style="background:linear-gradient(135deg, #D32F2F 0%, #B71C1C 100%); color:white; padding:20px; border-radius:8px;">
          <div style="font-size:12px; opacity:0.9; margin-bottom:8px;">DESPESAS — PAGAS</div>
          <div style="font-size:28px; font-weight:700; margin-bottom:4px;">${formatarReal(despesasPagas)}</div>
          <div style="font-size:12px; opacity:0.8;">Custos já pagos</div>
        </div>

        <div style="background:linear-gradient(135deg, #F57C00 0%, #E65100 100%); color:white; padding:20px; border-radius:8px;">
          <div style="font-size:12px; opacity:0.9; margin-bottom:8px;">DESPESAS — PENDENTES</div>
          <div style="font-size:28px; font-weight:700; margin-bottom:4px;">${formatarReal(despesasPendentes)}</div>
          <div style="font-size:12px; opacity:0.8;">Aprovadas, não pagas</div>
        </div>

        <div style="background:linear-gradient(135deg, #C62828 0%, #7F0000 100%); color:white; padding:20px; border-radius:8px;">
          <div style="font-size:12px; opacity:0.9; margin-bottom:8px;">DESPESAS — TOTAL</div>
          <div style="font-size:28px; font-weight:700; margin-bottom:4px;">${formatarReal(totalDespesas)}</div>
          <div style="font-size:12px; opacity:0.8;">Custos totais aprovados</div>
        </div>

        <!-- SALDO -->
        <div style="background:linear-gradient(135deg, #00695C 0%, #004D40 100%); color:white; padding:20px; border-radius:8px; grid-column: 1 / -1;">
          <div style="font-size:12px; opacity:0.9; margin-bottom:8px;">SALDO DE CAIXA (REALIZADO)</div>
          <div style="font-size:32px; font-weight:700; margin-bottom:12px;">${formatarReal(saldoCaixa)}</div>
          <div style="font-size:12px; opacity:0.8; margin-bottom:8px;">Entradas Recebidas − Despesas Pagas</div>
        </div>

        <div style="background:linear-gradient(135deg, #00ACC1 0%, #00838F 100%); color:white; padding:20px; border-radius:8px; grid-column: 1 / -1;">
          <div style="font-size:12px; opacity:0.9; margin-bottom:8px;">SALDO PREVISTO (TOTAL CONTRATADO − TOTAL DESPESAS)</div>
          <div style="font-size:32px; font-weight:700; margin-bottom:12px;">${formatarReal(saldoPrevisto)}</div>
          <div style="font-size:12px; opacity:0.8; margin-bottom:8px;">Quando todas as parcelas forem recebidas e todas as despesas pagas</div>
        </div>
      </div>

      <div style="background:var(--bg-alt); padding:20px; border-radius:8px; margin-bottom:20px;">
        <h3 style="margin-top:0;">Resumo de Entradas (Faturamento)</h3>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:12px;">
          <div style="padding:12px; background:white; border-radius:6px; border-left:4px solid #2E7D32;">
            <div class="sub">Já Recebido</div>
            <div style="font-size:18px; font-weight:600;">${formatarReal(entradaRecebida)}</div>
          </div>
          <div style="padding:12px; background:white; border-radius:6px; border-left:4px solid #1976D2;">
            <div class="sub">Previsto 30d</div>
            <div style="font-size:18px; font-weight:600;">${formatarReal(entradaPrevista)}</div>
          </div>
          <div style="padding:12px; background:white; border-radius:6px; border-left:4px solid #7B1FA2;">
            <div class="sub">A Receber</div>
            <div style="font-size:18px; font-weight:600;">${formatarReal(resumoFinanceiro.aReceberTotal || 0)}</div>
          </div>
        </div>
      </div>

      <div style="background:var(--bg-alt); padding:20px; border-radius:8px;">
        <h3 style="margin-top:0;">Resumo de Saídas (Despesas)</h3>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:12px;">
          <div style="padding:12px; background:white; border-radius:6px; border-left:4px solid #D32F2F;">
            <div class="sub">Pagas</div>
            <div style="font-size:18px; font-weight:600;">${formatarReal(despesasPagas)}</div>
          </div>
          <div style="padding:12px; background:white; border-radius:6px; border-left:4px solid #F57C00;">
            <div class="sub">Pendentes</div>
            <div style="font-size:18px; font-weight:600;">${formatarReal(despesasPendentes)}</div>
          </div>
          <div style="padding:12px; background:white; border-radius:6px; border-left:4px solid #C62828;">
            <div class="sub">Total Despesas</div>
            <div style="font-size:18px; font-weight:600;">${formatarReal(totalDespesas)}</div>
          </div>
        </div>
      </div>
    `;

  } catch (err) {
    showToast(err.message, "erro");
    dashEl.innerHTML = `<div class="empty-state">Erro ao carregar dados: ${err.message}</div>`;
  }
}
