import { api } from "../api.js";
import { store, showToast, podeGerenciarVagas, usaControlePonto, isGestor } from "../state.js";
import { obterLocalizacao, linkMapa } from "../geo.js";
import { abrirModal, fecharModal } from "../modal.js";
import { blocoDoDia } from "../horarioBlocos.js";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function formatarDataCurta(iso) {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return `${dia}/${mes}`;
}

function formatarAnoMes(anoMes) {
  if (!anoMes) return "—";
  const [ano, mes] = anoMes.split("-");
  return `${mes}/${ano}`;
}

function tagSaldoValor(v) {
  const numero = Number(v) || 0;
  if (numero > 0.05) return `<span class="tag tag-nprazo">+${numero}h</span>`;
  if (numero < -0.05) return `<span class="tag tag-atrasada">${numero}h</span>`;
  return '<span class="tag tag-encerrada">0h</span>';
}

function tagSaldo(saldo) {
  const v = Number(saldo) || 0;
  if (v > 0.05) return `<span class="tag tag-nprazo">+${v}h banco de horas</span>`;
  if (v < -0.05) return `<span class="tag tag-atrasada">${v}h a descontar</span>`;
  return '<span class="tag tag-encerrada">Em dia</span>';
}

const ROTULO_REFERENCIA = { trabalho: "trabalho", residencial: "casa" };

// Mostra a hora batida, um link pro mapa (quando há localização) e, quando dá pra
// identificar, QUAL dos dois endereços cadastrados bateu mais perto — não fixa numa
// modalidade só, porque a mesma pessoa pode estar no escritório num dia e em casa
// noutro.
function localizacaoCelula(hora, lat, lng, foraDoLocal, distancia, referencia) {
  if (!hora) return "—";
  let html = hora;
  if (lat != null && lng != null) {
    html += ` <a href="${linkMapa(lat, lng)}" target="_blank" rel="noopener" title="Ver localização no mapa">📍</a>`;
  }
  if (referencia && !foraDoLocal) {
    html += ` <span class="sub">(${ROTULO_REFERENCIA[referencia] || referencia})</span>`;
  }
  if (foraDoLocal) {
    html += ` <span class="tag tag-atrasada" title="Distância aproximada: ${distancia ?? "?"}m do endereço mais próximo cadastrado">⚠️ Fora do local</span>`;
  }
  return html;
}

// Início/fim (AAAA-MM-DD) de um mês relativo ao atual (0 = este mês, -1 = mês passado).
// O fim do mês atual é sempre "hoje" (não faz sentido pedir resumo do futuro).
function periodoMes(offsetMeses) {
  const hoje = new Date();
  const alvo = new Date(hoje.getFullYear(), hoje.getMonth() + offsetMeses, 1);
  const inicio = alvo.toISOString().slice(0, 10);
  const ultimoDiaMes = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).toISOString().slice(0, 10);
  const hojeStr = hoje.toISOString().slice(0, 10);
  const fim = offsetMeses === 0 && ultimoDiaMes > hojeStr ? hojeStr : ultimoDiaMes;
  return { inicio, fim };
}

// Início/fim (AAAA-MM-DD) de uma semana (Segunda a Domingo) relativa à atual
// (0 = esta semana, -1 = semana passada) — usado pro acompanhamento semanal do
// Banco de Horas, pra não deixar o saldo ultrapassar muito antes do fechamento do mês.
function periodoSemana(offsetSemanas) {
  const hoje = new Date();
  const diaSemanaNum = hoje.getDay(); // 0=Domingo..6=Sábado
  const diffParaSegunda = diaSemanaNum === 0 ? -6 : 1 - diaSemanaNum;
  const segunda = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + diffParaSegunda + offsetSemanas * 7);
  const domingo = new Date(segunda.getFullYear(), segunda.getMonth(), segunda.getDate() + 6);
  const inicio = segunda.toISOString().slice(0, 10);
  const fimCalc = domingo.toISOString().slice(0, 10);
  const hojeStr = hoje.toISOString().slice(0, 10);
  const fim = offsetSemanas === 0 && fimCalc > hojeStr ? hojeStr : fimCalc;
  return { inicio, fim };
}

export async function renderPonto(root) {
  if (podeGerenciarVagas()) {
    await renderGestor(root);
  } else if (usaControlePonto()) {
    await renderMeuPonto(root);
  } else {
    root.innerHTML = '<div class="empty-state">Controle de Ponto não está habilitado para o seu cadastro.</div>';
  }
}

// ================== Modais de correção (Gestor/Supervisora) ==================

