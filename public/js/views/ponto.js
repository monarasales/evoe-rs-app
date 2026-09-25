import { api } from "../api.js";
import { store, showToast } from "../state.js";

function formatarHora(data) {
  if (!data) return "—";
  const d = new Date(data);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// Solicitar localização GPS
async function obterLocalizacao() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocalização não suportada por este navegador."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          long: position.coords.longitude,
        });
      },
      (error) => {
        reject(new Error(`Erro ao obter localização: ${error.message}`));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  });
}

export async function renderPonto(root) {
  const usuario = store.usuario;
  let localizacaoAtual = null;

  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Ponto</h2>
        <div class="sub">Registre sua entrada, saída e pausas. Sistema valida sua localização.</div>
      </div>
    </div>

    <div id="ponto-container" style="padding: 20px;">
      <div style="max-width: 700px; margin: 0 auto;">
        <!-- Card com informações do usuário -->
        <div class="card" style="text-align: center; padding: 30px; margin-bottom: 20px;">
          <h3>${usuario.nome}</h3>
          <p class="sub" style="margin-bottom: 20px;">${usuario.perfil}</p>

          <div id="status-ponto" style="margin-bottom: 30px;">
            <div style="font-size: 48px; margin-bottom: 10px;">📍</div>
            <div id="status-texto" class="sub" style="font-size: 14px;">Aguardando localização...</div>
            <div id="status-localizacao" style="font-size: 12px; color: #666; margin-top: 10px;"></div>
            <div id="status-distancia" style="font-size: 14px; font-weight: bold; margin-top: 10px; color: #2ecc71;"></div>
          </div>

          <button id="btn-bater-ponto" class="btn btn-primary btn-block" style="padding: 20px; font-size: 18px; margin-bottom: 10px;">
            BATER PONTO
          </button>
          <div id="erro-localizacao" class="sub" style="color: #c0392b; margin-top: 10px;"></div>
        </div>

        <!-- Zona de Segurança -->
        <div class="card" style="margin-bottom: 20px;">
          <h3 style="margin-bottom: 15px;">🗺️ Validação de Local</h3>
          <div id="info-zona" style="padding: 15px; background: #f9f9f9; border-radius: 6px; font-size: 13px;">
            <p style="margin: 8px 0;"><strong>Sua localização:</strong> <span id="sua-localizacao">—</span></p>
            <p style="margin: 8px 0;"><strong>Local permitido:</strong> <span id="local-permitido">—</span></p>
            <p style="margin: 8px 0;"><strong>Distância:</strong> <span id="distancia-metros">—</span></p>
            <p style="margin: 8px 0;"><strong>Raio permitido:</strong> <span id="raio-permitido">500 m</span></p>
          </div>
        </div>

        <!-- Histórico do dia -->
        <div class="card" style="margin-bottom: 20px;">
          <h3 style="margin-bottom: 20px;">Histórico de Hoje</h3>
          <div id="historico-ponto">
            <div class="empty-state" style="padding: 20px;">Nenhum ponto registrado ainda</div>
          </div>
        </div>

        <!-- Histórico da semana -->
        <div class="card">
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
  const statusLocalizacao = root.querySelector("#status-localizacao");
  const statusDistancia = root.querySelector("#status-distancia");
  const erroLocalizacao = root.querySelector("#erro-localizacao");
  const historicoPonto = root.querySelector("#historico-ponto");
  const tabelaHistorico = root.querySelector("#tabela-historico");
  const suaLocalizacao = root.querySelector("#sua-localizacao");
  const localPermitido = root.querySelector("#local-permitido");
  const distanciaMetros = root.querySelector("#distancia-metros");

  // Carregar localização inicial
  async function carregarLocalizacaoAtual() {
    try {
      erroLocalizacao.textContent = "";
      statusTexto.textContent = "📍 Obtendo sua localização...";
      const loc = await obterLocalizacao();
      localizacaoAtual = loc;

      // Buscar configuração da empresa e dados do colaborador
      const empresa = await api.get("/api/configuracao/empresa");
      const colaboradores = await api.get("/api/colaboradores");
      const colaborador = colaboradores.find((c) => c.id === usuario.id || c.id === usuario.consultorId);

      if (!colaborador) {
        statusTexto.textContent = "Erro: Dados do colaborador não encontrados.";
        return;
      }

      // Determinar dia da semana
      const diasSemana = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
      const diaSemana = diasSemana[new Date().getDay()];
      const ehHomeOffice = colaborador.diasHomeOffice && colaborador.diasHomeOffice.includes(diaSemana);

      // Exibir localização atual
      suaLocalizacao.textContent = `${loc.lat.toFixed(4)}, ${loc.long.toFixed(4)}`;

      if (ehHomeOffice && colaborador.localizacaoResidencial) {
        // Modo home office - validar localização residencial
        localPermitido.textContent = `${colaborador.enderecoResidencial}`;
        const dist = calcularDistancia(
          loc.lat,
          loc.long,
          colaborador.localizacaoResidencial.lat,
          colaborador.localizacaoResidencial.long
        );
        const distRound = Math.round(dist);
        distanciaMetros.textContent = `${distRound} m`;

        if (distRound <= colaborador.raioTolerancia) {
          statusTexto.textContent = `✅ Você está em casa!`;
          statusDistancia.textContent = `${distRound}m de distância`;
          statusDistancia.style.color = "#2ecc71";
        } else {
          statusTexto.textContent = `⚠️ Você está longe de casa!`;
          statusDistancia.textContent = `${distRound}m (limite: ${colaborador.raioTolerancia}m)`;
          statusDistancia.style.color = "#f39c12";
        }
      } else if (empresa.localizacaoEmpresa) {
        // Modo presencial - validar localização da empresa
        localPermitido.textContent = `${empresa.enderecoEmpresa}`;
        const dist = calcularDistancia(
          loc.lat,
          loc.long,
          empresa.localizacaoEmpresa.lat,
          empresa.localizacaoEmpresa.long
        );
        const distRound = Math.round(dist);
        distanciaMetros.textContent = `${distRound} m`;

        if (distRound <= empresa.raioTolerancia) {
          statusTexto.textContent = `✅ Você está na empresa!`;
          statusDistancia.textContent = `${distRound}m de distância`;
          statusDistancia.style.color = "#2ecc71";
        } else {
          statusTexto.textContent = `⚠️ Você está longe da empresa!`;
          statusDistancia.textContent = `${distRound}m (limite: ${empresa.raioTolerancia}m)`;
          statusDistancia.style.color = "#f39c12";
        }
      } else {
        statusTexto.textContent = "📍 Localização carregada";
        localPermitido.textContent = "Não configurada";
      }
    } catch (err) {
      erroLocalizacao.textContent = `⚠️ ${err.message}`;
      statusTexto.textContent = "Erro ao obter localização";
    }
  }

  function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c * 1000;
  }

  async function carregarPontosDeHoje() {
    try {
      const hoje = new Date().toISOString().split("T")[0];
      const pontos = await api.get(`/api/ponto/dia/${hoje}`);

      if (!pontos || pontos.length === 0) {
        historicoPonto.innerHTML = '<div class="empty-state" style="padding: 20px;">Nenhum ponto registrado ainda</div>';
        return;
      }

      historicoPonto.innerHTML = `
        <table style="width: 100%; font-size: 13px;">
          <tr>
            <td style="padding: 12px; border-bottom: 1px solid #e0e0e0;">
              <div class="sub">Entrada</div>
              <div style="font-size: 16px; font-weight: bold;">${formatarHora(pontos[0]?.entrada)}</div>
              ${pontos[0]?.entradaDentroZona ? "✅" : "⚠️"}
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #e0e0e0;">
              <div class="sub">Pausa</div>
              <div style="font-size: 16px; font-weight: bold;">${formatarHora(pontos[0]?.pausaEntrada)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px;">
              <div class="sub">Volta</div>
              <div style="font-size: 16px; font-weight: bold;">${formatarHora(pontos[0]?.pausaSaida)}</div>
            </td>
            <td style="padding: 12px;">
              <div class="sub">Saída</div>
              <div style="font-size: 16px; font-weight: bold;">${formatarHora(pontos[0]?.saida)}</div>
              ${pontos[0]?.saidaDentroZona !== undefined ? (pontos[0]?.saidaDentroZona ? "✅" : "⚠️") : ""}
            </td>
          </tr>
        </table>
      `;
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

        let total = "—";
        if (p.entrada && p.saida) {
          const diff = new Date(p.saida) - new Date(p.entrada);
          let duracao = diff;
          if (p.pausaEntrada && p.pausaSaida) {
            duracao -= new Date(p.pausaSaida) - new Date(p.pausaEntrada);
          }
          const horas = Math.floor(duracao / 3600000);
          const minutos = Math.floor((duracao % 3600000) / 60000);
          total = `${horas}h ${minutos}m`;
        }

        const iconeEntrada = p.entradaDentroZona ? "✅" : "⚠️";

        return `
          <tr style="border-bottom: 1px solid #f0f0f0;">
            <td style="padding: 10px;">${data}</td>
            <td style="text-align: center; padding: 10px;">${entrada} ${iconeEntrada}</td>
            <td style="text-align: center; padding: 10px;">${saida}</td>
            <td style="text-align: center; padding: 10px;">${total}</td>
          </tr>
        `;
      }).join("");
    } catch (err) {
      console.error("Erro ao carregar histórico:", err);
    }
  }

  btnBaterPonto.addEventListener("click", async () => {
    if (!localizacaoAtual) {
      showToast("Localização não carregada. Tente novamente.", "erro");
      return;
    }

    btnBaterPonto.disabled = true;
    btnBaterPonto.textContent = "Processando...";

    try {
      await api.post("/api/ponto/bater", {
        lat: localizacaoAtual.lat,
        long: localizacaoAtual.long,
      });
      showToast("Ponto registrado com sucesso!", "sucesso");
      await carregarPontosDeHoje();
      await carregarHistoricoSemana();
      await carregarLocalizacaoAtual();
    } catch (err) {
      showToast(err.message || "Erro ao bater ponto", "erro");
    } finally {
      btnBaterPonto.disabled = false;
      btnBaterPonto.textContent = "BATER PONTO";
    }
  });

  // Carregar dados iniciais
  await carregarLocalizacaoAtual();
  await carregarPontosDeHoje();
  await carregarHistoricoSemana();
}
