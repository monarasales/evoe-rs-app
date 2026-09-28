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
  dataCurta,
  dataBr,
  situacaoDia,
  horariosDia,
  ocorrenciasDia,
} from "../pontoUtil.js";

const ABAS = [
  { id: "registros", label: "Registros" },
  { id: "escalas", label: "Escalas" },
  { id: "feriados", label: "Feriados" },
];

// Mês/ano selecionados ficam guardados ao trocar de aba (e zeram ao sair da tela).
export async function renderPontoGestao(root) {
  let abaAtiva = "registros";
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
    if (abaAtiva === "registros") abaRegistros(conteudo, estado);
    else if (abaAtiva === "escalas") abaEscalas(conteudo);
    else abaFeriados(conteudo, estado);
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