// Corrige uma batida existente (esqueceu de bater, bateu no horário errado, etc).
// Só o Gestor tem acesso a essa tela (ver botão "Editar" mais abaixo) — a Supervisora
// continua vendo os relatórios normalmente, só não altera os horários registrados.
function abrirModalEditarPonto(registro, nomeConsultor, aoSalvar) {
  abrirModal(`
    <h2>Corrigir Ponto — ${escapeHtml(nomeConsultor)}</h2>
    <p class="sub">${formatarDataCurta(registro.data)} (${registro.diaSemana})</p>
    <form id="form-editar-ponto">
      <div class="form-cols">
        <div class="form-row"><label>Entrada</label><input type="time" id="ep-entrada" value="${registro.horaEntrada || ""}" required /></div>
        <div class="form-row"><label>Saída</label><input type="time" id="ep-saida" value="${registro.horaSaida || ""}" /></div>
      </div>
      <div class="form-cols">
        <div class="form-row"><label>Saída p/ almoço</label><input type="time" id="ep-pausa-saida" value="${registro.pausaSaida || ""}" /></div>
        <div class="form-row"><label>Volta do almoço</label><input type="time" id="ep-pausa-entrada" value="${registro.pausaEntrada || ""}" /></div>
      </div>
      <div class="sub" style="margin-top:-6px;">Deixe em branco o que ainda não foi batido (ou não se aplica). A localização registrada originalmente não muda.</div>
      <div id="editar-ponto-erro" class="form-erro hidden"></div>
      <div class="modal-close-row">
        <button type="button" id="btn-cancelar-ep" class="btn btn-outline">Fechar</button>
        <button type="submit" class="btn btn-primary">Salvar correção</button>
      </div>
    </form>
  `);
  document.getElementById("btn-cancelar-ep").addEventListener("click", fecharModal);
  document.getElementById("form-editar-ponto").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const erroEl = document.getElementById("editar-ponto-erro");
    erroEl.classList.add("hidden");
    try {
      await api.patch(`/api/ponto/${registro.id}`, {
        horaEntrada: document.getElementById("ep-entrada").value,
        horaSaida: document.getElementById("ep-saida").value || null,
        pausaSaida: document.getElementById("ep-pausa-saida").value || null,
        pausaEntrada: document.getElementById("ep-pausa-entrada").value || null,
      });
      showToast("Ponto corrigido.", "sucesso");
      fecharModal();
      aoSalvar();
    } catch (err) {
      erroEl.textContent = err.message;
      erroEl.classList.remove("hidden");
    }
  });
}

// Lança um dia que ficou sem nenhum registro (a pessoa esqueceu de logar naquele dia).
function abrirModalPontoManual(consultores, aoSalvar) {
  abrirModal(`
    <h2>Registrar Ponto Manualmente</h2>
    <p class="sub">Use quando alguém esqueceu de bater o ponto naquele dia. Para corrigir um dia que já tem registro, use "Editar" na lista de dias.</p>
    <form id="form-ponto-manual">
      <div class="form-row">
        <label>Funcionário</label>
        <select id="pm-consultor" required>
          ${consultores.map((c) => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join("")}
        </select>
      </div>
      <div class="form-row"><label>Data</label><input type="date" id="pm-data" required max="${new Date().toISOString().slice(0, 10)}" /></div>
      <div class="form-cols">
        <div class="form-row"><label>Entrada</label><input type="time" id="pm-entrada" required /></div>
        <div class="form-row"><label>Saída (opcional)</label><input type="time" id="pm-saida" /></div>
      </div>
      <div id="ponto-manual-erro" class="form-erro hidden"></div>
      <div class="modal-close-row">
        <button type="button" id="btn-cancelar-pm" class="btn btn-outline">Fechar</button>
        <button type="submit" class="btn btn-primary">Registrar</button>
      </div>
    </form>
  `);
  document.getElementById("btn-cancelar-pm").addEventListener("click", fecharModal);
  document.getElementById("form-ponto-manual").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const erroEl = document.getElementById("ponto-manual-erro");
    erroEl.classList.add("hidden");
    try {
      await api.post("/api/ponto/manual", {
        consultorId: document.getElementById("pm-consultor").value,
        data: document.getElementById("pm-data").value,
        horaEntrada: document.getElementById("pm-entrada").value,
        horaSaida: document.getElementById("pm-saida").value || null,
      });
      showToast("Ponto registrado.", "sucesso");
      fecharModal();
      aoSalvar();
    } catch (err) {
      erroEl.textContent = err.message;
      erroEl.classList.remove("hidden");
    }
  });
}

// Funcionário registra uma ocorrência (não conseguiu bater o ponto no horário certo)
// pra um dia específico — não precisa ser hoje, pode ser um dia recente que esqueceu.
function abrirModalRegistrarOcorrencia(aoSalvar) {
  abrirModal(`
    <h2>Registrar Ocorrência de Ponto</h2>
    <p class="sub">Explique o que aconteceu — o Gestor avalia e, se aceitar, corrige seu ponto manualmente.</p>
    <form id="form-registrar-ocorrencia">
      <div class="form-row"><label>Data</label><input type="date" id="oc-data" required max="${new Date().toISOString().slice(0, 10)}" value="${new Date().toISOString().slice(0, 10)}" /></div>
      <div class="form-row"><label>O que aconteceu?</label><textarea id="oc-motivo" rows="3" required placeholder="ex: esqueci de bater a entrada, celular sem internet, etc."></textarea></div>
      <div id="registrar-ocorrencia-erro" class="form-erro hidden"></div>
      <div class="modal-close-row">
        <button type="button" id="btn-cancelar-oc" class="btn btn-outline">Fechar</button>
        <button type="submit" class="btn btn-primary">Enviar</button>
      </div>
    </form>
  `);
  document.getElementById("btn-cancelar-oc").addEventListener("click", fecharModal);
  document.getElementById("form-registrar-ocorrencia").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const erroEl = document.getElementById("registrar-ocorrencia-erro");
    erroEl.classList.add("hidden");
    try {
      await api.post("/api/ocorrencias-ponto", {
        data: document.getElementById("oc-data").value,
        motivo: document.getElementById("oc-motivo").value.trim(),
      });
      showToast("Ocorrência enviada para o Gestor.", "sucesso");
      fecharModal();
      aoSalvar();
    } catch (err) {
      erroEl.textContent = err.message;
      erroEl.classList.remove("hidden");
    }
  });
}

