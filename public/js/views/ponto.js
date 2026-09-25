import { api } from "../api.js";
import { store, showToast } from "../state.js";

function formatarHora(data) {
  if (!data) return "—";
  const d = new Date(data);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export async function renderPonto(root) {
  // Carregar dados do usuário logado
  const usuario = store.usuario;

  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Ponto</h2>
        <div class="sub">Registre sua entrada, saída e pausas de almoço. O sistema registra automaticamente a data e hora.</div>
      </div>
    </div>

    <div id="ponto-container" style="padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto;">
        <!-- Card com informações do usuário e botão principal -->
        <div class="card" style="text-align: center; padding: 30px; margin-bottom: 30px;">
          <h3>${usuario.nome}</h3>
          <p class="sub" style="margin-bottom: 20px;">${usuario.perfil}</p>

          <div id="status-ponto" style="margin-bottom: 30px;">
            <div style="font-size: 48px; margin-bottom: 10px;">⏱️</div>
            <div id="status-texto" class="sub" style="font-size: 14px;">Clique para bater ponto</div>
          </div>

          <button id="btn-bater-ponto" class="btn btn-primary btn-block" style="padding: 20px; font-size: 18px;">
            BATER PONTO
          </button>
        </div>

        <!-- Histórico do dia -->
        <div class="card">
          <h3 style="margin-bottom: 20px;">Histórico de Hoje</h3>
          <div id="historico-ponto">
            <div class="empty-state" style="padding: 20px;">Nenhum ponto registrado ainda</div>
          </div>
        </div>

        <!-- Histórico da semana -->
        <div class="card" style="margin-top: 20px;">
          <h3 style="margin-bottom: 20px;">Últimos 7 Dias</h3>
          <div id="historico-semana">
            <table style="width: 100%; font-size: 12px;">
              <thead>
                <tr style="border-bottom: 2px solid #e0e0e0;">
                  <th style="text-align: left; padding: 10px;">Data</th>
                  <th style="text-align: center; padding: 10px;">Entrada</th>
                  <th style="text-align: center; padding: 10px;">Saída</th>
                  <th style="text-align: center; padding: 10px;">Total</th>
                </tr>
              </thead>
              <tbody id="tabela-historico">
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;

  const btnBaterPonto = root.querySelector("#btn-bater-ponto");
  const statusTexto = root.querySelector("#status-texto");
  const historicoPonto = root.querySelector("#historico-ponto");
  const tabelaHistorico = root.querySelector("#tabela-historico");

  async function carregarPontosDeHoje() {
    try {
      const hoje = new Date().toISOString().split("T")[0];
      const pontos = await api.get(`/api/ponto/dia/${hoje}`);

      if (!pontos || pontos.length === 0) {
        historicoPonto.innerHTML = '<div class="empty-state" style="padding: 20px;">Nenhum ponto registrado ainda</div>';
        statusTexto.textContent = "Status: Aguardando entrada";
        return;
      }

      // Renderizar histórico
      historicoPonto.innerHTML = `
        <table style="width: 100%;">
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e0e0e0;">
              <div class="sub">Entrada</div>
              <div style="font-size: 18px; font-weight: bold;">${formatarHora(pontos[0]?.entrada)}</div>
            </td>
            <td style="padding: 10px; border-bottom: 1px solid #e0e0e0;">
              <div class="sub">Pausa (entrada)</div>
              <div style="font-size: 18px; font-weight: bold;">${formatarHora(pontos[0]?.pausaEntrada)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding: 10px;">
              <div class="sub">Pausa (saída)</div>
              <div style="font-size: 18px; font-weight: bold;">${formatarHora(pontos[0]?.pausaSaida)}</div>
            </td>
            <td style="padding: 10px;">
              <div class="sub">Saída</div>
              <div style="font-size: 18px; font-weight: bold;">${formatarHora(pontos[0]?.saida)}</div>
            </td>
          </tr>
        </table>
      `;

      // Atualizar status
      if (pontos[0]?.saida) {
        statusTexto.textContent = "Status: Dia finalizado";
      } else if (pontos[0]?.pausaSaida) {
        statusTexto.textContent = "Status: Em expediente (voltando)";
      } else if (pontos[0]?.pausaEntrada) {
        statusTexto.textContent = "Status: Em pausa";
      } else if (pontos[0]?.entrada) {
        statusTexto.textContent = "Status: Em expediente";
      }
    } catch (err) {
      console.error("Erro ao carregar pontos:", err);
    }
  }

  async function carregarHistoricoSemana() {
    try {
      const pontos = await api.get("/api/ponto/semana");
      if (!pontos || pontos.length === 0) {
        tabelaHistorico.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px;" class="sub">Nenhum registro</td></tr>';
        return;
      }

      tabelaHistorico.innerHTML = pontos.map((p) => {
        const data = new Date(p.data).toLocaleDateString("pt-BR");
        const entrada = formatarHora(p.entrada);
        const saida = formatarHora(p.saida);

        // Calcular total de horas
        let total = "—";
        if (p.entrada && p.saida) {
          const diff = new Date(p.saida) - new Date(p.entrada);
          const horas = Math.floor(diff / 3600000);
          const minutos = Math.floor((diff % 3600000) / 60000);
          total = `${horas}h ${minutos}m`;
        }

        return `
          <tr style="border-bottom: 1px solid #f0f0f0;">
            <td style="padding: 10px;">${data}</td>
            <td style="text-align: center; padding: 10px;">${entrada}</td>
            <td style="text-align: center; padding: 10px;">${saida}</td>
            <td style="text-align: center; padding: 10px;">${total}</td>
          </tr>
        `;
      }).join("");
    } catch (err) {
      console.error("Erro ao carregar histórico da semana:", err);
    }
  }

  btnBaterPonto.addEventListener("click", async () => {
    btnBaterPonto.disabled = true;
    btnBaterPonto.textContent = "Processando...";

    try {
      await api.post("/api/ponto/bater", {});
      showToast("Ponto registrado com sucesso!", "sucesso");
      await carregarPontosDeHoje();
      await carregarHistoricoSemana();
    } catch (err) {
      showToast(err.message || "Erro ao bater ponto", "erro");
    } finally {
      btnBaterPonto.disabled = false;
      btnBaterPonto.textContent = "BATER PONTO";
    }
  });

  // Carregar dados iniciais
  await carregarPontosDeHoje();
  await carregarHistoricoSemana();
}
