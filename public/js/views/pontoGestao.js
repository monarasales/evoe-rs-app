// Gestão do Ponto — telas do Gestor (Etapa 1: Registros, Escalas e Feriados).

import { api } from "../api.js";
import { showToast } from "../state.js";
import { abrirModal, fecharModal } from "../modal.js";
import {
  escapeHtml,
  NOME_DIA,
  NOME_DIA_EXTENSO,
  ORDEM_DIAS,
  NOME_MES,
  paraMin,
  duracao,
  saldo,
  hhmm,
  dataCurta,
  dataBr,
  situacaoDia,
  horariosDia,
  ocorrenciasDia,
  campoData,
  brParaIso,
} from "../pontoUtil.js";

const ABAS = [
  { id: "hoje", label: "Hoje" },
  { id: "registros", label: "Registros" },
  { id: "folha", label: "Folha" },
  { id: "frequencia", label: "Frequência" },
  { id: "inconsistencias", label: "Inconsistências" },
  { id: "ocorrencias", label: "Ocorrências" },
  { id: "escalas", label: "Escalas" },
  { id: "feriados", label: "Feriados" },
];

// Mês/ano selecionados ficam guardados ao trocar de aba (e zeram ao sair da tela).
export async function renderPontoGestao(root) {
  let abaAtiva = "hoje";
  const agora = new Date();
  const estado = { ano: agora.getFullYear(), mes: agora.getMonth() + 1, colaboradorId: "" };

  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Gestão do Ponto</h2>
        <div class="sub">Marcações, saldos e cadastros de jornada da equipe. O período de apuração é o mês civil.</div>
      </div>
    </div>
    <div class="tabs" id="pg-tabs">
      ${ABAS.map((a) => `<button type="button" class="tab-btn" data-aba="${a.id}">${a.label}</button>`).join("")}
    </div>
    <div id="pg-conteudo"></div>
  `;
  const conteudo = root.querySelector("#pg-conteudo");
  const tabs = root.querySelector("#pg-tabs");

  function renderizar() {
    tabs.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("ativo", b.dataset.aba === abaAtiva));
    const ativa = tabs.querySelector(".tab-btn.ativo");
    if (ativa && tabs.scrollWidth > tabs.clientWidth) tabs.scrollLeft = ativa.offsetLeft - 16;
    const irPara = (aba) => {
      abaAtiva = aba;
      renderizar();
    };
    const abas = {
      hoje: () => abaHoje(conteudo),
      registros: () => abaRegistros(conteudo, estado),
      folha: () => abaFolha(conteudo, estado),
      frequencia: () => abaFrequencia(conteudo, estado),
      inconsistencias: () => abaInconsistencias(conteudo, estado, irPara),
      ocorrencias: () => abaOcorrencias(conteudo, estado),
      escalas: () => abaEscalas(conteudo),
      feriados: () => abaFeriados(conteudo, estado),
    };
    abas[abaAtiva]();
  }
  tabs.querySelectorAll(".tab-btn").forEach((b) =>
    b.addEventListener("click", () => {
      abaAtiva = b.dataset.aba;
      renderizar();
    })
  );
  renderizar();
}

// ======================= Registros =======================
async function abaRegistros(conteudo, estado) {
  let colaboradores = [];
  try {
    colaboradores = await api.get("/api/colaboradores");
  } catch (e) {
    /* segue sem filtro */
  }
  const valorMes = `${estado.ano}-${String(estado.mes).padStart(2, "0")}`;
  conteudo.innerHTML = `
    <div class="kanban-toolbar">
      <input type="month" id="pg-mes" value="${valorMes}" class="input-toolbar" />
      <select id="pg-colab" class="input-toolbar">
        <option value="">Todos os colaboradores</option>
        ${colaboradores
          .sort((a, b) => a.nome.localeCompare(b.nome))
          .map((c) => `<option value="${c.id}" ${estado.colaboradorId === c.id ? "selected" : ""}>${escapeHtml(c.nome)}</option>`)
          .join("")}
      </select>
    </div>
    <div class="sub" style="margin-bottom:12px;">
      ✎ = ajuste manual · ⚠️ = batida fora do local esperado · dias "incompleto" ficam fora do saldo até serem resolvidos.
    </div>
    <div id="pg-registros"><div class="empty-state">Carregando...</div></div>
  `;
  const alvo = conteudo.querySelector("#pg-registros");

  conteudo.querySelector("#pg-mes").addEventListener("change", (e) => {
    const [a, m] = e.target.value.split("-").map(Number);
    if (a && m) Object.assign(estado, { ano: a, mes: m });
    carregar();
  });
  conteudo.querySelector("#pg-colab").addEventListener("change", (e) => {
    estado.colaboradorId = e.target.value;
    carregar();
  });

  async function carregar() {
    alvo.innerHTML = '<div class="empty-state">Carregando...</div>';
    try {
      const qs = `ano=${estado.ano}&mes=${estado.mes}${estado.colaboradorId ? `&colaboradorId=${estado.colaboradorId}` : ""}`;
      const r = await api.get(`/api/ponto-gestao/registros?${qs}`);
      if (!r.colaboradores.length) {
        alvo.innerHTML = '<div class="empty-state">Nenhum colaborador cadastrado. Cadastre em Colaboradores.</div>';
        return;
      }
      alvo.innerHTML = r.colaboradores.map((c) => cartaoColaborador(c, r.periodo)).join("");
    } catch (err) {
      alvo.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
    }
  }
  carregar();
}

function cartaoColaborador(c, periodo) {
  const t = c.totalLinhas;
  const avisoVinculo = !c.colaborador.vinculado
    ? '<div class="ponto-aviso">⚠️ Sem login vinculado — esta pessoa não consegue bater ponto. Vincule em Colaboradores › Editar › "Login no sistema".</div>'
    : "";
  const faltas = c.faltas.length
    ? `<div class="sub" style="margin-top:8px;"><strong>Dias sem nenhuma marcação (${c.faltas.length}):</strong> ${c.faltas.map(dataCurta).join(", ")}</div>`
    : "";
  const tabela = c.linhas.length
    ? `<div class="tabela-rolavel"><table class="ponto-tabela">
        <thead><tr><th>Dia</th><th>Marcações</th><th>Esperado</th><th>Trabalhado</th><th>Saldo</th></tr></thead>
        <tbody>${c.linhas
          .map(
            (d) => `<tr>
              <td><strong>${dataCurta(d.data)}</strong> <span class="sub">${NOME_DIA[d.diaSemana]}</span></td>
              <td>${horariosDia(d)}<div>${ocorrenciasDia(d)}</div></td>
              <td>${d.cargaEsperada ? duracao(d.cargaEsperada) : "—"}</td>
              <td>${duracao(d.cargaCumprida)}</td>
              <td>${situacaoDia(d)}</td>
            </tr>`
          )
          .join("")}</tbody>
      </table></div>`
    : '<div class="sub">Nenhuma marcação neste mês.</div>';

  return `
    <div class="card ponto-colab-card">
      <div class="ponto-colab-topo">
        <div>
          <strong>${escapeHtml(c.colaborador.nome)}</strong>
          ${c.colaborador.ativo ? "" : ' <span class="tag tag-encerrada">inativo</span>'}
        </div>
        <div class="ponto-colab-totais">
          <span>Saldo dos dias listados: <strong class="${t.saldo < 0 ? "saldo-neg" : t.saldo > 0 ? "saldo-pos" : ""}">${saldo(t.saldo)}</strong></span>
          <span>Trabalhado: <strong>${duracao(t.cargaCumprida)}</strong></span>
          <span>Atrasos: <strong>${t.atrasos}</strong></span>
          <span>Faltas: <strong>${c.faltas.length}</strong></span>
          <span>Pendências: <strong>${c.pendentes}</strong></span>
        </div>
      </div>
      ${avisoVinculo}
      ${tabela}
      ${faltas}
    </div>`;
}

// ======================= Escalas =======================
async function abaEscalas(conteudo) {
  conteudo.innerHTML = '<div class="empty-state">Carregando...</div>';
  let jornadas;
  let colaboradores = [];
  try {
    [jornadas, colaboradores] = await Promise.all([api.get("/api/ponto-gestao/jornadas"), api.get("/api/colaboradores")]);
  } catch (err) {
    conteudo.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
    return;
  }
  const padrao = jornadas.find((j) => !j.colaboradorId);
  const individuais = jornadas.filter((j) => j.colaboradorId);

  conteudo.innerHTML = `
    <div class="section-title" style="margin-top:0;">Escala padrão da empresa</div>
    <div class="card">
      <div class="sub" style="margin-bottom:10px;">Vale para todos os colaboradores que não têm escala individual.</div>
      <div class="escala-resumo">${resumoEscala(padrao)}</div>
      <button type="button" class="btn btn-primary btn-sm" id="pg-editar-padrao">Editar escala padrão</button>
    </div>

    <div class="section-title">Escalas individuais</div>
    <div class="card">
      <div class="sub" style="margin-bottom:10px;">Para quem tem horário diferente do padrão (ex.: estagiário com carga maior ou menor).</div>
      ${
        individuais.length
          ? `<div class="tabela-rolavel"><table>
              <thead><tr><th>Colaborador</th><th>Escala</th><th>Carga semanal</th><th></th></tr></thead>
              <tbody>${individuais
                .map(
                  (j) => `<tr>
                    <td><strong>${escapeHtml(j.colaboradorNome)}</strong></td>
                    <td class="sub">${resumoEscala(j, true)}</td>
                    <td>${duracao(j.cargaSemanalMin)}</td>
                    <td style="white-space:nowrap;">
                      <button class="btn btn-outline btn-sm" data-editar="${j.colaboradorId}">Editar</button>
                      <button class="btn btn-outline btn-sm" data-remover="${j.id}" style="color:var(--danger);">Remover</button>
                    </td>
                  </tr>`
                )
                .join("")}</tbody>
            </table></div>`
          : '<div class="sub" style="margin-bottom:10px;">Nenhuma escala individual — todos seguem a escala padrão.</div>'
      }
      <button type="button" class="btn btn-secondary btn-sm" id="pg-nova-individual" style="margin-top:10px;">+ Nova escala individual</button>
    </div>
  `;

  const recarregar = () => abaEscalas(conteudo);
  conteudo.querySelector("#pg-editar-padrao").addEventListener("click", () =>
    editorEscala({ titulo: "Escala padrão da empresa", jornada: padrao, url: "/api/ponto-gestao/jornadas/padrao", aoSalvar: recarregar })
  );
  conteudo.querySelectorAll("[data-editar]").forEach((b) =>
    b.addEventListener("click", () => {
      const j = individuais.find((x) => x.colaboradorId === b.dataset.editar);
      editorEscala({
        titulo: `Escala individual — ${j.colaboradorNome}`,
        jornada: j,
        url: `/api/ponto-gestao/jornadas/colaborador/${j.colaboradorId}`,
        aoSalvar: recarregar,
      });
    })
  );
  conteudo.querySelectorAll("[data-remover]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Remover esta escala individual? O colaborador passa a seguir a escala padrão.")) return;
      try {
        await api.del(`/api/ponto-gestao/jornadas/${b.dataset.remover}`);
        showToast("Escala individual removida.", "sucesso");
        recarregar();
      } catch (err) {
        showToast(err.message, "erro");
      }
    })
  );
  conteudo.querySelector("#pg-nova-individual").addEventListener("click", () => {
    const livres = colaboradores.filter((c) => !individuais.some((j) => j.colaboradorId === c.id));
    if (!livres.length) return showToast("Todos os colaboradores já têm escala individual (ou não há colaboradores).", "erro");
    editorEscala({ titulo: "Nova escala individual", jornada: padrao, colaboradoresLivres: livres, aoSalvar: recarregar });
  });
}

function resumoEscala(j, compacto = false) {
  const linhas = ORDEM_DIAS.map((d) => {
    const e = j.dias[d];
    const texto = e ? `${e.entrada}${e.saidaAlmoco ? `–${e.saidaAlmoco} / ${e.voltaAlmoco}` : ""}–${e.saida}` : "folga";
    return compacto ? `${NOME_DIA[d]} ${texto}` : `<div><strong>${NOME_DIA_EXTENSO[d]}:</strong> ${texto}</div>`;
  });
  if (compacto) return linhas.join(" · ");
  return `${linhas.join("")}
    <div class="sub" style="margin-top:8px;">Carga semanal: <strong>${duracao(j.cargaSemanalMin)}</strong> · tolerância de atraso ${j.toleranciaMin} min · almoço entre ${j.almocoMin} e ${j.almocoMax} min</div>`;
}

function editorEscala({ titulo, jornada, url, colaboradoresLivres, aoSalvar }) {
  abrirModal(`
    <h2>${escapeHtml(titulo)}</h2>
    <form id="form-escala">
      ${
        colaboradoresLivres
          ? `<div class="form-row"><label>Colaborador</label>
              <select id="esc-colab" required>${colaboradoresLivres
                .map((c) => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`)
                .join("")}</select></div>`
          : ""
      }
      <div class="sub" style="margin-bottom:8px;">Deixe o almoço vazio se não houver pausa naquele dia.</div>
      <div class="tabela-rolavel">
        <table class="escala-editor">
          <thead><tr><th>Dia</th><th>Trabalha</th><th>Entrada</th><th>Saída almoço</th><th>Volta almoço</th><th>Saída</th><th>Carga</th></tr></thead>
          <tbody>${ORDEM_DIAS.map((d) => {
            const e = jornada.dias[d] || {};
            const ativo = !!jornada.dias[d];
            return `<tr data-dia="${d}">
              <td><strong>${NOME_DIA[d]}</strong></td>
              <td><input type="checkbox" class="esc-ativo" ${ativo ? "checked" : ""} /></td>
              <td><input type="time" class="esc-entrada" value="${e.entrada || "09:00"}" /></td>
              <td><input type="time" class="esc-saida-almoco" value="${ativo ? e.saidaAlmoco || "" : "12:00"}" /></td>
              <td><input type="time" class="esc-volta-almoco" value="${ativo ? e.voltaAlmoco || "" : "13:00"}" /></td>
              <td><input type="time" class="esc-saida" value="${e.saida || "16:00"}" /></td>
              <td class="esc-carga"></td>
            </tr>`;
          }).join("")}</tbody>
        </table>
      </div>
      <div class="escala-total">Carga semanal: <strong id="esc-total"></strong></div>
      <div class="form-cols" style="grid-template-columns:repeat(3,1fr);">
        <div class="form-row"><label>Tolerância de atraso (min)</label><input type="number" id="esc-tol" min="0" max="60" value="${jornada.toleranciaMin}" /></div>
        <div class="form-row"><label>Almoço mínimo (min)</label><input type="number" id="esc-amin" min="0" max="240" value="${jornada.almocoMin}" /></div>
        <div class="form-row"><label>Almoço máximo (min)</label><input type="number" id="esc-amax" min="0" max="300" value="${jornada.almocoMax}" /></div>
      </div>
      <div id="esc-erro" class="form-erro hidden"></div>
      <div class="modal-close-row">
        <button type="button" class="btn btn-outline" id="esc-cancelar">Fechar</button>
        <button type="submit" class="btn btn-primary">Salvar escala</button>
      </div>
    </form>
  `);

  const form = document.getElementById("form-escala");
  const linhas = [...form.querySelectorAll("tr[data-dia]")];

  function lerDia(tr) {
    const v = (cls) => tr.querySelector(cls).value;
    if (!tr.querySelector(".esc-ativo").checked) return null;
    return { entrada: v(".esc-entrada"), saidaAlmoco: v(".esc-saida-almoco"), voltaAlmoco: v(".esc-volta-almoco"), saida: v(".esc-saida") };
  }
  function cargaDia(e) {
    if (!e) return 0;
    const ent = paraMin(e.entrada);
    const sai = paraMin(e.saida);
    if (ent == null || sai == null || sai <= ent) return null;
    const sa = paraMin(e.saidaAlmoco);
    const va = paraMin(e.voltaAlmoco);
    const almoco = sa != null && va != null && va > sa ? va - sa : 0;
    return sai - ent - almoco;
  }
  function atualizar() {
    let total = 0;
    linhas.forEach((tr) => {
      const ativo = tr.querySelector(".esc-ativo").checked;
      tr.querySelectorAll("input[type=time]").forEach((i) => (i.disabled = !ativo));
      tr.classList.toggle("esc-folga", !ativo);
      const c = cargaDia(lerDia(tr));
      tr.querySelector(".esc-carga").textContent = !ativo ? "folga" : c == null ? "inválido" : duracao(c);
      total += c || 0;
    });
    document.getElementById("esc-total").textContent = duracao(total);
  }
  form.addEventListener("input", atualizar);
  atualizar();

  document.getElementById("esc-cancelar").addEventListener("click", fecharModal);
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const dias = {};
    linhas.forEach((tr) => (dias[tr.dataset.dia] = lerDia(tr)));
    const payload = {
      dias,
      toleranciaMin: Number(document.getElementById("esc-tol").value),
      almocoMin: Number(document.getElementById("esc-amin").value),
      almocoMax: Number(document.getElementById("esc-amax").value),
    };
    const destino = colaboradoresLivres ? `/api/ponto-gestao/jornadas/colaborador/${document.getElementById("esc-colab").value}` : url;
    try {
      await api.put(destino, payload);
      fecharModal();
      showToast("Escala salva.", "sucesso");
      aoSalvar();
    } catch (err) {
      const box = document.getElementById("esc-erro");
      box.textContent = err.message;
      box.classList.remove("hidden");
    }
  });
}

