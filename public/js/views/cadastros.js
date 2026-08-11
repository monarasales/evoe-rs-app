// Configurações: só os parâmetros de operação do sistema (SLA, metas, numeração de
// contrato, tolerância do Ponto). O cadastro de funcionários mudou pra cá pra
// Colaborador > Equipe (ver equipe.js) — não é um "parâmetro", é a ficha da equipe.
import { api } from "../api.js";
import { isGestor, showToast } from "../state.js";

export async function renderConfiguracoes(root) {
  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Configurações</h2>
        <div class="sub">Parâmetros de operação do sistema. O cadastro de funcionários fica em Colaborador &gt; Equipe, e o de empresas clientes em CRM.</div>
      </div>
    </div>
    <div id="config-conteudo"></div>
  `;

  const conteudo = root.querySelector("#config-conteudo");
  conteudo.innerHTML = '<div class="empty-state">Carregando parâmetros...</div>';
  const cfg = await api.get("/api/config");
  conteudo.innerHTML = `
    <div class="sub" style="margin-bottom:14px;">
      Regras de negócio que o sistema usa para calcular prazos, SLA e metas. Hoje esses valores
      são definidos junto comigo (Claude) — se algum precisar mudar, é só pedir por aqui.
    </div>
    <div class="grid-cards">
      <div class="card">
        <div class="kpi-label">SLA ideal de fechamento</div>
        <div class="kpi-value">${cfg.slaDiasIdeal}d</div>
        <div class="sub" style="margin-top:6px;">Fechar até esse prazo vale a pontuação máxima (peso 2) no ranking de SLA.</div>
      </div>
      <div class="card">
        <div class="kpi-label">SLA limite de fechamento</div>
        <div class="kpi-value">${cfg.slaDiasLimite}d</div>
        <div class="sub" style="margin-top:6px;">Nosso padrão interno de fechamento. Acima disso, a vaga conta como fora do SLA.</div>
      </div>
      <div class="card">
        <div class="kpi-label">Aviso de SLA próximo</div>
        <div class="kpi-value">${cfg.diasAlertaSlaProximo}d antes</div>
        <div class="sub" style="margin-top:6px;">Quantos dias antes do limite o consultor recebe o primeiro aviso de atenção.</div>
      </div>
      <div class="card">
        <div class="kpi-label">Aviso de prazo do cliente</div>
        <div class="kpi-value">${cfg.diasAlertaPrazo}d antes</div>
        <div class="sub" style="margin-top:6px;">Quantos dias antes do prazo combinado com o cliente o consultor é avisado.</div>
      </div>
      <div class="card">
        <div class="kpi-label">Meta mensal por consultor</div>
        <div class="kpi-value">${cfg.metaVagasFechadasMes}</div>
        <div class="sub" style="margin-top:6px;">Quantidade de vagas fechadas por mês esperada de cada consultor.</div>
      </div>
    </div>
    ${
      isGestor()
        ? `
    <div class="section-title" style="margin-top:22px;">Numeração de Contratos</div>
    <div class="card" style="max-width:420px;">
      <div class="sub" style="margin-bottom:10px;">Próximo número que será usado ao gerar um novo contrato (ex: se sua numeração real parou em 0030/2025, deixe aqui 31).</div>
      <form id="form-proximo-numero" class="form-cols" style="align-items:end;">
        <div class="form-row"><label>Próximo número de contrato</label><input type="number" min="1" id="pn-numero" value="${cfg.proximoNumeroContrato}" /></div>
        <div class="form-row"><button type="submit" class="btn btn-primary btn-sm">Salvar</button></div>
      </form>
      <div id="pn-erro" class="form-erro hidden"></div>
    </div>

    <div class="section-title" style="margin-top:22px;">Controle de Ponto — Raio de Tolerância</div>
    <div class="card" style="max-width:480px;">
      <div class="sub" style="margin-bottom:10px;">
        Distância máxima (em metros) entre a localização batida e o endereço cadastrado (residencial ou de trabalho) mais
        próximo para não avisar "Fora do local". Aumente esse valor se estiver aparecendo aviso indevido com frequência —
        o GPS de notebook/desktop costuma ser bem menos preciso do que o de celular.
      </div>
      <form id="form-tolerancia-ponto" class="form-cols" style="align-items:end;">
        <div class="form-row"><label>Raio de tolerância (metros)</label><input type="number" min="50" step="50" id="tp-raio" value="${cfg.toleranciaPontoMetros}" /></div>
        <div class="form-row"><button type="submit" class="btn btn-primary btn-sm">Salvar</button></div>
      </form>
      <div id="tp-erro" class="form-erro hidden"></div>
    </div>`
        : ""
    }
  `;
  if (isGestor()) {
    const form = conteudo.querySelector("#form-proximo-numero");
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try {
        await api.patch("/api/config/proximo-numero-contrato", {
          proximoNumero: Number(document.getElementById("pn-numero").value),
        });
        showToast("Número salvo.", "sucesso");
      } catch (err) {
        const box = conteudo.querySelector("#pn-erro");
        box.textContent = err.message;
        box.classList.remove("hidden");
      }
    });

    const formTolerancia = conteudo.querySelector("#form-tolerancia-ponto");
    formTolerancia.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try {
        await api.patch("/api/config/tolerancia-ponto", {
          toleranciaMetros: Number(document.getElementById("tp-raio").value),
        });
        showToast("Raio de tolerância salvo.", "sucesso");
      } catch (err) {
        const box = conteudo.querySelector("#tp-erro");
        box.textContent = err.message;
        box.classList.remove("hidden");
      }
    });
  }
}