// Aceita ou recusa a justificativa de uma ocorrência de ponto. Aceitar NÃO corrige o
// ponto sozinho — o Gestor ainda precisa usar "Editar"/"+ Registrar manualmente" pra
// ajustar o horário de verdade, decisão explícita da usuária de manter esse controle
// sempre nas mãos dela.
function abrirModalResponderOcorrencia(ocorrencia, nomeConsultor, statusEscolhido, aoSalvar) {
  const aceitando = statusEscolhido === "Aprovada";
  abrirModal(`
    <h2>${aceitando ? "Aceitar" : "Recusar"} Ocorrência — ${escapeHtml(nomeConsultor)}</h2>
    <p class="sub">${formatarDataCurta(ocorrencia.data)} — motivo informado: "${escapeHtml(ocorrencia.motivo)}"</p>
    ${
      aceitando
        ? '<div class="sub" style="margin-top:-6px;">Isso só registra que a justificativa foi aceita — o horário em si continua precisando ser corrigido manualmente ("Editar" ou "+ Registrar manualmente" na lista de dias).</div>'
        : ""
    }
    <form id="form-responder-ocorrencia">
      <div class="form-row"><label>Observação (opcional)</label><textarea id="ro-observacao" rows="2" placeholder="${aceitando ? "ex: corrigido no dia X" : "ex: justificativa não procede"}"></textarea></div>
      <div id="responder-ocorrencia-erro" class="form-erro hidden"></div>
      <div class="modal-close-row">
        <button type="button" id="btn-cancelar-ro" class="btn btn-outline">Fechar</button>
        <button type="submit" class="btn ${aceitando ? "btn-primary" : "btn-outline"}">${aceitando ? "Aceitar" : "Recusar"}</button>
      </div>
    </form>
  `);
  document.getElementById("btn-cancelar-ro").addEventListener("click", fecharModal);
  document.getElementById("form-responder-ocorrencia").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const erroEl = document.getElementById("responder-ocorrencia-erro");
    erroEl.classList.add("hidden");
    try {
      await api.patch(`/api/ocorrencias-ponto/${ocorrencia.id}/responder`, {
        status: statusEscolhido,
        respostaObservacao: document.getElementById("ro-observacao").value,
      });
      showToast(aceitando ? "Ocorrência aceita." : "Ocorrência recusada.", "sucesso");
      fecharModal();
      aoSalvar();
    } catch (err) {
      erroEl.textContent = err.message;
      erroEl.classList.remove("hidden");
    }
  });
}