// ======================= Feriados =======================
async function abaFeriados(conteudo, estado) {
  const ano = estado.ano;
  conteudo.innerHTML = `
    <div class="kanban-toolbar">
      <button type="button" class="btn btn-outline btn-sm" id="fer-ant">‹</button>
      <strong>${ano}</strong>
      <button type="button" class="btn btn-outline btn-sm" id="fer-prox">›</button>
      <button type="button" class="btn btn-secondary btn-sm" id="fer-importar">Importar feriados nacionais de ${ano}</button>
    </div>
    <div class="card" style="margin-bottom:14px;">
      <div class="sub" style="margin-bottom:10px;">Feriados estaduais (Ceará) e municipais (Fortaleza) devem ser cadastrados aqui. Em feriado ninguém fica com falta.</div>
      <form id="fer-form" class="fer-form">
        <div class="form-row"><label>Data</label><input type="date" id="fer-data" required /></div>
        <div class="form-row" style="flex:2;"><label>Nome</label><input type="text" id="fer-nome" required placeholder="ex.: Aniversário de Fortaleza" /></div>
        <div class="form-row"><label>Tipo</label>
          <select id="fer-tipo"><option value="municipal">Municipal</option><option value="estadual">Estadual</option><option value="nacional">Nacional</option><option value="ponto facultativo">Ponto facultativo</option></select>
        </div>
        <div class="form-row" style="align-self:end;"><button type="submit" class="btn btn-primary btn-sm">Adicionar</button></div>
      </form>
    </div>
    <div id="fer-lista"><div class="empty-state">Carregando...</div></div>
  `;
  const lista = conteudo.querySelector("#fer-lista");
  const recarregar = () => abaFeriados(conteudo, estado);

  conteudo.querySelector("#fer-ant").addEventListener("click", () => {
    estado.ano--;
    recarregar();
  });
  conteudo.querySelector("#fer-prox").addEventListener("click", () => {
    estado.ano++;
    recarregar();
  });
  conteudo.querySelector("#fer-importar").addEventListener("click", async (e) => {
    e.target.disabled = true;
    try {
      const r = await api.post("/api/ponto-gestao/feriados/importar", { ano });
      showToast(r.importados ? `${r.importados} feriado(s) nacional(is) importado(s).` : "Os feriados nacionais deste ano já estavam cadastrados.", "sucesso");
      recarregar();
    } catch (err) {
      showToast(err.message, "erro");
      e.target.disabled = false;
    }
  });
  conteudo.querySelector("#fer-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    try {
      await api.post("/api/ponto-gestao/feriados", {
        data: conteudo.querySelector("#fer-data").value,
        nome: conteudo.querySelector("#fer-nome").value,
        tipo: conteudo.querySelector("#fer-tipo").value,
      });
      showToast("Feriado adicionado.", "sucesso");
      recarregar();
    } catch (err) {
      showToast(err.message, "erro");
    }
  });

  try {
    const feriados = await api.get(`/api/ponto-gestao/feriados?ano=${ano}`);
    lista.innerHTML = feriados.length
      ? `<table>
          <thead><tr><th>Data</th><th>Feriado</th><th>Tipo</th><th></th></tr></thead>
          <tbody>${feriados
            .map(
              (f) => `<tr>
                <td>${dataBr(f.data)}</td>
                <td>${escapeHtml(f.nome)}</td>
                <td class="sub">${escapeHtml(f.tipo)}</td>
                <td><button class="btn btn-outline btn-sm" data-remover="${f.id}" style="color:var(--danger);">Remover</button></td>
              </tr>`
            )
            .join("")}</tbody>
        </table>`
      : `<div class="empty-state">Nenhum feriado cadastrado em ${ano}. Use "Importar feriados nacionais" e adicione os do Ceará e de Fortaleza.</div>`;
    lista.querySelectorAll("[data-remover]").forEach((b) =>
      b.addEventListener("click", async () => {
        if (!confirm("Remover este feriado?")) return;
        try {
          await api.del(`/api/ponto-gestao/feriados/${b.dataset.remover}`);
          recarregar();
        } catch (err) {
          showToast(err.message, "erro");
        }
      })
    );
  } catch (err) {
    lista.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
  }
}

