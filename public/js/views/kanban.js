import { api } from "../api.js";
import { store, podeGerenciarVagas, showToast, nomeEmpresa, nomeConsultor, formatarData } from "../state.js";
import { abrirFormularioVaga } from "../vagaModal.js";

const ETAPAS_ENCERRADAS_KANBAN = ["11. Aprovado", "12. Cancelada/Encerrada"];

// Vaga de Reposição: substituição de um profissional já colocado (desistência do
// candidato ou desligamento pelo cliente), geralmente dentro do prazo de garantia
// combinado no contrato original. Espelha TIPOS_VAGA/MOTIVOS_REPOSICAO em
// server/utils/constants.js.
const TIPOS_VAGA_KANBAN = ["Nova", "Reposição"];
const MOTIVOS_REPOSICAO_KANBAN = ["Desistência do Candidato", "Cliente Demitiu", "Outro"];

function tagStatusPrazo(status) {
  const map = {
    "No Prazo": "tag-nprazo",
    Atrasada: "tag-atrasada",
    "Concluída no Prazo": "tag-concluida",
    "Concluída com Atraso": "tag-atraso",
    Encerrada: "tag-encerrada",
    "Em Stand By": "tag-standby",
  };
  return `<span class="tag ${map[status] || ""}">${status === "Em Stand By" ? "⏸ Em Stand By" : status}</span>`;
}

function tagSla(sla) {
  if (!sla) return "";
  const map = { ideal: "tag-sla-ideal", dentro: "tag-sla-dentro", fora: "tag-sla-fora" };
  return `<span class="tag ${map[sla.nivel]}" title="${sla.rotulo}">SLA: ${sla.dias}d</span>`;
}

const PESO_PRIORIDADE = { Alta: 3, Média: 2, Baixa: 1 };

function colunaSortavel(campo, label, ordenacao) {
  const ativa = ordenacao.campo === campo;
  const seta = ativa ? (ordenacao.direcao === "asc" ? " ▲" : " ▼") : "";
  return `<th class="th-sortavel" data-campo="${campo}">${label}${seta}</th>`;
}

function cardVagaHtml(vaga) {
  return `
    <div class="vaga-card prioridade-${vaga.prioridade} ${vaga.emStandBy ? "vaga-card--standby" : ""}" draggable="true" data-id="${vaga.id}">
      <h4>${vaga.titulo}${vaga.tipoVaga === "Reposição" ? ' <span class="tag tag-reposicao" title="Vaga de reposição">🔁 Reposição</span>' : ""}</h4>
      <div class="empresa">${nomeEmpresa(vaga.empresaId)}</div>
      <div class="consultor-responsavel" title="Consultor responsável">🧑‍💼 ${nomeConsultor(vaga.consultorId)}</div>
      <div class="meta-row">
        ${tagStatusPrazo(vaga.statusPrazo)}
        <span class="candidatos-count" title="Candidatos nesta vaga">👤 ${vaga.qtdCandidatos}</span>
      </div>
      <div class="meta-row" style="margin-top:4px;">
        <span class="candidatos-count">Prazo: ${formatarData(vaga.prazoFechamento)}</span>
        <span class="candidatos-count">${vaga.diasEmAberto}d</span>
      </div>
      ${vaga.slaFechamento ? `<div class="meta-row" style="margin-top:4px;">${tagSla(vaga.slaFechamento)}</div>` : ""}
    </div>`;
}

