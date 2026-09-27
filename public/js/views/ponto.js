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
  const raioPermitido = root.querySelector("#raio-permitido");

  let meuCadastro = null;
  let pontoHoje = null;

  // Qual será o próximo registro ao tocar no botão (mesma ordem do servidor).
  function proximaAcao(p) {
    if (!p || !p.entrada) return "Registrar ENTRADA";
    if (p.saida) return null;
    if (!p.pausaEntrada) return "Iniciar PAUSA";
    if (!p.pausaSaida) return "VOLTAR da pausa";
    return "Registrar SAÍDA";
  }

  function atualizarBotao() {
    if (!meuCadastro || !meuCadastro.ativo) {
      btnBaterPonto.disabled = true;
      btnBaterPonto.textContent = "PONTO INDISPONÍVEL";
      return;
    }
    const acao = proximaAcao(pontoHoje);
    btnBaterPonto.disabled = !acao;
    btnBaterPonto.textContent = acao || "JORNADA DE HOJE ENCERRADA";
  }

  const temCoordenadas = (loc) => loc && loc.lat != null && loc.long != null;

  // Carregar cadastro + localização
  async function carregarLocalizacaoAtual() {
    erroLocalizacao.textContent = "";

    try {
      meuCadastro = await api.get("/api/ponto/meu-cadastro");
    } catch (err) {
      meuCadastro = null;
      statusTexto.textContent = "Ponto indisponível para o seu usuário";
      erroLocalizacao.textContent = `⚠️ ${err.message}`;
      atualizarBotao();
      return;
    }
    if (!meuCadastro.ativo) {
      statusTexto.textContent = "Seu cadastro de colaborador está inativo. Fale com o Gestor.";
      atualizarBotao();
      return;
    }
    atualizarBotao();

    try {
      statusTexto.textContent = "📍 Obtendo sua localização...";
      const loc = await obterLocalizacao();
      localizacaoAtual = loc;
      suaLocalizacao.textContent = `${loc.lat.toFixed(4)}, ${loc.long.toFixed(4)}`;

      const casa = meuCadastro.ehHomeOffice && temCoordenadas(meuCadastro.localizacaoResidencial);
      const alvo = casa
        ? { nome: "casa", endereco: meuCadastro.enderecoResidencial, loc: meuCadastro.localizacaoResidencial, raio: meuCadastro.raioTolerancia }
        : temCoordenadas(meuCadastro.localizacaoEmpresa)
        ? { nome: "empresa", endereco: meuCadastro.enderecoEmpresa, loc: meuCadastro.localizacaoEmpresa, raio: meuCadastro.raioEmpresa }
        : null;

      if (!alvo) {
        statusTexto.textContent = meuCadastro.ehHomeOffice
          ? "📍 Hoje é home office — localização registrada"
          : "📍 Localização registrada";
        localPermitido.textContent = "Não configurado";
        return;
      }

      localPermitido.textContent = alvo.endereco || (alvo.nome === "casa" ? "Sua casa" : "Empresa");
      raioPermitido.textContent = `${alvo.raio} m`;
      const distRound = Math.round(calcularDistancia(loc.lat, loc.long, alvo.loc.lat, alvo.loc.long));
      distanciaMetros.textContent = `${distRound} m`;
      if (distRound <= alvo.raio) {
        statusTexto.textContent = alvo.nome === "casa" ? "✅ Você está em casa (home office)" : "✅ Você está na empresa";
        statusDistancia.textContent = `${distRound}m de distância`;
        statusDistancia.style.color = "#2ecc71";
      } else {
        statusTexto.textContent = alvo.nome === "casa" ? "⚠️ Você está longe de casa" : "⚠️ Você está longe da empresa";
        statusDistancia.textContent = `${distRound}m (limite: ${alvo.raio}m) — o ponto é registrado com aviso`;
        statusDistancia.style.color = "#f39c12";
      }
    } catch (err) {
      erroLocalizacao.textContent = `⚠️ ${err.message}. Permita o acesso à localização no navegador para bater o ponto.`;
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
      const hoje = new Date().toLocaleDateString("en-CA"); // data local AAAA-MM-DD
      const pontos = await api.get(`/api/ponto/dia/${hoje}`);
      pontoHoje = pontos && pontos[0] ? pontos[0] : null;
      atualizarBotao();

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
        const data = p.data ? p.data.split("-").reverse().join("/") : "—";
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
      atualizarBotao();
    }
  });

  // Carregar dados iniciais
  await carregarLocalizacaoAtual();
  await carregarPontosDeHoje();
  await carregarHistoricoSemana();
}