// ======================= Utilitários das abas =======================
function seletorMes(estado, aoMudar) {
  const valor = `${estado.ano}-${String(estado.mes).padStart(2, "0")}`;
  const html = `<input type="month" class="input-toolbar pg-mes" value="${valor}" />`;
  const ligar = (raiz) =>
    raiz.querySelector(".pg-mes").addEventListener("change", (e) => {
      const [a, m] = e.target.value.split("-").map(Number);
      if (a && m) Object.assign(estado, { ano: a, mes: m });
      aoMudar();
    });
  return { html, ligar };
}

const nomeMes = (estado) => `${NOME_MES[estado.mes - 1]} de ${estado.ano}`;
const classeSaldo = (v) => (v < 0 ? "saldo-neg" : v > 0 ? "saldo-pos" : "");
const aviso = (periodo) =>
  periodo && periodo.aberto
    ? `<div class="sub" style="margin-bottom:12px;">Mês em andamento: totais apurados até ${dataBr(periodo.fimFechado)} (o dia de hoje nunca entra nos totais).</div>`
    : "";

// ======================= Hoje =======================
const ESTADOS_PRESENCA = {
  presente: { rotulo: "Presente", classe: "tag-nprazo" },
  atrasado: { rotulo: "Atrasado", classe: "tag-prospect-proposta" },
  aguardando: { rotulo: "Aguardando", classe: "tag-standby" },
  ausente: { rotulo: "Ausente", classe: "tag-atrasada" },
  afastado: { rotulo: "Afastado", classe: "tag-encerrada" },
  externo: { rotulo: "Externo / home office", classe: "tag-prospect-contato" },
  sem_expediente: { rotulo: "Sem expediente", classe: "tag-encerrada" },
};

