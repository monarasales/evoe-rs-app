// Modal de cadastro/edição de vaga — usado tanto no Funil de Vagas (kanban.js) quanto
// no CRM (crm.js, "cadastrar empresa e seguir com cadastro de vaga"). Extraído para um
// módulo compartilhado pra não duplicar o formulário (com upload de arquivo por IA,
// vaga de reposição, Stand By etc.) em dois lugares diferentes.
import { api } from "./api.js";
import { store, podeGerenciarVagas, showToast, nomeEmpresa, formatarData } from "./state.js";
import { abrirModal, fecharModal } from "./modal.js";
import { navegarPara } from "./router.js";

const TIPOS_VAGA_KANBAN = ["Nova", "Reposição"];
const MOTIVOS_REPOSICAO_KANBAN = ["Desistência do Candidato", "Cliente Demitiu", "Outro"];

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Abre o modal de Nova/Editar Vaga.
 * @param {object} opcoes
 * @param {object|null} opcoes.vaga - vaga existente (edição) ou null (criação).
 * @param {string|null} opcoes.empresaIdPadrao - pré-seleciona a empresa no formulário
 *   de vaga nova (ex: ao vir do CRM, logo depois de cadastrar/escolher a empresa).
 * @param {function} opcoes.aoSalvar - chamado depois de criar/editar/excluir/mudar
 *   standby com sucesso, pra quem chamou atualizar sua própria tela (kanban recarrega
 *   o board; CRM pode levar a pessoa direto pro Funil de Vagas, por exemplo).
 */
