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

function tagSaldo(saldo) {
  const v = Number(saldo) || 0;
  if (v > 0.05) return `<span class="tag tag-nprazo">+${v}h extra</span>`;
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

// ================== Visão do Gestor/Supervisora ==================
async function renderGestor(root) {
  let offsetMeses = 0;
  let ultimoResumo = null;

  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Controle de Ponto</h2>
        <div class="sub">Horas trabalhadas x esperadas de quem usa Controle de Ponto, com aviso de localização fora do combinado.</div>
      </div>
      <div style="display:flex; gap:8px; align-items:center;">
        <select id="ponto-periodo">
          <option value="0">Este mês</option>
          <option value="-1">Mês passado</option>
        </select>
        ${isGestor() ? '<button id="btn-ponto-manual" class="btn btn-outline btn-sm">+ Registrar manualmente</button>' : ""}
      </div>
    </div>
    <div id="ponto-conteudo"></div>
  `;

  const conteudo = root.querySelector("#ponto-conteudo");
  const periodoSelect = root.querySelector("#ponto-periodo");

  async function carregar() {
    const { inicio, fim } = periodoMes(offsetMeses);
    const dados = await api.get(`/api/ponto/resumo?inicio=${inicio}&fim=${fim}`);
    ultimoResumo = dados;
    renderizarResumo(dados);
  }

  function renderizarResumo(dados) {
    if (dados.resumo.length === 0) {
      conteudo.innerHTML =
        '<div class="empty-state">Ninguém com Controle de Ponto habilitado ainda. Marque "Usa Controle de Ponto" no cadastro da pessoa em Configurações &gt; Funcionários.</div>';
      return;
    }
    conteudo.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Funcionário</th><th>Horas Trabalhadas</th><th>Horas Esperadas</th>
            <th>Saldo</th><th>Dias com Ponto</th><th>Avisos</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${dados.resumo
            .map(
              (r) => `
            <tr data-id="${r.consultor.id}" class="linha-clicavel" style="cursor:pointer;">
              <td>${escapeHtml(r.consultor.nome)}${r.consultor.ativo === false ? ' <span class="tag tag-encerrada">Inativo</span>' : ""}</td>
              <td>${r.horasTrabalhadas}h</td>
              <td>${r.horasEsperadas}h</td>
              <td>${tagSaldo(r.saldoHoras)}</td>
              <td>${r.diasComPonto}</td>
              <td>
                ${r.diasForaDoLocal > 0 ? `<span class="tag tag-atrasada">⚠️ ${r.diasForaDoLocal} fora do local</span> ` : ""}
                ${r.diasSemSaida > 0 ? `<span class="tag tag-standby">⏳ ${r.diasSemSaida} sem saída</span>` : ""}
              </td>
              <td><button class="btn btn-outline btn-sm btn-detalhe-ponto">Ver dias</button></td>
            </tr>`
            )
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
                    <td>${isGestor() ? '<button class="btn btn-outline btn-sm btn-editar-ponto">Editar</button>' : ""}</td>
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
    offsetMeses = Number(periodoSelect.value);
    carregar();
  });

  const btnPontoManual = root.querySelector("#btn-ponto-manual");
  if (btnPontoManual) {
    btnPontoManual.addEventListener("click", () => {
      const consultores = (ultimoResumo && ultimoResumo.resumo.map((r) => r.consultor)) || [];
      if (consultores.length === 0) {
        showToast('Ninguém com Controle de Ponto habilitado ainda. Marque "Usa Controle de Ponto" no cadastro da pessoa primeiro.', "erro");
        return;
      }
      abrirModalPontoManual(consultores, carregar);
    });
  }

  await carregar();
}

// ================== Visão do próprio funcionário ("Meu Ponto") ==================
async function renderMeuPonto(root) {
  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Meu Ponto</h2>
        <div class="sub">A entrada é batida automaticamente quando você faz login. Não esqueça de bater a saída (e a pausa de almoço, quando houver) ao final do expediente.</div>
      </div>
    </div>
    <div id="ponto-hoje-card" class="card" style="margin-bottom:18px;"></div>
    <h3 class="section-title">Meu histórico</h3>
    <div id="ponto-historico"></div>
  `;

  async function carregar() {
    const [hoje, historico] = await Promise.all([api.get("/api/ponto/hoje"), api.get("/api/ponto/meu")]);
    renderizarHoje(hoje);
    renderizarHistorico(historico);
  }

  function renderizarHoje(hoje) {
    const cardEl = root.querySelector("#ponto-hoje-card");
    if (!hoje) {
      cardEl.innerHTML = '<div class="sub">Nenhuma batida de ponto hoje ainda — ela é registrada automaticamente no login.</div>';
      return;
    }
    // store.consultores já vem carregado no boot — usado pra achar o bloco de
    // horário que vale PARA HOJE (hoje.diaSemana vem do servidor, já no fuso
    // certo) e decidir se a pausa de almoço se aplica hoje. A mesma pessoa pode
    // ter pausa numa Segunda e não ter na Terça, por exemplo.
    const meuRegistro = store.consultores.find((c) => c.id === store.usuario.id);
    const blocoHoje = meuRegistro ? blocoDoDia(meuRegistro.horarioEsperado, hoje.diaSemana) : null;
    const pausaMinutos = blocoHoje ? Number(blocoHoje.pausaAlmocoMinutos) || 0 : 0;
    const temPausa = pausaMinutos > 0;
    const aguardandoVoltaAlmoco = temPausa && hoje.pausaSaida && !hoje.pausaEntrada;
    cardEl.innerHTML = `
      <div class="kpi-row">
        <div class="kpi-card">
          <div class="kpi-label">Entrada de hoje</div>
          <div class="kpi-value">${hoje.horaEntrada}</div>
          ${hoje.entradaForaDoLocal ? '<div class="sub" style="color:var(--danger); margin-top:4px;">⚠️ Fora do local esperado</div>' : ""}
        </div>
        ${
          temPausa
            ? `<div class="kpi-card">
                <div class="kpi-label">Almoço</div>
                <div class="kpi-value" style="font-size:16px;">${hoje.pausaSaida || "—"} → ${hoje.pausaEntrada || "—"}</div>
                ${
                  !hoje.horaSaida && !hoje.pausaSaida
                    ? '<button id="btn-pausa-saida" class="btn btn-outline btn-sm" style="margin-top:8px;">Sair para o Almoço</button>'
                    : ""
                }
                ${
                  !hoje.horaSaida && aguardandoVoltaAlmoco
                    ? '<button id="btn-pausa-entrada" class="btn btn-outline btn-sm" style="margin-top:8px;">Voltar do Almoço</button>'
                    : ""
                }
              </div>`
            : ""
        }
        <div class="kpi-card">
          <div class="kpi-label">Saída de hoje</div>
          <div class="kpi-value">${hoje.horaSaida || "—"}</div>
          ${
            !hoje.horaSaida && !aguardandoVoltaAlmoco
              ? '<button id="btn-bater-saida" class="btn btn-primary btn-sm" style="margin-top:8px;">Bater Saída</button>'
              : ""
          }
          ${aguardandoVoltaAlmoco ? '<div class="sub" style="margin-top:8px;">Bata a volta do almoço antes de sair.</div>' : ""}
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Horas hoje</div>
          <div class="kpi-value">${hoje.horasTrabalhadas != null ? hoje.horasTrabalhadas + "h" : "—"}</div>
          <div class="sub" style="margin-top:4px;">Esperado: ${hoje.horasEsperadas}h</div>
        </div>
      </div>
    `;
    const btn = cardEl.querySelector("#btn-bater-saida");
    if (btn) {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "Registrando...";
        try {
          const localizacao = await obterLocalizacao();
          await api.post("/api/ponto/bater-saida", localizacao || {});
          showToast("Saída registrada.", "sucesso");
          carregar();
        } catch (err) {
          showToast(err.message, "erro");
          btn.disabled = false;
          btn.textContent = "Bater Saída";
        }
      });
    }
    const btnPausaSaida = cardEl.querySelector("#btn-pausa-saida");
    if (btnPausaSaida) {
      btnPausaSaida.addEventListener("click", async () => {
        btnPausaSaida.disabled = true;
        btnPausaSaida.textContent = "Registrando...";
        try {
          const localizacao = await obterLocalizacao();
          await api.post("/api/ponto/pausa-saida", localizacao || {});
          showToast("Saída para o almoço registrada.", "sucesso");
          carregar();
        } catch (err) {
          showToast(err.message, "erro");
          btnPausaSaida.disabled = false;
          btnPausaSaida.textContent = "Sair para o Almoço";
        }
      });
    }
    const btnPausaEntrada = cardEl.querySelector("#btn-pausa-entrada");
    if (btnPausaEntrada) {
      btnPausaEntrada.addEventListener("click", async () => {
        btnPausaEntrada.disabled = true;
        btnPausaEntrada.textContent = "Registrando...";
        try {
          const localizacao = await obterLocalizacao();
          await api.post("/api/ponto/pausa-entrada", localizacao || {});
          showToast("Volta do almoço registrada.", "sucesso");
          carregar();
        } catch (err) {
          showToast(err.message, "erro");
          btnPausaEntrada.disabled = false;
          btnPausaEntrada.textContent = "Voltar do Almoço";
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