async function abaHoje(conteudo) {
  conteudo.innerHTML = '<div class="empty-state">Carregando...</div>';
  let r;
  try {
    r = await api.get("/api/ponto-gestao/hoje");
  } catch (err) {
    conteudo.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
    return;
  }
  const t = r.totais;
  conteudo.innerHTML = `
    <div class="kanban-toolbar">
      <strong>${NOME_DIA_EXTENSO[["dom", "seg", "ter", "qua", "qui", "sex", "sab"][new Date(r.hoje + "T12:00:00").getDay()]]}, ${dataBr(r.hoje)} · ${r.agora}</strong>
      ${r.feriado ? `<span class="tag tag-encerrada">Feriado: ${escapeHtml(r.feriado)}</span>` : ""}
      <button type="button" class="btn btn-outline btn-sm" id="pg-hoje-atualizar">↻ Atualizar</button>
    </div>
    <div class="ponto-resumo solto" style="margin-bottom:16px;">
      <div class="ponto-kpi"><div class="kpi-label">Presença</div><div class="kpi-value">${t.percentual == null ? "—" : t.percentual + "%"}</div><div class="sub">${t.presentes} de ${t.esperados} esperados</div></div>
      <div class="ponto-kpi"><div class="kpi-label">Atrasados</div><div class="kpi-value">${t.atrasados}</div><div class="sub">contam como presentes</div></div>
      <div class="ponto-kpi"><div class="kpi-label">Aguardando</div><div class="kpi-value">${t.aguardando}</div><div class="sub">dentro da tolerância</div></div>
      <div class="ponto-kpi"><div class="kpi-label">Ausentes</div><div class="kpi-value ${t.ausentes ? "saldo-neg" : ""}">${t.ausentes}</div></div>
      <div class="ponto-kpi"><div class="kpi-label">Afastados / externos</div><div class="kpi-value">${t.afastados} / ${t.externos}</div></div>
    </div>
    <div class="hoje-grid">
      ${
        r.colaboradores.length
          ? r.colaboradores
              .map((c) => {
                const est = ESTADOS_PRESENCA[c.status];
                const e = c.escalaDia;
                return `<div class="card hoje-card hoje-${c.status}">
                  <div class="hoje-topo"><strong>${escapeHtml(c.colaborador.nome)}</strong><span class="tag ${est.classe}">${est.rotulo}</span></div>
                  <div class="sub">${e ? `Escala ${e.entrada}–${e.saida}` : "Sem escala hoje"}${c.ocorrencia ? ` · ${escapeHtml(c.ocorrencia)}` : ""}</div>
                  <div style="margin-top:6px;">${
                    c.horarios.length
                      ? c.horarios.map((h) => `<span class="marcacao-chip">${h.hora}${h.dentroZona === false ? " ⚠️" : ""}${h.ajuste ? " ✎" : ""}</span>`).join(" ")
                      : '<span class="sub">Nenhuma marcação</span>'
                  }</div>
                  ${c.colaborador.vinculado ? "" : '<div class="sub saldo-neg" style="margin-top:6px;">Sem login vinculado</div>'}
                </div>`;
              })
              .join("")
          : '<div class="empty-state">Nenhum colaborador ativo cadastrado.</div>'
      }
    </div>
  `;
  conteudo.querySelector("#pg-hoje-atualizar").addEventListener("click", () => abaHoje(conteudo));
  // Atualiza sozinho a cada 2 minutos enquanto esta aba estiver aberta.
  clearTimeout(abaHoje.timer);
  const marca = conteudo.querySelector("#pg-hoje-atualizar");
  abaHoje.timer = setTimeout(() => {
    if (document.body.contains(marca)) abaHoje(conteudo);
  }, 120000);
}