// Banco de Horas de um funcionário: histórico de meses fechados (com o saldo que foi
// transportado) + fechamento do próximo mês em aberto. Fechar um mês só TRAVA os
// registros de ponto dele contra edição — o sistema nunca decide sozinho se o saldo
// vira hora extra paga, folga ou fica acumulado; isso é sempre uma decisão do Gestor,
// registrada no campo "Saldo transportado" (editável) e nas observações.
async function abrirModalBancoHoras(consultor, aoSalvar) {
  abrirModal('<h2>Banco de Horas — ' + escapeHtml(consultor.nome) + '</h2><div id="bh-conteudo" class="empty-state">Carregando...</div>');
  const conteudoEl = document.getElementById("bh-conteudo");

  async function carregar() {
    const fechamentos = await api.get(`/api/fechamentos-ponto?consultorId=${consultor.id}`);
    const ultimoAtivo = fechamentos.find((f) => f.status === "Fechado") || null;
    const mesSugerido = ultimoAtivo ? proximoAnoMes(ultimoAtivo.anoMes) : mesAnteriorAoAtual();

    conteudoEl.innerHTML = `
      <div class="kpi-row" style="margin-bottom:16px;">
        <div class="kpi-card">
          <div class="kpi-label">Saldo acumulado atual</div>
          <div class="kpi-value">${tagSaldoValor(ultimoAtivo ? ultimoAtivo.saldoTransportado : 0)}</div>
          <div class="sub" style="margin-top:4px;">Soma de todos os meses já fechados.</div>
        </div>
      </div>

      <h3 class="section-title">Fechar um mês</h3>
      <div class="form-cols">
        <div class="form-row"><label>Mês</label><input type="month" id="bh-mes" value="${mesSugerido}" /></div>
        <div class="form-row" style="align-self:flex-end;"><button type="button" id="bh-consultar" class="btn btn-outline btn-sm">Consultar</button></div>
      </div>
      <div id="bh-preview"></div>

      <h3 class="section-title" style="margin-top:22px;">Histórico de fechamentos</h3>
      ${
        fechamentos.length === 0
          ? '<div class="empty-state">Nenhum mês fechado ainda.</div>'
          : `<table>
              <thead><tr><th>Mês</th><th>Saldo do mês</th><th>Saldo transportado</th><th>Status</th><th>Observações</th><th></th></tr></thead>
              <tbody>
                ${fechamentos
                  .map(
                    (f) => `
                  <tr data-id="${f.id}">
                    <td>${formatarAnoMes(f.anoMes)}</td>
                    <td>${tagSaldoValor(f.saldoDoMes)}</td>
                    <td>${tagSaldoValor(f.saldoTransportado)}</td>
                    <td>${f.status === "Fechado" ? '<span class="tag tag-encerrada">Fechado</span>' : '<span class="tag tag-standby">Reaberto</span>'}</td>
                    <td>${escapeHtml(f.observacoes || "—")}</td>
                    <td>
                      ${
                        f.status === "Fechado"
                          ? '<button class="btn btn-outline btn-sm btn-bh-editar">Editar saldo</button> <button class="btn btn-outline btn-sm btn-bh-reabrir">Reabrir</button>'
                          : ""
                      }
                    </td>
                  </tr>`
                  )
                  .join("")}
              </tbody>
            </table>`
      }
    `;

    document.getElementById("bh-consultar").addEventListener("click", consultarPreview);

    conteudoEl.querySelectorAll(".btn-bh-editar").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const id = e.target.closest("tr").dataset.id;
        const fechamento = fechamentos.find((f) => f.id === id);
        editarSaldoTransportado(fechamento);
      });
    });
    conteudoEl.querySelectorAll(".btn-bh-reabrir").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const id = e.target.closest("tr").dataset.id;
        if (!confirm(`Reabrir ${formatarAnoMes(fechamentos.find((f) => f.id === id).anoMes)}? Isso destrava os registros de ponto desse mês para correção.`)) return;
        try {
          const resultado = await api.patch(`/api/fechamentos-ponto/${id}/reabrir`, {});
          if (resultado.aviso) showToast(resultado.aviso, "erro");
          else showToast("Mês reaberto.", "sucesso");
          carregar();
          aoSalvar();
        } catch (err) {
          showToast(err.message, "erro");
        }
      });
    });

    await consultarPreview();
  }

  async function consultarPreview() {
    const anoMes = document.getElementById("bh-mes").value;
    const previewEl = document.getElementById("bh-preview");
    if (!anoMes) {
      previewEl.innerHTML = "";
      return;
    }
    previewEl.innerHTML = '<div class="sub">Consultando...</div>';
    try {
      const p = await api.get(`/api/fechamentos-ponto/preview?consultorId=${consultor.id}&anoMes=${anoMes}`);
      previewEl.innerHTML = `
        <div class="card" style="margin:12px 0;">
          <div class="sub">Saldo acumulado até o mês anterior: ${tagSaldoValor(p.saldoAcumuladoAnterior)} &nbsp;+&nbsp; Saldo de ${formatarAnoMes(p.anoMes)}: ${tagSaldoValor(p.saldoDoMes)} &nbsp;=&nbsp; Saldo final calculado: ${tagSaldoValor(p.saldoFinalCalculado)}</div>
          ${
            p.podeFechar
              ? `<div class="form-row" style="margin-top:10px;"><label>Saldo transportado para o próximo mês (edite se já decidiu pagar/descontar/dar folga de parte)</label><input type="number" step="0.01" id="bh-saldo-transportado" value="${p.saldoFinalCalculado}" /></div>
                 <div class="form-row"><label>Observações (opcional)</label><textarea id="bh-observacoes" rows="2" placeholder="Ex: 2h pagas como hora extra em folha, restante acumula."></textarea></div>
                 <button type="button" id="bh-fechar" class="btn btn-primary btn-sm" style="margin-top:8px;">Fechar ${formatarAnoMes(p.anoMes)}</button>`
              : `<div class="sub" style="color:var(--danger); margin-top:8px;">${escapeHtml(p.motivoBloqueio || "Não é possível fechar este mês.")}</div>`
          }
        </div>
      `;
      const btnFechar = document.getElementById("bh-fechar");
      if (btnFechar) {
        btnFechar.addEventListener("click", async () => {
          btnFechar.disabled = true;
          try {
            await api.post("/api/fechamentos-ponto", {
              consultorId: consultor.id,
              anoMes: p.anoMes,
              saldoTransportado: document.getElementById("bh-saldo-transportado").value,
              observacoes: document.getElementById("bh-observacoes").value,
            });
            showToast(`${formatarAnoMes(p.anoMes)} fechado.`, "sucesso");
            carregar();
            aoSalvar();
          } catch (err) {
            showToast(err.message, "erro");
            btnFechar.disabled = false;
          }
        });
      }
    } catch (err) {
      previewEl.innerHTML = `<div class="sub" style="color:var(--danger);">${escapeHtml(err.message)}</div>`;
    }
  }

  function editarSaldoTransportado(fechamento) {
    abrirModal(`
      <h2>Editar saldo transportado — ${formatarAnoMes(fechamento.anoMes)}</h2>
      <form id="form-bh-editar">
        <div class="form-row"><label>Saldo transportado (h)</label><input type="number" step="0.01" id="bh-edit-saldo" value="${fechamento.saldoTransportado}" required /></div>
        <div class="sub" style="margin-top:-6px;">Saldo calculado automaticamente: ${tagSaldoValor(fechamento.saldoFinalCalculado)}.</div>
        <div class="form-row"><label>Observações</label><textarea id="bh-edit-obs" rows="2">${escapeHtml(fechamento.observacoes || "")}</textarea></div>
        <div id="bh-editar-erro" class="form-erro hidden"></div>
        <div class="modal-close-row">
          <button type="button" id="btn-cancelar-bh-editar" class="btn btn-outline">Cancelar</button>
          <button type="submit" class="btn btn-primary">Salvar</button>
        </div>
      </form>
    `);
    document.getElementById("btn-cancelar-bh-editar").addEventListener("click", () => {
      abrirModalBancoHoras(consultor, aoSalvar);
    });
    document.getElementById("form-bh-editar").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const erroEl = document.getElementById("bh-editar-erro");
      erroEl.classList.add("hidden");
      try {
        await api.patch(`/api/fechamentos-ponto/${fechamento.id}`, {
          saldoTransportado: document.getElementById("bh-edit-saldo").value,
          observacoes: document.getElementById("bh-edit-obs").value,
        });
        showToast("Saldo transportado atualizado.", "sucesso");
        abrirModalBancoHoras(consultor, aoSalvar);
        aoSalvar();
      } catch (err) {
        erroEl.textContent = err.message;
        erroEl.classList.remove("hidden");
      }
    });
  }

  await carregar();
}

// AAAA-MM do mês seguinte a um AAAA-MM.
function proximoAnoMes(anoMes) {
  const [ano, mes] = anoMes.split("-").map(Number);
  const data = new Date(ano, mes, 1);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
}

// AAAA-MM do mês anterior ao atual (sugestão inicial de fechamento pra quem ainda
// não fechou nenhum mês).
function mesAnteriorAoAtual() {
  const hoje = new Date();
  const data = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
}