export async function abrirFormularioVaga({ vaga = null, empresaIdPadrao = null, aoSalvar = () => {} } = {}) {
  const editando = !!vaga;
  const podeEditar = !editando || podeGerenciarVagas() || vaga.consultorId === store.usuario.id;
  const todasVagasParaOrigem = await api.get("/api/vagas");
  const opcoesOrigem = todasVagasParaOrigem
    .filter((v) => !editando || v.id !== vaga.id)
    .sort((a, b) => (b.dataAbertura || "").localeCompare(a.dataAbertura || ""));

  abrirModal(`
    <h2>${editando ? "Editar Vaga" : "Nova Vaga"}</h2>
    ${
      !editando
        ? `<div class="form-row" style="background:#f7f9fb; border:1px dashed var(--border); border-radius:10px; padding:12px 14px;">
            <label>📄 Preencher automaticamente a partir de um arquivo (opcional)</label>
            <input type="file" id="v-arquivo" accept=".pdf,.docx,.txt" />
            <div class="sub" id="v-arquivo-status" style="margin-top:6px; margin-bottom:0;">Envie o perfil da vaga em PDF, Word (.docx) ou texto — a IA identifica título, perfil, salário, prazo e prioridade pra você conferir abaixo.</div>
          </div>`
        : ""
    }
    <form id="form-vaga">
      <div class="form-row">
        <label>Título da vaga</label>
        <input type="text" id="v-titulo" required value="${editando ? escapeHtml(vaga.titulo) : ""}" ${podeEditar ? "" : "disabled"} />
      </div>
      <div class="form-cols">
        <div class="form-row">
          <label>Empresa</label>
          <select id="v-empresa" required ${podeEditar ? "" : "disabled"}>
            ${store.empresas.map((e) => `<option value="${e.id}" ${editando ? (vaga.empresaId === e.id ? "selected" : "") : (empresaIdPadrao === e.id ? "selected" : "")}>${e.nome}</option>`).join("")}
          </select>
        </div>
        <div class="form-row">
          <label>Consultor responsável</label>
          <select id="v-consultor" required ${podeEditar && podeGerenciarVagas() ? "" : "disabled"}>
            ${store.consultores.filter((c) => c.perfil === "Recrutador" || c.perfil === "Supervisora" || c.id === (vaga && vaga.consultorId)).map((c) => `<option value="${c.id}" ${editando ? (vaga.consultorId === c.id ? "selected" : "") : (c.id === store.usuario.id ? "selected" : "")}>${c.nome}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="form-cols">
        <div class="form-row">
          <label>Tipo de vaga</label>
          <select id="v-tipo" ${podeEditar ? "" : "disabled"}>
            ${TIPOS_VAGA_KANBAN.map((t) => `<option ${(editando ? vaga.tipoVaga : "Nova") === t ? "selected" : ""}>${t}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="form-cols" id="reposicao-campos" style="${(editando ? vaga.tipoVaga : "Nova") === "Reposição" ? "" : "display:none;"}">
        <div class="form-row">
          <label>Vaga de origem (que está sendo reposta)</label>
          <select id="v-vaga-origem" ${podeEditar ? "" : "disabled"}>
            <option value="">— selecione —</option>
            ${opcoesOrigem.map((v) => `<option value="${v.id}" ${editando && vaga.vagaOrigemId === v.id ? "selected" : ""}>${v.titulo} (${nomeEmpresa(v.empresaId)})</option>`).join("")}
          </select>
        </div>
        <div class="form-row">
          <label>Motivo da reposição</label>
          <select id="v-motivo-reposicao" ${podeEditar ? "" : "disabled"}>
            ${MOTIVOS_REPOSICAO_KANBAN.map((m) => `<option ${editando && vaga.motivoReposicao === m ? "selected" : ""}>${m}</option>`).join("")}
          </select>
        </div>
      </div>
      ${
        editando && vaga.tipoVaga === "Reposição" && vaga.reposicaoInfo && vaga.reposicaoInfo.dentroGarantia !== null
          ? `<div class="sub" style="margin-top:-6px;">${vaga.reposicaoInfo.dentroGarantia ? "✅ Dentro do prazo de garantia do contrato original — verifique se não deve haver nova cobrança." : "⚠️ Fora do prazo de garantia do contrato original — pode ser cobrada como uma vaga nova."}</div>`
          : ""
      }
      <div class="form-cols">
        <div class="form-row">
          <label>Data de abertura</label>
          <input type="date" id="v-abertura" required value="${editando ? vaga.dataAbertura : new Date().toISOString().slice(0, 10)}" ${podeEditar ? "" : "disabled"} />
        </div>
        <div class="form-row">
          <label>Prazo de fechamento</label>
          <input type="date" id="v-prazo" required value="${editando ? vaga.prazoFechamento : ""}" ${podeEditar ? "" : "disabled"} />
        </div>
      </div>
      <div class="form-cols">
        <div class="form-row">
          <label>Prioridade</label>
          <select id="v-prioridade" ${podeEditar ? "" : "disabled"}>
            ${["Alta", "Média", "Baixa"].map((p) => `<option ${editando && vaga.prioridade === p ? "selected" : (!editando && p === "Média" ? "selected" : "")}>${p}</option>`).join("")}
          </select>
        </div>
        <div class="form-row">
          <label>Salário do cargo (R$)</label>
          <input type="number" id="v-salario" min="0" step="0.01" value="${editando ? (vaga.salario || "") : ""}" ${podeEditar ? "" : "disabled"} />
        </div>
      </div>
      <div class="sub" style="margin-top:-6px;">Usado para calcular o valor do contrato quando os honorários forem cobrados em % sobre o salário (tela Financeiro).</div>
      <div class="form-row">
        <label>Perfil da vaga (requisitos e cultura)</label>
        <textarea id="v-perfil" ${podeEditar ? "" : "disabled"}>${editando ? escapeHtml(vaga.perfilVaga || "") : ""}</textarea>
      </div>
      <div class="form-row">
        <label>Observações</label>
        <textarea id="v-obs" ${podeEditar ? "" : "disabled"}>${editando ? escapeHtml(vaga.observacoes || "") : ""}</textarea>
      </div>
      ${editando ? `<div class="form-row"><button type="button" id="btn-ver-candidatos" class="link-btn">Ver candidatos desta vaga (${vaga.qtdCandidatos}) →</button></div>` : ""}
      ${editando && podeEditar && !["11. Aprovado", "12. Cancelada/Encerrada"].includes(vaga.etapaAtual) ? `
      <div class="form-row standby-box ${vaga.emStandBy ? "standby-box--ativo" : ""}">
        <label>Stand By ${vaga.emStandBy ? `— pausada desde ${formatarData(vaga.dataInicioStandBy)}${vaga.motivoStandBy ? ` (${escapeHtml(vaga.motivoStandBy)})` : ""}` : ""}</label>
        <div class="sub" style="margin-bottom:8px;">Coloque a vaga em Stand By quando o processo ficar parado por motivo do cliente ou do candidato (ex: aguardando decisão interna). A contagem de prazo e SLA fica pausada até você retomar.</div>
        <button type="button" id="btn-toggle-standby" class="btn ${vaga.emStandBy ? "btn-primary" : "btn-outline"}">${vaga.emStandBy ? "Retomar vaga (sair do Stand By)" : "Colocar em Stand By"}</button>
      </div>` : ""}
      <div id="vaga-form-erro" class="form-erro hidden"></div>
      <div class="modal-close-row">
        ${editando && podeEditar ? '<button type="button" id="btn-excluir-vaga" class="btn btn-danger" style="margin-right:auto;">Excluir</button>' : ""}
        <button type="button" id="btn-cancelar" class="btn btn-outline">Fechar</button>
        ${podeEditar ? `<button type="submit" class="btn btn-primary">${editando ? "Salvar" : "Criar vaga"}</button>` : ""}
      </div>
    </form>
  `);

  document.getElementById("btn-cancelar").addEventListener("click", fecharModal);

  // Preenchimento automático a partir de arquivo (só em "Nova Vaga" — nunca sobrescreve
  // uma vaga já existente sozinho). Lê o arquivo, manda pra IA e pré-preenche os
  // campos abaixo; a pessoa sempre confere e ajusta antes de salvar de verdade.
  const inputArquivo = document.getElementById("v-arquivo");
  if (inputArquivo) {
    inputArquivo.addEventListener("change", async () => {
      const arquivo = inputArquivo.files[0];
      if (!arquivo) return;
      const statusEl = document.getElementById("v-arquivo-status");
      statusEl.textContent = "Lendo o arquivo com IA... isso pode levar alguns segundos.";
      inputArquivo.disabled = true;
      try {
        const dados = await api.upload("/api/vagas/extrair-arquivo", arquivo);
        if (dados.titulo) document.getElementById("v-titulo").value = dados.titulo;
        if (dados.perfilVaga) document.getElementById("v-perfil").value = dados.perfilVaga;
        if (dados.salario != null) document.getElementById("v-salario").value = dados.salario;
        if (dados.prioridade) document.getElementById("v-prioridade").value = dados.prioridade;
        if (dados.prazoSugeridoDias) {
          const dataPrazo = new Date();
          dataPrazo.setDate(dataPrazo.getDate() + dados.prazoSugeridoDias);
          document.getElementById("v-prazo").value = dataPrazo.toISOString().slice(0, 10);
        }

        let mensagem = "✅ Campos preenchidos — confira tudo antes de salvar.";
        if (dados.nomeEmpresaDetectado) {
          const alvo = dados.nomeEmpresaDetectado.toLowerCase();
          const empresaExistente = store.empresas.find(
            (e) => e.nome.toLowerCase().includes(alvo) || alvo.includes(e.nome.toLowerCase())
          );
          if (empresaExistente) {
            document.getElementById("v-empresa").value = empresaExistente.id;
            mensagem += ` Empresa identificada: ${empresaExistente.nome}.`;
          } else {
            mensagem += ` Empresa mencionada no arquivo: "${dados.nomeEmpresaDetectado}" — confira se já está cadastrada no CRM, ou crie antes de salvar.`;
          }
        }
        statusEl.textContent = mensagem;
      } catch (err) {
        statusEl.textContent = "⚠️ " + err.message;
      } finally {
        inputArquivo.disabled = false;
      }
    });
  }

  const selectTipo = document.getElementById("v-tipo");
  const camposReposicao = document.getElementById("reposicao-campos");
  if (selectTipo) {
    selectTipo.addEventListener("change", () => {
      camposReposicao.style.display = selectTipo.value === "Reposição" ? "" : "none";
    });
  }

  if (editando) {
    const btnCand = document.getElementById("btn-ver-candidatos");
    if (btnCand) btnCand.addEventListener("click", () => { fecharModal(); navegarPara(`#/candidatos/${vaga.id}`); });
    const btnExcluir = document.getElementById("btn-excluir-vaga");
    if (btnExcluir) {
      btnExcluir.addEventListener("click", async () => {
        if (!confirm("Excluir esta vaga? Essa ação não pode ser desfeita.")) return;
        try {
          await api.del(`/api/vagas/${vaga.id}`);
          fecharModal();
          showToast("Vaga excluída.", "sucesso");
          aoSalvar();
        } catch (err) {
          showToast(err.message, "erro");
        }
      });
    }
    const btnStandby = document.getElementById("btn-toggle-standby");
    if (btnStandby) {
      btnStandby.addEventListener("click", async () => {
        try {
          if (vaga.emStandBy) {
            await api.patch(`/api/vagas/${vaga.id}/standby`, { standBy: false });
            showToast("Vaga retomada — prazo e SLA voltaram a contar.", "sucesso");
          } else {
            const motivo = prompt("Motivo do Stand By (opcional):") || "";
            await api.patch(`/api/vagas/${vaga.id}/standby`, { standBy: true, motivo });
            showToast("Vaga em Stand By — prazo e SLA pausados.", "sucesso");
          }
          fecharModal();
          aoSalvar();
          window.__evoe.atualizarBadgeNotificacoes();
        } catch (err) {
          showToast(err.message, "erro");
        }
      });
    }
  }

  document.getElementById("form-vaga").addEventListener("submit", async (e) => {
    e.preventDefault();
    const tipoVaga = document.getElementById("v-tipo").value;
    const payload = {
      titulo: document.getElementById("v-titulo").value.trim(),
      empresaId: document.getElementById("v-empresa").value,
      consultorId: document.getElementById("v-consultor").value,
      dataAbertura: document.getElementById("v-abertura").value,
      prazoFechamento: document.getElementById("v-prazo").value,
      prioridade: document.getElementById("v-prioridade").value,
      salario: document.getElementById("v-salario").value,
      perfilVaga: document.getElementById("v-perfil").value,
      observacoes: document.getElementById("v-obs").value,
      tipoVaga,
      motivoReposicao: tipoVaga === "Reposição" ? document.getElementById("v-motivo-reposicao").value : "",
      vagaOrigemId: tipoVaga === "Reposição" ? document.getElementById("v-vaga-origem").value || null : null,
    };
    const erroBox = document.getElementById("vaga-form-erro");
    erroBox.classList.add("hidden");
    try {
      if (editando) {
        await api.patch(`/api/vagas/${vaga.id}`, payload);
        showToast("Vaga atualizada.", "sucesso");
      } else {
        await api.post("/api/vagas", payload);
        showToast("Vaga criada e movida para o Backlog.", "sucesso");
      }
      fecharModal();
      aoSalvar();
      window.__evoe.atualizarBadgeNotificacoes();
    } catch (err) {
      erroBox.textContent = err.message;
      erroBox.classList.remove("hidden");
    }
  });
}