// ======================= Folha =======================
async function abaFolha(conteudo, estado) {
  const sel = seletorMes(estado, () => abaFolha(conteudo, estado));
  conteudo.innerHTML = `<div class="kanban-toolbar">${sel.html}</div><div id="pg-folha"><div class="empty-state">Carregando...</div></div>`;
  sel.ligar(conteudo);
  const alvo = conteudo.querySelector("#pg-folha");
  try {
    const r = await api.get(`/api/ponto-gestao/folha?ano=${estado.ano}&mes=${estado.mes}`);
    alvo.innerHTML = r.linhas.length
      ? `${aviso(r.periodo)}
        <div class="sub" style="margin-bottom:10px;">Horas, nunca valores em reais (hora extra e descontos em dinheiro ficam com o DP). Clique no nome para ver a ficha do mês.</div>
        <div class="tabela-rolavel"><table>
          <thead><tr><th>Colaborador</th><th>Trabalhado / esperado</th><th>Horas extras</th><th>Faltas</th><th>Atrasos</th><th>Saídas antecip.</th><th>Abonados</th><th>Ajustes</th><th>Banco do mês</th><th>Pendências</th></tr></thead>
          <tbody>${r.linhas
            .map((l) => {
              const x = l.resumo;
              return `<tr>
                <td><button type="button" class="link-btn" data-ficha="${l.colaborador.id}">${escapeHtml(l.colaborador.nome)}</button></td>
                <td>${duracao(x.cargaCumprida)} <span class="sub">/ ${duracao(x.cargaEsperada)}</span></td>
                <td>${x.horasExtras ? duracao(x.horasExtras) : "—"}</td>
                <td>${x.faltas || "—"}</td>
                <td>${x.atrasos ? `${x.atrasos} <span class="sub">(${duracao(x.atrasoMin)})</span>` : "—"}</td>
                <td>${x.saidasAntecipadas ? `${x.saidasAntecipadas} <span class="sub">(${duracao(x.saidaAntecipadaMin)})</span>` : "—"}</td>
                <td>${x.abonados || "—"}</td>
                <td>${x.ajustesSaldo ? saldo(x.ajustesSaldo) : "—"}</td>
                <td><strong class="${classeSaldo(x.saldo)}">${saldo(x.saldo)}</strong></td>
                <td>${x.pendentes ? `<span class="tag tag-prospect-proposta">${x.pendentes}</span>` : "—"}</td>
              </tr>`;
            })
            .join("")}</tbody>
        </table></div>`
      : '<div class="empty-state">Nenhum colaborador para apurar.</div>';
    alvo.querySelectorAll("[data-ficha]").forEach((b) => b.addEventListener("click", () => abrirFicha(b.dataset.ficha, estado)));
  } catch (err) {
    alvo.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
  }
}