// ================== Visão do Gestor/Supervisora ==================
async function renderGestor(root) {
  let periodoValor = "mes:0";
  let ultimoResumo = null;
  const config = await api.get("/api/config");
  const limiteSemanalHoras = Number(config.limiteSaldoSemanalHoras) || 2;

  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Controle de Ponto</h2>
        <div class="sub">Horas trabalhadas x esperadas de quem usa Controle de Ponto, com aviso de localização fora do combinado.</div>
      </div>
      <div style="display:flex; gap:8px; align-items:center;">
        <select id="ponto-periodo">
          <option value="mes:0">Este mês</option>
          <option value="mes:-1">Mês passado</option>
          <option value="semana:0">Esta semana</option>
          <option value="semana:-1">Semana passada</option>
        </select>
        ${isGestor() ? '<button id="btn-ponto-manual" class="btn btn-outline btn-sm">+ Registrar manualmente</button>' : ""}
      </div>
    </div>
    ${isGestor() ? '<div id="ocorrencias-pendentes-card" style="margin-bottom:18px;"></div>' : ""}
    <div id="ponto-conteudo"></div>
  `;

  const conteudo = root.querySelector("#ponto-conteudo");
  const periodoSelect = root.querySelector("#ponto-periodo");

  // ---------- Ocorrências de Ponto pendentes (só o Gestor vê e responde) ----------
  async function carregarOcorrenciasPendentes() {
    const cardEl = root.querySelector("#ocorrencias-pendentes-card");
    if (!cardEl) return;
    const pendentes = await api.get("/api/ocorrencias-ponto?status=Pendente");
    if (pendentes.length === 0) {
      cardEl.innerHTML = "";
      return;
    }
    cardEl.innerHTML = `
      <div class="card" style="border-left:4px solid var(--danger, #c0392b);">
        <h3 class="section-title" style="margin-top:0;">⚠️ Ocorrências de Ponto pendentes (${pendentes.length})</h3>
        <table>
          <thead><tr><th>Funcionário</th><th>Data</th><th>Motivo</th><th></th></tr></thead>
          <tbody>
            ${pendentes
              .map((o) => {
                const nome = (store.consultores.find((c) => c.id === o.consultorId) || {}).nome || "—";
                return `
              <tr data-id="${o.id}">
                <td>${escapeHtml(nome)}</td>
                <td>${formatarDataCurta(o.data)}</td>
                <td>${escapeHtml(o.motivo)}</td>
                <td style="white-space:nowrap;">
                  <button class="btn btn-primary btn-sm btn-ocorrencia-aceitar">Aceitar</button>
                  <button class="btn btn-outline btn-sm btn-ocorrencia-recusar" style="color:#c0392b;">Recusar</button>
                </td>
              </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;
    cardEl.querySelectorAll(".btn-ocorrencia-aceitar").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const id = e.target.closest("tr").dataset.id;
        const ocorrencia = pendentes.find((o) => o.id === id);
        const nome = (store.consultores.find((c) => c.id === ocorrencia.consultorId) || {}).nome || "—";
        abrirModalResponderOcorrencia(ocorrencia, nome, "Aprovada", () => {
          carregarOcorrenciasPendentes();
          carregar();
        });
      });
    });
    cardEl.querySelectorAll(".btn-ocorrencia-recusar").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const id = e.target.closest("tr").dataset.id;
        const ocorrencia = pendentes.find((o) => o.id === id);
        const nome = (store.consultores.find((c) => c.id === ocorrencia.consultorId) || {}).nome || "—";
        abrirModalResponderOcorrencia(ocorrencia, nome, "Rejeitada", () => {
          carregarOcorrenciasPendentes();
          carregar();
        });
      });
    });
  }

  async function carregar() {
    const [tipo, offsetStr] = periodoValor.split(":");
    const offset = Number(offsetStr);
    const { inicio, fim } = tipo === "semana" ? periodoSemana(offset) : periodoMes(offset);
    const dados = await api.get(`/api/ponto/resumo?inicio=${inicio}&fim=${fim}`);
    ultimoResumo = dados;
    renderizarResumo(dados, tipo === "semana");
  }

  function renderizarResumo(dados, modoSemanal) {
    if (dados.resumo.length === 0) {
      conteudo.innerHTML =
        '<div class="empty-state">Ninguém com Controle de Ponto habilitado ainda. Marque "Usa Controle de Ponto" no cadastro da pessoa em Colaborador &gt; Equipe.</div>';
      return;
    }
    conteudo.innerHTML = `
      ${
        modoSemanal
          ? `<div class="sub" style="margin-bottom:10px;">Acompanhamento semanal (${formatarDataCurta(dados.inicio)} a ${formatarDataCurta(dados.fim)}) — aviso quando o saldo da semana passa de ${limiteSemanalHoras}h, pra não deixar acumular demais antes do fechamento do mês.</div>`
          : ""
      }
      <table>
        <thead>
          <tr>
            <th>Funcionário</th><th>Horas Trabalhadas</th><th>Horas Esperadas</th>
            <th>Saldo</th><th>Dias com Ponto</th><th>Avisos</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${dados.resumo
            .map((r) => {
              const acimaDoLimite = modoSemanal && Math.abs(Number(r.saldoHoras) || 0) > limiteSemanalHoras;
              return `
            <tr data-id="${r.consultor.id}" class="linha-clicavel" style="cursor:pointer;${acimaDoLimite ? " background:#fff4e5;" : ""}">
              <td>${escapeHtml(r.consultor.nome)}${r.consultor.ativo === false ? ' <span class="tag tag-encerrada">Inativo</span>' : ""}</td>
              <td>${r.horasTrabalhadas}h</td>
              <td>${r.horasEsperadas}h</td>
              <td>${tagSaldo(r.saldoHoras)}${acimaDoLimite ? ' <span class="tag tag-atrasada" title="Acima do limite semanal configurado">⚠️ acima do limite semanal</span>' : ""}</td>
              <td>${r.diasComPonto}</td>
              <td>
                ${r.diasForaDoLocal > 0 ? `<span class="tag tag-atrasada">⚠️ ${r.diasForaDoLocal} fora do local</span> ` : ""}
                ${r.diasSemSaida > 0 ? `<span class="tag tag-standby">⏳ ${r.diasSemSaida} sem saída</span>` : ""}
              </td>
              <td>
                <button class="btn btn-outline btn-sm btn-detalhe-ponto">Ver dias</button>
                ${isGestor() ? '<button class="btn btn-outline btn-sm btn-bancohoras-linha">Banco de Horas</button>' : ""}
              </td>
            </tr>`;
            })
            .join("")}
        </tbody>
      </table>
      <div id="ponto-detalhe" style="margin-top:18px;"></div>
    `;

    conteudo.querySelectorAll(".btn-detalhe-ponto, .linha-clicavel").forEach((el) => {
      el.addEventListener("click", (e) => {
        const tr = e.target.closest("tr");
        const r = dados.resumo.find((x) => x.consultor.id === tr.dataset.id);
        abrirDetalhe(r.consultor, dados.inicio, dados.fim);
      });
    });

    conteudo.querySelectorAll(".btn-bancohoras-linha").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const tr = e.target.closest("tr");
        const r = dados.resumo.find((x) => x.consultor.id === tr.dataset.id);
        abrirModalBancoHoras(r.consultor, carregar);
      });
    });
  }

  async function abrirDetalhe(consultor, inicio, fim) {
    const detalheEl = conteudo.querySelector("#ponto-detalhe");
    detalheEl.innerHTML = '<div class="empty-state">Carregando...</div>';
    const registros = (await api.get(`/api/ponto?consultorId=${consultor.id}`)).filter((p) => p.data >= inicio && p.data <= fim);
    detalheEl.innerHTML = `
      <h3 class="section-title">${escapeHtml(consultor.nome)} — dia a dia</h3>
      ${
        registros.length === 0
          ? '<div class="empty-state">Nenhuma batida de ponto neste período.</div>'
          : `<table>
              <thead><tr><th>Data</th><th>Dia</th><th>Entrada</th><th>Almoço</th><th>Saída</th><th>Trabalhadas</th><th>Esperadas</th><th>Saldo</th><th></th></tr></thead>
              <tbody>
                ${registros
                  .map(
                    (p) => `
                  <tr data-id="${p.id}">
                    <td>${formatarDataCurta(p.data)}${p.corrigidoManualmente || p.lancadoManualmente ? ' <span title="Corrigido/lançado manualmente">✏️</span>' : ""}</td>
                    <td>${p.diaSemana}</td>
                    <td>${localizacaoCelula(p.horaEntrada, p.entradaLat, p.entradaLng, p.entradaForaDoLocal, p.entradaDistanciaMetros, p.entradaReferencia)}</td>
                    <td>${p.pausaSaida || p.pausaEntrada ? `${p.pausaSaida || "—"} → ${p.pausaEntrada || "—"}` : "—"}</td>
                    <td>${localizacaoCelula(p.horaSaida, p.saidaLat, p.saidaLng, p.saidaForaDoLocal, p.saidaDistanciaMetros, p.saidaReferencia)}</td>
                    <td>${p.horasTrabalhadas != null ? p.horasTrabalhadas + "h" : "—"}</td>
                    <td>${p.horasEsperadas}h</td>
                    <td>${p.horasTrabalhadas != null ? tagSaldo(p.saldoHoras) : "—"}</td>
                    <td>${
                      isGestor() && !(consultor.id === store.usuario.id && store.usuario.bloqueiaAutoCorrecaoPonto)
                        ? '<button class="btn btn-outline btn-sm btn-editar-ponto">Editar</button>'
                        : ""
                    }</td>
                  </tr>`
                  )
                  .join("")}
              </tbody>
            </table>`
      }
    `;
    detalheEl.querySelectorAll(".btn-editar-ponto").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const id = e.target.closest("tr").dataset.id;
        const registro = registros.find((r) => r.id === id);
        abrirModalEditarPonto(registro, consultor.nome, () => {
          carregar();
          abrirDetalhe(consultor, inicio, fim);
        });
      });
    });
  }

  periodoSelect.addEventListener("change", () => {
    periodoValor = periodoSelect.value;
    carregar();
  });

  const btnPontoManual = root.querySelector("#btn-ponto-manual");
  if (btnPontoManual) {
    btnPontoManual.addEventListener("click", () => {
      // Quem tem bloqueiaAutoCorrecaoPonto não aparece como opção pra si mesma aqui —
      // o backend já barra, isso só evita a pessoa escolher a própria linha à toa.
      const consultores = (ultimoResumo && ultimoResumo.resumo.map((r) => r.consultor)) || [];
      const consultoresDisponiveis = consultores.filter(
        (c) => !(c.id === store.usuario.id && store.usuario.bloqueiaAutoCorrecaoPonto)
      );
      if (consultoresDisponiveis.length === 0) {
        showToast('Ninguém com Controle de Ponto habilitado ainda. Marque "Usa Controle de Ponto" no cadastro da pessoa primeiro.', "erro");
        return;
      }
      abrirModalPontoManual(consultoresDisponiveis, carregar);
    });
  }

  if (isGestor()) await carregarOcorrenciasPendentes();
  await carregar();
}

// ================== Visão do próprio funcionário ("Meu Ponto") ==================
async function renderMeuPonto(root) {
  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Meu Ponto</h2>
        <div class="sub">Bata o ponto clicando nos botões: entrada ao chegar, pausa ao sair/voltar do almoço (quando houver) e saída ao final do expediente.</div>
      </div>
      <button id="btn-registrar-ocorrencia" class="btn btn-outline btn-sm">+ Registrar Ocorrência</button>
    </div>
    <div id="ponto-hoje-card" class="card" style="margin-bottom:18px;"></div>
    <h3 class="section-title">Minhas Ocorrências</h3>
    <div class="sub" style="margin-top:-6px; margin-bottom:8px;">Não conseguiu bater o ponto no horário certo (esqueceu, imprevisto, problema técnico)? Registre aqui o motivo — o Gestor avalia e, se aceitar, corrige seu ponto.</div>
    <div id="ponto-ocorrencias-lista" style="margin-bottom:18px;"></div>
    <h3 class="section-title">Meu Banco de Horas</h3>
    <div id="ponto-banco-horas-card" class="card" style="margin-bottom:18px;"></div>
    <h3 class="section-title">Meu histórico</h3>
    <div id="ponto-historico"></div>
  `;

  document.getElementById("btn-registrar-ocorrencia").addEventListener("click", () => {
    abrirModalRegistrarOcorrencia(carregar);
  });

  async function carregar() {
    const [hoje, historico, fechamentos, ocorrencias] = await Promise.all([
      api.get("/api/ponto/hoje"),
      api.get("/api/ponto/meu"),
      api.get("/api/fechamentos-ponto/meus"),
      api.get("/api/ocorrencias-ponto/minhas"),
    ]);
    renderizarHoje(hoje);
    renderizarBancoHoras(historico, fechamentos);
    renderizarHistorico(historico);
    renderizarOcorrencias(ocorrencias);
  }

  function renderizarOcorrencias(ocorrencias) {
    const el = root.querySelector("#ponto-ocorrencias-lista");
    if (ocorrencias.length === 0) {
      el.innerHTML = '<div class="empty-state">Nenhuma ocorrência registrada.</div>';
      return;
    }
    const tagStatus = (status) => {
      if (status === "Aprovada") return '<span class="tag tag-nprazo">Aceita</span>';
      if (status === "Rejeitada") return '<span class="tag tag-atrasada">Recusada</span>';
      return '<span class="tag tag-standby">Aguardando</span>';
    };
    el.innerHTML = `
      <table>
        <thead><tr><th>Data</th><th>Motivo</th><th>Status</th><th>Observação do Gestor</th></tr></thead>
        <tbody>
          ${ocorrencias
            .map(
              (o) => `
            <tr>
              <td>${formatarDataCurta(o.data)}</td>
              <td>${escapeHtml(o.motivo)}</td>
              <td>${tagStatus(o.status)}</td>
              <td>${o.respostaObservacao ? escapeHtml(o.respostaObservacao) : "—"}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    `;
  }

  // Mostra o saldo acumulado dos meses já fechados (travado, decidido pelo Gestor) +
  // o saldo do mês atual, calculado em tempo real a cada batida — pra a pessoa
  // acompanhar seu próprio banco de horas sem precisar perguntar.
  function renderizarBancoHoras(historico, fechamentos) {
    const cardEl = root.querySelector("#ponto-banco-horas-card");
    const ultimoAtivo = fechamentos.find((f) => f.status === "Fechado") || null;
    const saldoAcumulado = ultimoAtivo ? Number(ultimoAtivo.saldoTransportado) || 0 : 0;
    const anoMesAtual = new Date().toISOString().slice(0, 7);
    const saldoMesAberto =
      Math.round(
        historico
          .filter((p) => p.data.slice(0, 7) === anoMesAtual && p.saldoHoras != null)
          .reduce((soma, p) => soma + (Number(p.saldoHoras) || 0), 0) * 100
      ) / 100;
    const saldoTotalAtual = Math.round((saldoAcumulado + saldoMesAberto) * 100) / 100;

    cardEl.innerHTML = `
      <div class="kpi-row">
        <div class="kpi-card">
          <div class="kpi-label">Saldo de meses já fechados</div>
          <div class="kpi-value">${tagSaldoValor(saldoAcumulado)}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Saldo deste mês (em aberto)</div>
          <div class="kpi-value">${tagSaldoValor(saldoMesAberto)}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Saldo total atual</div>
          <div class="kpi-value">${tagSaldoValor(saldoTotalAtual)}</div>
        </div>
      </div>
      ${
        fechamentos.length > 0
          ? `<table style="margin-top:16px;">
              <thead><tr><th>Mês</th><th>Saldo do mês</th><th>Saldo transportado</th><th>Status</th></tr></thead>
              <tbody>
                ${fechamentos
                  .map(
                    (f) => `
                  <tr>
                    <td>${formatarAnoMes(f.anoMes)}</td>
                    <td>${tagSaldoValor(f.saldoDoMes)}</td>
                    <td>${tagSaldoValor(f.saldoTransportado)}</td>
                    <td>${f.status === "Fechado" ? '<span class="tag tag-encerrada">Fechado</span>' : '<span class="tag tag-standby">Reaberto</span>'}</td>
                  </tr>`
                  )
                  .join("")}
              </tbody>
            </table>`
          : '<div class="sub" style="margin-top:10px;">Nenhum mês fechado ainda pelo Gestor — o saldo acima é só do mês atual, calculado em tempo real.</div>'
      }
    `;
  }

  // Determina qual é a PRÓXIMA batida a partir do estado de hoje — mesma lógica do
  // backend (POST /api/ponto/bater), só pra decidir o texto do botão único sem
  // precisar de uma chamada extra ao servidor.
  function proximaBatida(hoje, temPausa) {
    if (!hoje) return { rotulo: "Bater Entrada", mensagemSucesso: "Entrada registrada." };
    if (hoje.horaSaida) return null; // dia completo
    if (temPausa && !hoje.pausaSaida) return { rotulo: "Sair para o Almoço", mensagemSucesso: "Saída para o almoço registrada." };
    if (temPausa && hoje.pausaSaida && !hoje.pausaEntrada) return { rotulo: "Voltar do Almoço", mensagemSucesso: "Volta do almoço registrada." };
    return { rotulo: "Bater Saída", mensagemSucesso: "Saída registrada." };
  }

  function renderizarHoje(hoje) {
    const cardEl = root.querySelector("#ponto-hoje-card");
    // store.consultores já vem carregado no boot — usado pra achar o bloco de
    // horário que vale PARA HOJE e decidir se a pausa de almoço se aplica hoje. A
    // mesma pessoa pode ter pausa numa Segunda e não ter na Terça, por exemplo.
    const meuRegistro = store.consultores.find((c) => c.id === store.usuario.id);
    const diaSemanaHoje = hoje ? hoje.diaSemana : new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(new Date());
    const blocoHoje = meuRegistro ? blocoDoDia(meuRegistro.horarioEsperado, diaSemanaHoje) : null;
    const temPausa = blocoHoje ? (Number(blocoHoje.pausaAlmocoMinutos) || 0) > 0 : false;
    const proxima = proximaBatida(hoje, temPausa);

    cardEl.innerHTML = `
      <div class="kpi-row">
        <div class="kpi-card">
          <div class="kpi-label">Entrada</div>
          <div class="kpi-value">${hoje ? hoje.horaEntrada : "—"}</div>
          ${hoje && hoje.entradaForaDoLocal ? '<div class="sub" style="color:var(--danger); margin-top:4px;">⚠️ Fora do local esperado</div>' : ""}
        </div>
        ${
          temPausa
            ? `<div class="kpi-card">
                <div class="kpi-label">Almoço</div>
                <div class="kpi-value" style="font-size:16px;">${(hoje && hoje.pausaSaida) || "—"} → ${(hoje && hoje.pausaEntrada) || "—"}</div>
              </div>`
            : ""
        }
        <div class="kpi-card">
          <div class="kpi-label">Saída</div>
          <div class="kpi-value">${(hoje && hoje.horaSaida) || "—"}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Horas hoje</div>
          <div class="kpi-value">${hoje && hoje.horasTrabalhadas != null ? hoje.horasTrabalhadas + "h" : "—"}</div>
          <div class="sub" style="margin-top:4px;">Esperado: ${hoje ? hoje.horasEsperadas : blocoHoje ? "" : "0"}h</div>
        </div>
      </div>
      <div style="margin-top:14px;">
        ${
          proxima
            ? `<button id="btn-bater-ponto" class="btn btn-primary">${proxima.rotulo}</button>`
            : '<div class="tag tag-encerrada" style="font-size:14px;">✓ Ponto de hoje completo</div>'
        }
      </div>
    `;

    const btn = cardEl.querySelector("#btn-bater-ponto");
    if (btn && proxima) {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "Registrando...";
        try {
          const localizacao = await obterLocalizacao();
          await api.post("/api/ponto/bater", localizacao || {});
          // Feedback visual claro de que a batida foi registrada — o botão fica
          // verde com um check por um instante antes de recarregar a tela, pra
          // quem bateu o ponto ter certeza de que funcionou.
          btn.classList.remove("btn-primary");
          btn.classList.add("btn-sucesso-flash");
          btn.textContent = "✓ Ponto registrado!";
          showToast(proxima.mensagemSucesso, "sucesso");
          setTimeout(() => carregar(), 700);
        } catch (err) {
          showToast(err.message, "erro");
          btn.disabled = false;
          btn.textContent = proxima.rotulo;
        }
      });
    }
  }

  function renderizarHistorico(registros) {
    const el = root.querySelector("#ponto-historico");
    if (registros.length === 0) {
      el.innerHTML = '<div class="empty-state">Nenhum registro ainda.</div>';
      return;
    }
    el.innerHTML = `
      <table>
        <thead><tr><th>Data</th><th>Dia</th><th>Entrada</th><th>Almoço</th><th>Saída</th><th>Trabalhadas</th><th>Esperadas</th><th>Saldo</th></tr></thead>
        <tbody>
          ${registros
            .map(
              (p) => `
            <tr>
              <td>${formatarDataCurta(p.data)}</td>
              <td>${p.diaSemana}</td>
              <td>${localizacaoCelula(p.horaEntrada, p.entradaLat, p.entradaLng, p.entradaForaDoLocal, p.entradaDistanciaMetros, p.entradaReferencia)}</td>
              <td>${p.pausaSaida || p.pausaEntrada ? `${p.pausaSaida || "—"} → ${p.pausaEntrada || "—"}` : "—"}</td>
              <td>${localizacaoCelula(p.horaSaida, p.saidaLat, p.saidaLng, p.saidaForaDoLocal, p.saidaDistanciaMetros, p.saidaReferencia)}</td>
              <td>${p.horasTrabalhadas != null ? p.horasTrabalhadas + "h" : "—"}</td>
              <td>${p.horasEsperadas}h</td>
              <td>${p.horasTrabalhadas != null ? tagSaldo(p.saldoHoras) : "—"}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    `;
  }

  await carregar();
}