export async function renderKanban(root) {
  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Funil de Vagas</h2>
        <div class="sub" id="kanban-sub">Arraste os cards entre as etapas para mover uma vaga no funil. As etapas vão sendo preenchidas conforme os dados avançam.</div>
      </div>
      <button id="btn-nova-vaga" class="btn btn-primary">+ Nova Vaga</button>
    </div>
    <div class="kanban-toolbar">
      <select id="filtro-consultor">
        <option value="">Todos os consultores</option>
        ${store.consultores.map((c) => `<option value="${c.id}">${c.nome}</option>`).join("")}
      </select>
      <div class="view-toggle" id="view-toggle">
        <button type="button" data-modo="compacto">Funil Compacto (tudo na tela)</button>
        <button type="button" data-modo="colunas">Colunas lado a lado</button>
        <button type="button" data-modo="lista">Lista</button>
      </div>
    </div>
    ${podeGerenciarVagas() ? `
    <div id="resumo-consultores" class="resumo-consultores"></div>` : ""}
    <div id="kanban-board" class="kanban-board"></div>
    <div id="kanban-lista" class="hidden"></div>
  `;

  const filtroConsultor = root.querySelector("#filtro-consultor");
  const resumoEl = root.querySelector("#resumo-consultores");
  if (!podeGerenciarVagas()) {
    filtroConsultor.value = store.usuario.id;
  }

  const board = root.querySelector("#kanban-board");
  const listaEl = root.querySelector("#kanban-lista");
  const subTexto = root.querySelector("#kanban-sub");
  const botoesModo = Array.from(root.querySelectorAll("#view-toggle button"));
  let modo = localStorage.getItem("evoe_kanban_modo") || "compacto";
  let vagasAtuais = [];
  let ordenacao = { campo: "urgencia", direcao: "desc" };

  function aplicarModo() {
    const ehLista = modo === "lista";
    board.classList.toggle("hidden", ehLista);
    board.classList.toggle("kanban-board--compacto", modo === "compacto");
    listaEl.classList.toggle("hidden", !ehLista);
    botoesModo.forEach((b) => b.classList.toggle("ativo", b.dataset.modo === modo));
    subTexto.textContent =
      modo === "compacto"
        ? "Todas as etapas em uma coluna só, sem precisar rolar para o lado — role a página para baixo para ver o funil completo."
        : modo === "lista"
        ? "Lista ordenável — clique no cabeçalho de uma coluna para ordenar. Por padrão, as mais atrasadas aparecem primeiro."
        : "Arraste os cards entre as etapas para mover uma vaga no funil. Role para o lado para ver todas as etapas.";
    localStorage.setItem("evoe_kanban_modo", modo);
    if (ehLista) montarLista(vagasAtuais);
  }

  botoesModo.forEach((b) => {
    b.addEventListener("click", () => {
      modo = b.dataset.modo;
      aplicarModo();
    });
  });
  aplicarModo();

  async function carregar() {
    // Busca sempre todas as vagas (sem filtro no servidor): assim o resumo por consultor
    // fica sempre completo, e o filtro da tela é aplicado aqui do lado do cliente.
    const todasVagas = await api.get("/api/vagas");
    if (resumoEl) atualizarResumoConsultores(todasVagas);
    vagasAtuais = filtroConsultor.value ? todasVagas.filter((v) => v.consultorId === filtroConsultor.value) : todasVagas;
    montarBoard(vagasAtuais);
    if (modo === "lista") montarLista(vagasAtuais);
  }

  function atualizarResumoConsultores(todasVagas) {
    const abertas = todasVagas.filter((v) => !ETAPAS_ENCERRADAS_KANBAN.includes(v.etapaAtual));
    const porConsultor = {};
    abertas.forEach((v) => {
      porConsultor[v.consultorId] = (porConsultor[v.consultorId] || 0) + 1;
    });
    const recrutadores = store.consultores.filter((c) => (c.perfil === "Recrutador" || c.perfil === "Supervisora") && c.ativo !== false);
    if (recrutadores.length === 0) {
      resumoEl.innerHTML = "";
      return;
    }
    resumoEl.innerHTML =
      `<span class="resumo-consultores-titulo">Vagas em aberto por consultor:</span>` +
      recrutadores
        .map(
          (c) => `
        <button type="button" class="resumo-consultor-badge${filtroConsultor.value === c.id ? " ativo" : ""}" data-id="${c.id}" title="Clique para filtrar só as vagas de ${c.nome}">
          <span class="nome">${c.nome}</span>
          <span class="count">${porConsultor[c.id] || 0}</span>
        </button>`
        )
        .join("");
    resumoEl.querySelectorAll(".resumo-consultor-badge").forEach((btn) =>
      btn.addEventListener("click", () => {
        filtroConsultor.value = filtroConsultor.value === btn.dataset.id ? "" : btn.dataset.id;
        carregar();
      })
    );
  }

  function montarBoard(vagas) {
    board.innerHTML = store.etapasVaga
      .map((etapa) => {
        const daEtapa = vagas.filter((v) => v.etapaAtual === etapa);
        return `
          <div class="kanban-column" data-etapa="${etapa}">
            <div class="kanban-column-header">
              <span>${etapa}</span>
              <span class="count">${daEtapa.length}</span>
            </div>
            <div class="kanban-column-body">
              ${daEtapa.map(cardVagaHtml).join("") || ""}
            </div>
          </div>`;
      })
      .join("");

    board.querySelectorAll(".vaga-card").forEach((card) => {
      card.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", card.dataset.id);
        setTimeout(() => card.style.opacity = "0.4", 0);
      });
      card.addEventListener("dragend", () => (card.style.opacity = "1"));
      card.addEventListener("click", () => abrirVaga(card.dataset.id));
    });

    board.querySelectorAll(".kanban-column").forEach((col) => {
      col.addEventListener("dragover", (e) => {
        e.preventDefault();
        col.classList.add("drag-over");
      });
      col.addEventListener("dragleave", () => col.classList.remove("drag-over"));
      col.addEventListener("drop", async (e) => {
        e.preventDefault();
        col.classList.remove("drag-over");
        const vagaId = e.dataTransfer.getData("text/plain");
        const novaEtapa = col.dataset.etapa;
        try {
          await api.patch(`/api/vagas/${vagaId}/etapa`, { etapa: novaEtapa });
          showToast("Vaga movida para: " + novaEtapa, "sucesso");
          carregar();
          window.__evoe.atualizarBadgeNotificacoes();
        } catch (err) {
          showToast(err.message, "erro");
        }
      });
    });
  }

  function valorOrdenavel(vaga, campo) {
    switch (campo) {
      case "urgencia":
        // Atrasadas primeiro; dentro de cada grupo, quem está aberta há mais tempo primeiro.
        return (vaga.statusPrazo === "Atrasada" ? 1000 : 0) + vaga.diasEmAberto;
      case "titulo":
        return vaga.titulo.toLowerCase();
      case "empresa":
        return nomeEmpresa(vaga.empresaId).toLowerCase();
      case "consultor":
        return (store.consultores.find((c) => c.id === vaga.consultorId)?.nome || "").toLowerCase();
      case "etapa":
        return store.etapasVaga.indexOf(vaga.etapaAtual);
      case "diasEmAberto":
        return vaga.diasEmAberto;
      case "prazoFechamento":
        return vaga.prazoFechamento || "";
      case "prioridade":
        return PESO_PRIORIDADE[vaga.prioridade] || 0;
      default:
        return 0;
    }
  }

  function montarLista(vagas) {
    const ordenadas = [...vagas].sort((a, b) => {
      const va = valorOrdenavel(a, ordenacao.campo);
      const vb = valorOrdenavel(b, ordenacao.campo);
      let cmp = va < vb ? -1 : va > vb ? 1 : 0;
      if (ordenacao.direcao === "desc") cmp = -cmp;
      return cmp;
    });

    if (ordenadas.length === 0) {
      listaEl.innerHTML = '<div class="empty-state">Nenhuma vaga para exibir com esse filtro.</div>';
      return;
    }

    listaEl.innerHTML = `
      <table>
        <thead>
          <tr>
            ${colunaSortavel("urgencia", "Prioridade de Atenção", ordenacao)}
            ${colunaSortavel("titulo", "Vaga", ordenacao)}
            ${colunaSortavel("empresa", "Empresa", ordenacao)}
            ${colunaSortavel("consultor", "Consultor", ordenacao)}
            ${colunaSortavel("etapa", "Etapa Atual", ordenacao)}
            ${colunaSortavel("diasEmAberto", "Dias em Aberto", ordenacao)}
            ${colunaSortavel("prazoFechamento", "Prazo", ordenacao)}
            ${colunaSortavel("prioridade", "Prioridade", ordenacao)}
          </tr>
        </thead>
        <tbody>
          ${ordenadas
            .map(
              (v) => `
            <tr data-id="${v.id}" style="cursor:pointer;">
              <td>${tagStatusPrazo(v.statusPrazo)}</td>
              <td>${v.titulo}${v.tipoVaga === "Reposição" ? ' <span class="tag tag-reposicao" title="Vaga de reposição">🔁 Reposição</span>' : ""}</td>
              <td>${nomeEmpresa(v.empresaId)}</td>
              <td>${store.consultores.find((c) => c.id === v.consultorId)?.nome || "—"}</td>
              <td>${v.etapaAtual}</td>
              <td>${v.diasEmAberto}d</td>
              <td>${formatarData(v.prazoFechamento)}</td>
              <td><span class="tag prioridade-tag-${v.prioridade}">${v.prioridade}</span></td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    `;

    listaEl.querySelectorAll("tbody tr").forEach((tr) => {
      tr.addEventListener("click", () => abrirVaga(tr.dataset.id));
    });
    listaEl.querySelectorAll(".th-sortavel").forEach((th) => {
      th.addEventListener("click", () => {
        const campo = th.dataset.campo;
        if (ordenacao.campo === campo) {
          ordenacao.direcao = ordenacao.direcao === "asc" ? "desc" : "asc";
        } else {
          ordenacao = { campo, direcao: campo === "urgencia" ? "desc" : "asc" };
        }
        montarLista(vagasAtuais);
      });
    });
  }

  filtroConsultor.addEventListener("change", carregar);
  root.querySelector("#btn-nova-vaga").addEventListener("click", () => abrirFormularioVaga({ aoSalvar: carregar }));

  await carregar();

  async function abrirVaga(id) {
    const vaga = await api.get(`/api/vagas/${id}`);
    abrirFormularioVaga({ vaga, aoSalvar: carregar });
  }
}