async function abrirFicha(colaboradorId, estado) {
  abrirModal('<div class="empty-state">Carregando ficha...</div>');
  try {
    const r = await api.get(`/api/ponto-gestao/ficha/${colaboradorId}?ano=${estado.ano}&mes=${estado.mes}`);
    const classeDia = (d) =>
      d.status === "falta" ? "ficha-falta" : d.status === "incompleto" ? "ficha-incompleto" : d.status === "abonado" ? "ficha-abonado" : d.status === "normal" && (d.atrasoMin || d.saidaAntecipadaMin || (d.almoco && d.almoco.classificacao !== "adequado")) ? "ficha-infracao" : "";
    const dias = r.dias.filter((d) => d.status !== "sem_escala" || d.foraDaEscala);
    abrirModal(`
      <h2>${escapeHtml(r.colaborador.nome)} — ${nomeMes(estado)}</h2>
      <div class="ficha-legenda">
        <span class="ficha-infracao">infração em dia completo</span>
        <span class="ficha-incompleto">jornada incompleta (não é infração)</span>
        <span class="ficha-abonado">abonado</span>
        <span class="ficha-falta">falta</span>
      </div>
      <div class="tabela-rolavel"><table class="ponto-tabela">
        <thead><tr><th>Dia</th><th>Marcações</th><th>Trabalhado</th><th>Saldo</th></tr></thead>
        <tbody>${dias
          .map((d) => `<tr class="${classeDia(d)}">
            <td><strong>${dataCurta(d.data)}</strong> <span class="sub">${NOME_DIA[d.diaSemana]}</span></td>
            <td>${horariosDia(d)}<div>${ocorrenciasDia(d)}</div></td>
            <td>${d.horarios.length || d.abonado ? duracao(d.cargaCumprida) : "—"}</td>
            <td>${situacaoDia(d)}</td>
          </tr>`)
          .join("") || '<tr><td colspan="4" class="sub">Nenhum dia apurado.</td></tr>'}</tbody>
      </table></div>
      <div class="sub" style="margin-top:10px;">Banco do mês: <strong class="${classeSaldo(r.resumo.saldo)}">${saldo(r.resumo.saldo)}</strong> · ${r.resumo.pendentes} pendência(s)</div>
      <div class="modal-close-row"><button type="button" class="btn btn-outline" id="ficha-fechar">Fechar</button></div>
    `);
    document.getElementById("ficha-fechar").addEventListener("click", fecharModal);
  } catch (err) {
    abrirModal(`<div class="form-erro">${escapeHtml(err.message)}</div><div class="modal-close-row"><button class="btn btn-outline" id="ficha-fechar">Fechar</button></div>`);
    document.getElementById("ficha-fechar").addEventListener("click", fecharModal);
  }
}

// ======================= Frequência =======================
async function abaFrequencia(conteudo, estado) {
  const sel = seletorMes(estado, () => abaFrequencia(conteudo, estado));
  conteudo.innerHTML = `<div class="kanban-toolbar">${sel.html}</div><div id="pg-freq"><div class="empty-state">Carregando...</div></div>`;
  sel.ligar(conteudo);
  const alvo = conteudo.querySelector("#pg-freq");
  const barra = (pct) =>
    pct == null ? "—" : `<div class="freq-barra"><div class="bar-track"><div class="bar-fill ${pct >= 90 ? "bar-fill-ok" : pct < 75 ? "bar-fill-alerta" : ""}" style="width:${Math.max(3, pct)}%"></div></div><strong>${pct}%</strong></div>`;
  try {
    const r = await api.get(`/api/ponto-gestao/frequencia?ano=${estado.ano}&mes=${estado.mes}`);
    alvo.innerHTML = r.linhas.length
      ? `${aviso(r.periodo)}
        <div class="sub" style="margin-bottom:10px;">Presença = dias trabalhados (inclui atrasados e home office) ÷ dias esperados. Férias, atestados e afastamentos saem da conta.</div>
        <div class="tabela-rolavel"><table>
          <thead><tr><th>Colaborador</th><th>Presença</th><th>Presentes / esperados</th><th>Faltas</th><th>Afastado (dias)</th><th>Pontualidade</th><th>Atrasos</th><th>Pendências</th></tr></thead>
          <tbody>${r.linhas
            .map(
              (l) => `<tr>
                <td><strong>${escapeHtml(l.colaborador.nome)}</strong></td>
                <td style="min-width:150px;">${barra(l.presenca)}</td>
                <td>${l.presentes} / ${l.diasEsperados}</td>
                <td>${l.faltas || "—"}</td>
                <td>${l.afastados || "—"}</td>
                <td>${l.pontualidade == null ? "—" : l.pontualidade + "%"}</td>
                <td>${l.atrasos || "—"}</td>
                <td>${l.pendentes || "—"}</td>
              </tr>`
            )
            .join("")}</tbody>
        </table></div>`
      : '<div class="empty-state">Nenhum colaborador para apurar.</div>';
  } catch (err) {
    alvo.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
  }
}

// ======================= Inconsistências =======================
async function abaInconsistencias(conteudo, estado, irPara) {
  const sel = seletorMes(estado, () => abaInconsistencias(conteudo, estado, irPara));
  conteudo.innerHTML = `<div class="kanban-toolbar">${sel.html}</div><div id="pg-inc"><div class="empty-state">Carregando...</div></div>`;
  sel.ligar(conteudo);
  const alvo = conteudo.querySelector("#pg-inc");
  const SITUACAO = {
    pendente: '<span class="tag tag-atrasada">pendente</span>',
    tratada: '<span class="tag tag-prospect-proposta">tratada (falta mantida)</span>',
    resolvida: '<span class="tag tag-nprazo">resolvida</span>',
  };
  try {
    const r = await api.get(`/api/ponto-gestao/inconsistencias?ano=${estado.ano}&mes=${estado.mes}`);
    alvo.innerHTML = r.itens.length
      ? `${aviso(r.periodo)}
        <div class="sub" style="margin-bottom:10px;">
          <strong>${r.pendentes}</strong> pendência(s). "Sem marcação" precisa de justificativa (ocorrência); "marcação faltando" precisa de ajuste.
          Dias resolvidos continuam na lista — o espelho de ponto segue mostrando que não houve marcação.
        </div>
        <div class="tabela-rolavel"><table>
          <thead><tr><th>Colaborador</th><th>Dia</th><th>Problema</th><th>Marcações</th><th>Situação</th><th></th></tr></thead>
          <tbody>${r.itens
            .map(
              (i) => `<tr>
                <td><strong>${escapeHtml(i.colaborador.nome)}</strong></td>
                <td>${dataCurta(i.data)} <span class="sub">${NOME_DIA[i.diaSemana]}</span></td>
                <td>${i.tipo === "sem_marcacao" ? "Sem nenhuma marcação" : "Marcação faltando"}</td>
                <td>${i.horarios.length ? i.horarios.map((h) => `<span class="marcacao-chip">${h}</span>`).join(" ") : "—"}</td>
                <td>${SITUACAO[i.situacao]}${i.ocorrencia ? ` <span class="sub">${escapeHtml(i.ocorrencia)}</span>` : ""}</td>
                <td>${
                  i.situacao === "pendente"
                    ? `<button type="button" class="btn btn-outline btn-sm" data-lancar="${i.colaborador.id}|${i.data}">Lançar ocorrência</button>
                       ${i.tipo === "marcacao_faltando" ? '<div class="sub" style="margin-top:4px;">Ajuste de marcação: Etapa 3</div>' : ""}`
                    : ""
                }</td>
              </tr>`
            )
            .join("")}</tbody>
        </table></div>`
      : `<div class="empty-state">Nenhuma inconsistência em ${nomeMes(estado)}. 🎉</div>`;
    alvo.querySelectorAll("[data-lancar]").forEach((b) =>
      b.addEventListener("click", () => {
        const [colaboradorId, data] = b.dataset.lancar.split("|");
        formularioOcorrencia({ colaboradorId, data }, () => abaInconsistencias(conteudo, estado, irPara));
      })
    );
  } catch (err) {
    alvo.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
  }
}

// ======================= Ocorrências =======================
async function abaOcorrencias(conteudo, estado) {
  const sel = seletorMes(estado, () => abaOcorrencias(conteudo, estado));
  conteudo.innerHTML = `
    <div class="kanban-toolbar">${sel.html}<button type="button" class="btn btn-primary btn-sm" id="pg-nova-oc">+ Lançar ocorrência</button></div>
    <div class="sub" style="margin-bottom:10px;">Atestados, férias, home office, folgas e licenças explicam ausências. Não registre diagnóstico ou CID — só a referência do documento.</div>
    <div id="pg-oc"><div class="empty-state">Carregando...</div></div>`;
  sel.ligar(conteudo);
  const recarregar = () => abaOcorrencias(conteudo, estado);
  conteudo.querySelector("#pg-nova-oc").addEventListener("click", () => formularioOcorrencia({}, recarregar));
  const alvo = conteudo.querySelector("#pg-oc");
  try {
    const lista = await api.get(`/api/ponto-gestao/ocorrencias?ano=${estado.ano}&mes=${estado.mes}`);
    alvo.innerHTML = lista.length
      ? `<div class="tabela-rolavel"><table>
          <thead><tr><th>Colaborador</th><th>Tipo</th><th>Período</th><th>Documento / motivo</th><th></th></tr></thead>
          <tbody>${lista
            .map(
              (oc) => `<tr>
                <td><strong>${escapeHtml(oc.colaboradorNome)}</strong></td>
                <td>${escapeHtml(oc.tipoNome)}${oc.tipo === "ajuste_saldo" ? ` <strong class="${classeSaldo(oc.minutos)}">${saldo(oc.minutos)}</strong>` : ""}</td>
                <td>${oc.dataInicio === oc.dataFim ? dataBr(oc.dataInicio) : `${dataBr(oc.dataInicio)} a ${dataBr(oc.dataFim)}`}</td>
                <td class="sub">${escapeHtml([oc.documento, oc.observacao].filter(Boolean).join(" — ")) || "—"}</td>
                <td><button class="btn btn-outline btn-sm" data-remover="${oc.id}" style="color:var(--danger);">Remover</button></td>
              </tr>`
            )
            .join("")}</tbody>
        </table></div>`
      : `<div class="empty-state">Nenhuma ocorrência em ${nomeMes(estado)}.</div>`;
    alvo.querySelectorAll("[data-remover]").forEach((b) =>
      b.addEventListener("click", async () => {
        if (!confirm("Remover esta ocorrência? Os dias voltam a ser calculados sem ela.")) return;
        try {
          await api.del(`/api/ponto-gestao/ocorrencias/${b.dataset.remover}`);
          showToast("Ocorrência removida.", "sucesso");
          recarregar();
        } catch (err) {
          showToast(err.message, "erro");
        }
      })
    );
  } catch (err) {
    alvo.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
  }
}

async function formularioOcorrencia(pre, aoSalvar) {
  let tipos;
  let colaboradores;
  try {
    [tipos, colaboradores] = await Promise.all([api.get("/api/ponto-gestao/ocorrencias/tipos"), api.get("/api/colaboradores")]);
  } catch (err) {
    return showToast(err.message, "erro");
  }
  const grupos = [...new Set(tipos.map((t) => t.grupo))];
  const dataPre = pre.data ? dataBr(pre.data) : "";
  abrirModal(`
    <h2>Lançar ocorrência</h2>
    <form id="form-oc">
      <div class="form-row"><label>Colaborador</label>
        <select id="oc-colab" required>${colaboradores
          .sort((a, b) => a.nome.localeCompare(b.nome))
          .map((c) => `<option value="${c.id}" ${c.id === pre.colaboradorId ? "selected" : ""}>${escapeHtml(c.nome)}</option>`)
          .join("")}</select>
      </div>
      <div class="form-row"><label>Tipo</label>
        <select id="oc-tipo">${grupos
          .map((g) => `<optgroup label="${escapeHtml(g)}">${tipos.filter((t) => t.grupo === g).map((t) => `<option value="${t.id}">${escapeHtml(t.nome)}</option>`).join("")}</optgroup>`)
          .join("")}</select>
        <div class="sub" id="oc-efeito" style="margin-top:4px;"></div>
      </div>
      <div class="form-cols" id="oc-datas">
        <div class="form-row"><label id="oc-label-ini">Data inicial</label><input type="text" id="oc-ini" inputmode="numeric" maxlength="10" placeholder="dd/mm/aaaa" value="${dataPre}" /></div>
        <div class="form-row" id="oc-linha-fim"><label>Data final</label><input type="text" id="oc-fim" inputmode="numeric" maxlength="10" placeholder="dd/mm/aaaa" value="${dataPre}" /></div>
      </div>
      <div class="form-cols hidden" id="oc-ajuste">
        <div class="form-row"><label>Lançar</label><select id="oc-sinal"><option value="1">Crédito (+ horas)</option><option value="-1">Débito (− horas)</option></select></div>
        <div class="form-row"><label>Horas (hh:mm)</label><input type="text" id="oc-horas" placeholder="02:30" maxlength="6" /></div>
      </div>
      <div class="form-row"><label>Documento (referência)</label><input type="text" id="oc-doc" maxlength="200" placeholder='ex.: atestado entregue em 05/08' /></div>
      <div class="form-row"><label id="oc-label-obs">Observação</label><textarea id="oc-obs" maxlength="500"></textarea></div>
      <div id="oc-erro" class="form-erro hidden"></div>
      <div class="modal-close-row">
        <button type="button" class="btn btn-outline" id="oc-cancelar">Fechar</button>
        <button type="submit" class="btn btn-primary">Lançar</button>
      </div>
    </form>
  `);
  const $ = (id) => document.getElementById(id);
  campoData($("oc-ini"));
  campoData($("oc-fim"));
  $("oc-ini").addEventListener("input", () => {
    if ($("oc-ini").value.length === 10 && !$("oc-fim").value) $("oc-fim").value = $("oc-ini").value;
  });
  const SIM = (b) => (b ? "sim" : "não");
  function atualizarTipo() {
    const t = tipos.find((x) => x.id === $("oc-tipo").value);
    const ajuste = t.id === "ajuste_saldo";
    $("oc-ajuste").classList.toggle("hidden", !ajuste);
    $("oc-linha-fim").classList.toggle("hidden", ajuste);
    $("oc-label-ini").textContent = ajuste ? "Data do lançamento" : "Data inicial";
    $("oc-label-obs").textContent = ajuste ? "Motivo (obrigatório)" : "Observação";
    $("oc-efeito").textContent = ajuste
      ? t.obs
      : `Abona falta: ${SIM(t.abonaFalta)} · abona atraso: ${SIM(t.abonaAtraso)} · conta como trabalhado: ${SIM(t.contaTrabalhado)} · desconta do banco: ${SIM(t.descontaBanco)}. ${t.obs}`;
  }
  $("oc-tipo").addEventListener("change", atualizarTipo);
  atualizarTipo();
  $("oc-cancelar").addEventListener("click", fecharModal);
  $("form-oc").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const erro = $("oc-erro");
    erro.classList.add("hidden");
    const tipo = $("oc-tipo").value;
    const ini = brParaIso($("oc-ini").value);
    const fim = tipo === "ajuste_saldo" ? ini : brParaIso($("oc-fim").value || $("oc-ini").value);
    let minutos = null;
    if (tipo === "ajuste_saldo") {
      const m = /^(\d{1,3}):?(\d{2})$/.exec($("oc-horas").value.trim());
      minutos = m ? (Number(m[1]) * 60 + Number(m[2])) * Number($("oc-sinal").value) : NaN;
    }
    const falha = !ini || !fim ? "Informe as datas no formato dd/mm/aaaa." : Number.isNaN(minutos) ? "Informe as horas no formato hh:mm (ex.: 02:30)." : null;
    if (falha) {
      erro.textContent = falha;
      erro.classList.remove("hidden");
      return;
    }
    try {
      const r = await api.post("/api/ponto-gestao/ocorrencias", {
        colaboradorId: $("oc-colab").value,
        tipo,
        dataInicio: ini,
        dataFim: fim,
        minutos,
        documento: $("oc-doc").value,
        observacao: $("oc-obs").value,
      });
      if (r.avisos && r.avisos.length) {
        abrirModal(`<h2>Ocorrência lançada</h2>
          <div class="ponto-aviso">${r.avisos.map((a) => `⚠️ ${escapeHtml(a)}`).join("<br>")}</div>
          <div class="modal-close-row"><button type="button" class="btn btn-primary" id="oc-ok">Entendi</button></div>`);
        $("oc-ok").addEventListener("click", fecharModal);
      } else {
        fecharModal();
        showToast("Ocorrência lançada.", "sucesso");
      }
      aoSalvar();
    } catch (err) {
      erro.textContent = err.message;
      erro.classList.remove("hidden");
    }
  });
}
