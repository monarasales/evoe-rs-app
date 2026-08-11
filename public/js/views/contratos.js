import { api } from "../api.js";
import { store, isGestor, showToast, formatarData } from "../state.js";
import { abrirModal, fecharModal } from "../modal.js";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

const PADRAO = {
  tipoCobranca: "Percentual",
  percentualHonorarios: 90,
  comissaoEstimada: 0,
  valorTotalPersonalizado: null,
  clausulaHonorariosTexto: "",
  valorFixo: 0,
  valorPermuta: 0,
  descricaoPermuta: "",
  parcelaInicialPct: 50,
  parcelaFechamentoPct: 50,
  prazoReposicaoDias: 60,
  vigenciaDias: 90,
  prazoRescisaoAvisoDias: 30,
  dataVencimentoParcela1: "",
  dataVencimentoParcela2: "",
};

function somarDias(dataStr, dias) {
  if (!dataStr) return "";
  const d = new Date(dataStr + "T00:00:00");
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function vencimentoVencido(dataStr) {
  return dataStr < new Date().toISOString().slice(0, 10);
}

function formatarReal(valor) {
  return (Number(valor) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Espelha server/utils/contratoTexto.js (montarTextoHonorarios) — usado só para
// pré-preencher a caixa de texto da cláusula no formulário, com o mesmo texto que o
// sistema geraria automaticamente. Se a usuária editar a caixa, o texto dela é que
// vale (tanto aqui quanto no PDF/Word gerado pelo backend).
function textoHonorariosPadrao({ tipoCobranca, percentualHonorarios, comissaoEstimada, valorFixo, valorPermuta, descricaoPermuta, parcelaInicialPct, parcelaFechamentoPct, valorTotal }) {
  const comissao = Number(comissaoEstimada) || 0;
  const total = Number(valorTotal) || 0;
  const trechoValor = total > 0 ? `, equivalente a ${formatarReal(total)} nesta contratação` : "";
  if (tipoCobranca === "ValorFixo") {
    return `Pela prestação dos serviços contratados, a CONTRATANTE pagará à CONTRATADA o valor fixo de ${formatarReal(valorFixo)} pela vaga trabalhada, independentemente do salário do cargo. Sendo que a primeira parcela a ser paga no percentual de ${parcelaInicialPct}% desse valor para iniciar o serviço e os outros ${parcelaFechamentoPct}% no fechamento da vaga.`;
  }
  if (tipoCobranca === "Permuta") {
    return `Pela prestação dos serviços contratados, as partes acordam o pagamento em regime de permuta, no valor correspondente a ${formatarReal(valorPermuta)}${descricaoPermuta ? `, referente a ${descricaoPermuta}` : ""}, em substituição ao pagamento em espécie. Sendo que a primeira parcela a ser paga no percentual de ${parcelaInicialPct}% desse valor para iniciar o serviço e os outros ${parcelaFechamentoPct}% no fechamento da vaga.`;
  }
  if (comissao > 0) {
    return `Pela prestação dos serviços contratados, a CONTRATANTE pagará à CONTRATADA um percentual por vaga trabalhada de ${percentualHonorarios}% em cima do salário mais comissão do cargo${trechoValor}, aplicável às vagas da área comercial cuja remuneração contempla parte variável (comissionamento). Sendo que a primeira parcela a ser paga no percentual de ${parcelaInicialPct}% para iniciar o serviço e os outros ${parcelaFechamentoPct}% no fechamento da vaga. Vagas que a porcentagem aplicada em cima do salário mais comissão o resultado for menos que um salário-mínimo, aplicamos a cobrança da vaga o valor do salário-mínimo vigente.`;
  }
  return `Pela prestação dos serviços contratados, a CONTRATANTE pagará à CONTRATADA um percentual por vaga trabalhada de ${percentualHonorarios}% em cima do salário${trechoValor}. Sendo que a primeira parcela a ser paga no percentual de ${parcelaInicialPct}% para iniciar o serviço e os outros ${parcelaFechamentoPct}% no fechamento da vaga. Vagas que a porcentagem aplicada em cima do salário o resultado for menos que um salário-mínimo, aplicamos a cobrança da vaga o valor do salário-mínimo vigente.`;
}

export async function renderContratos(root) {
  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Contratos</h2>
        <div class="sub">Gere o contrato de prestação de serviços já preenchido com os dados do cliente e da vaga.</div>
      </div>
      <button id="btn-novo-contrato" class="btn btn-primary btn-sm">+ Novo Contrato</button>
    </div>
    <div id="contratos-lista"><div class="empty-state">Carregando contratos...</div></div>
  `;

  root.querySelector("#btn-novo-contrato").addEventListener("click", () => abrirFormularioContrato());

  await carregarLista();

  async function carregarLista() {
    const el = root.querySelector("#contratos-lista");
    const contratos = await api.get("/api/contratos");
    if (contratos.length === 0) {
      el.innerHTML = '<div class="empty-state">Nenhum contrato gerado ainda. Clique em "+ Novo Contrato" para começar.</div>';
      return;
    }
    el.innerHTML = `
      <table>
        <thead>
          <tr><th>Nº</th><th>Cliente</th><th>Vaga</th><th>Data</th><th>Valor Total</th><th>Vencto. 2ª parcela</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          ${contratos
            .map(
              (c) => `
            <tr data-id="${c.id}">
              <td><strong>${escapeHtml(c.numero)}</strong></td>
              <td>${escapeHtml(c.empresaNome)}</td>
              <td>${escapeHtml(c.vagaTitulo)}</td>
              <td>${formatarData(c.dataContrato)}</td>
              <td>${c.salarioFaltando ? '<span class="sub" title="Cadastre o salário do cargo na vaga para calcular">sem salário</span>' : formatarReal(c.valorTotalContrato)}</td>
              <td>${c.dataVencimentoParcela2 ? `<span class="tag ${vencimentoVencido(c.dataVencimentoParcela2) ? "tag-atrasada" : "tag-nprazo"}">${formatarData(c.dataVencimentoParcela2)}</span>` : "—"}</td>
              <td><span class="tag ${c.status === "Gerado" ? "tag-nprazo" : "tag-standby"}">${escapeHtml(c.status)}</span></td>
              <td class="acoes-contrato">
                <button class="btn btn-outline btn-sm btn-pdf" title="Baixar PDF">📄 PDF</button>
                <button class="btn btn-outline btn-sm btn-docx" title="Baixar em Word">📝 Word</button>
                <button class="btn btn-outline btn-sm btn-email" title="Enviar por e-mail">✉️ E-mail</button>
                <button class="btn btn-outline btn-sm btn-whats" title="Enviar por WhatsApp">💬 WhatsApp</button>
                ${isGestor() ? '<button class="btn btn-outline btn-sm btn-editar-contrato" title="Editar dados do contrato">✏️ Editar</button>' : ""}
                ${isGestor() ? '<button class="btn btn-outline btn-sm btn-excluir-contrato" title="Excluir">🗑️</button>' : ""}
              </td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    `;

    el.querySelectorAll(".btn-pdf").forEach((btn) =>
      btn.addEventListener("click", (e) => {
        const id = e.target.closest("tr").dataset.id;
        window.open(`/api/contratos/${id}/pdf`, "_blank");
      })
    );

    el.querySelectorAll(".btn-docx").forEach((btn) =>
      btn.addEventListener("click", (e) => {
        const id = e.target.closest("tr").dataset.id;
        window.open(`/api/contratos/${id}/docx`, "_blank");
      })
    );

    if (isGestor()) {
      el.querySelectorAll(".btn-editar-contrato").forEach((btn) =>
        btn.addEventListener("click", (e) => {
          const id = e.target.closest("tr").dataset.id;
          abrirFormularioContrato(contratos.find((c) => c.id === id));
        })
      );
    }

    el.querySelectorAll(".btn-email").forEach((btn) =>
      btn.addEventListener("click", (e) => {
        const id = e.target.closest("tr").dataset.id;
        const contrato = contratos.find((c) => c.id === id);
        abrirEnvioEmail(contrato);
      })
    );

    el.querySelectorAll(".btn-whats").forEach((btn) =>
      btn.addEventListener("click", async (e) => {
        const id = e.target.closest("tr").dataset.id;
        try {
          const { link } = await api.get(`/api/contratos/${id}/link-whatsapp`);
          window.open(link, "_blank");
          showToast("WhatsApp aberto com a mensagem pronta — anexe o PDF (já baixado) na conversa.", "sucesso");
        } catch (err) {
          showToast(err.message, "erro");
        }
      })
    );

    if (isGestor()) {
      el.querySelectorAll(".btn-excluir-contrato").forEach((btn) =>
        btn.addEventListener("click", async (e) => {
          const id = e.target.closest("tr").dataset.id;
          if (!confirm("Excluir este contrato? Essa ação não pode ser desfeita.")) return;
          await api.del(`/api/contratos/${id}`);
          showToast("Contrato excluído.", "sucesso");
          carregarLista();
        })
      );
    }
  }

  function abrirEnvioEmail(contrato) {
    abrirModal(`
      <h2>Enviar contrato por e-mail</h2>
      <p class="sub">Contrato nº ${escapeHtml(contrato.numero)} — ${escapeHtml(contrato.empresaNome)}</p>
      <form id="form-email-contrato">
        <div class="form-row"><label>E-mail de destino</label><input type="email" id="ec-email" required value="" placeholder="cliente@empresa.com.br" /></div>
        <div id="email-form-erro" class="form-erro hidden"></div>
        <div class="modal-close-row">
          <button type="button" id="btn-cancelar-email" class="btn btn-outline">Fechar</button>
          <button type="submit" class="btn btn-primary">Enviar</button>
        </div>
      </form>
    `);
    document.getElementById("btn-cancelar-email").addEventListener("click", fecharModal);
    document.getElementById("form-email-contrato").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const para = document.getElementById("ec-email").value.trim();
      try {
        await api.post(`/api/contratos/${contrato.id}/enviar-email`, { para });
        showToast(`Contrato enviado para ${para}.`, "sucesso");
        fecharModal();
        carregarLista();
      } catch (err) {
        const box = document.getElementById("email-form-erro");
        box.textContent = err.message;
        box.classList.remove("hidden");
      }
    });
  }

  async function abrirFormularioContrato(contratoExistente) {
    const editando = !!contratoExistente;
    const vagas = await api.get("/api/vagas");
    const vagasOrdenadas = [...vagas].sort((a, b) => (a.dataAbertura < b.dataAbertura ? 1 : -1));
    const c = contratoExistente || PADRAO;
    const tipoInicial = editando ? (c.tipoCobranca || "Percentual") : "Percentual";

    abrirModal(`
      <h2>${editando ? `Editar Contrato ${escapeHtml(c.numero)}` : "Novo Contrato"}</h2>
      <form id="form-contrato">
        ${
          editando
            ? `<div class="form-row"><label>Vaga / Cliente</label><input type="text" disabled value="${escapeHtml(c.cargoObjeto)} — ${escapeHtml(c.empresaNome)}" /></div>
               <div class="sub" style="margin-top:-6px;">Não é possível trocar a vaga de um contrato já gerado — para isso, exclua e crie um novo.</div>`
            : `<div class="form-row">
                <label>Vaga (o cliente e o cargo são preenchidos automaticamente)</label>
                <select id="ct-vaga" required>
                  <option value="">Selecione a vaga...</option>
                  ${vagasOrdenadas
                    .map((v) => {
                      const empresa = store.empresas.find((e) => e.id === v.empresaId);
                      return `<option value="${v.id}">${escapeHtml(v.titulo)} — ${escapeHtml(empresa ? empresa.nome : "—")}</option>`;
                    })
                    .join("")}
                </select>
              </div>
              <div id="ct-aviso-empresa" class="form-erro hidden" style="margin-top:-6px;"></div>`
        }

        <div class="form-cols">
          <div class="form-row"><label>Data do contrato</label><input type="date" id="ct-data" value="${editando ? c.dataContrato : new Date().toISOString().slice(0, 10)}" /></div>
          <div class="form-row"><label>Vigência (dias)</label><input type="number" id="ct-vigencia" min="1" value="${editando ? c.vigenciaDias : PADRAO.vigenciaDias}" /></div>
        </div>

        <div class="section-title" style="margin-top:6px;">Honorários</div>
        <div class="form-row">
          <label>Tipo de cobrança</label>
          <div style="display:flex; gap:16px; align-items:center; margin-top:4px; flex-wrap:wrap;">
            <label style="display:flex; align-items:center; gap:6px; font-weight:normal;">
              <input type="radio" name="ct-tipo-cobranca" value="Percentual" ${tipoInicial === "Percentual" ? "checked" : ""} /> Percentual sobre o salário
            </label>
            <label style="display:flex; align-items:center; gap:6px; font-weight:normal;">
              <input type="radio" name="ct-tipo-cobranca" value="ValorFixo" ${tipoInicial === "ValorFixo" ? "checked" : ""} /> Valor fixo (negociado)
            </label>
            <label style="display:flex; align-items:center; gap:6px; font-weight:normal;">
              <input type="radio" name="ct-tipo-cobranca" value="Permuta" ${tipoInicial === "Permuta" ? "checked" : ""} /> Permuta
            </label>
          </div>
        </div>
        <div id="ct-preview-valor" class="card" style="margin:10px 0; padding:12px 14px;"></div>

        <div class="form-row" id="ct-row-percentual"><label>Percentual sobre o salário (%)</label><input type="number" id="ct-percentual" min="1" max="200" value="${editando ? c.percentualHonorarios : PADRAO.percentualHonorarios}" /></div>
        <div class="form-row" id="ct-row-valorfixo"><label>Valor fixo (R$)</label><input type="number" id="ct-valorfixo" min="0" step="0.01" value="${editando ? c.valorFixo || 0 : PADRAO.valorFixo}" /></div>
        <div class="form-row" id="ct-row-valorpermuta"><label>Valor da permuta (R$)</label><input type="number" id="ct-valorpermuta" min="0" step="0.01" value="${editando ? c.valorPermuta || 0 : PADRAO.valorPermuta}" /></div>
        <div class="form-row" id="ct-row-descricaopermuta"><label>O que está sendo permutado</label><input type="text" id="ct-descricaopermuta" placeholder="ex: divulgação da vaga em troca de material publicitário" value="${editando ? escapeHtml(c.descricaoPermuta || "") : ""}" /></div>

        <div class="form-row" id="ct-box-comissao" style="background:#f7f9fb; border:1px dashed var(--border); border-radius:10px; padding:12px 14px;">
          <label class="checkbox-row" style="margin-bottom:0;">
            <input type="checkbox" id="ct-tem-comissao" ${editando && c.comissaoEstimada > 0 ? "checked" : ""} />
            Este cargo é da área comercial e tem comissão (remuneração com parte variável)
          </label>
          <div class="sub" style="margin:4px 0 0;">Quando marcado, a taxa passa a ser calculada sobre salário + comissão (em vez de só salário), e a cláusula do contrato deixa isso explícito.</div>
          <div class="form-row" id="ct-row-comissao-valor" style="margin:10px 0 0; display:none;">
            <label>Comissão média estimada (R$)</label>
            <input type="number" id="ct-comissao" min="0" step="0.01" value="${editando ? c.comissaoEstimada || 0 : PADRAO.comissaoEstimada}" />
          </div>
        </div>

        <div class="form-row"><label>Prazo de reposição (dias)</label><input type="number" id="ct-reposicao" min="1" value="${editando ? c.prazoReposicaoDias : PADRAO.prazoReposicaoDias}" /></div>

        <div class="form-row" id="ct-box-valor-final" style="background:#f7f9fb; border:1px dashed var(--border); border-radius:10px; padding:12px 14px;">
          <label class="checkbox-row" style="margin-bottom:0;">
            <input type="checkbox" id="ct-usa-valor-final" ${editando && c.valorTotalPersonalizado !== null && c.valorTotalPersonalizado !== undefined ? "checked" : ""} />
            Prefiro digitar o valor final do contrato eu mesma
          </label>
          <div class="sub" style="margin:4px 0 0;">Use só se o valor combinado com o cliente for diferente do resultado do cálculo acima (salário × percentual, com ou sem comissão) — esse valor passa a valer nas parcelas e no texto do contrato.</div>
          <div class="form-row" id="ct-row-valor-final-input" style="margin:10px 0 0; display:none;">
            <label>Valor final do contrato (R$)</label>
            <input type="number" id="ct-valor-final" min="0" step="0.01" value="${editando && c.valorTotalPersonalizado !== null && c.valorTotalPersonalizado !== undefined ? c.valorTotalPersonalizado : ""}" />
          </div>
        </div>

        <div class="form-cols">
          <div class="form-row"><label>1ª parcela — início do serviço (%)</label><input type="number" id="ct-parcela1" min="0" max="100" value="${editando ? c.parcelaInicialPct : PADRAO.parcelaInicialPct}" /></div>
          <div class="form-row"><label>2ª parcela — fechamento da vaga (%)</label><input type="number" id="ct-parcela2" min="0" max="100" value="${editando ? c.parcelaFechamentoPct : PADRAO.parcelaFechamentoPct}" /></div>
        </div>
        <div class="form-row"><label>Texto da Cláusula de Honorários (Cláusula 5, item I)</label><textarea id="ct-clausula-honorarios" rows="4"></textarea></div>
        <div class="sub" style="margin-top:-6px;">Preenchido automaticamente de acordo com o tipo de cobrança acima — edite à vontade se precisar de uma redação diferente para este contrato específico.</div>
        <div class="form-cols">
          <div class="form-row"><label>Vencimento da 1ª parcela</label><input type="date" id="ct-venc-p1" value="${editando ? (c.dataVencimentoParcela1 || "") : ""}" /></div>
          <div class="form-row"><label>Vencimento da 2ª parcela</label><input type="date" id="ct-venc-p2" value="${editando ? (c.dataVencimentoParcela2 || "") : ""}" /></div>
        </div>
        <div class="sub" style="margin-top:-6px;">O vencimento da 2ª parcela é preenchido automaticamente 30 dias após a 1ª — você recebe um lembrete para cobrar o cliente quando essa data se aproximar. Pode ajustar a mão se combinar outro prazo com o cliente.</div>
        <div class="form-row"><label>Aviso prévio para rescisão sem multa (dias)</label><input type="number" id="ct-aviso" min="1" value="${editando ? c.prazoRescisaoAvisoDias : PADRAO.prazoRescisaoAvisoDias}" /></div>

        <div class="section-title" style="margin-top:6px;">Testemunhas</div>
        <div class="form-cols">
          <div class="form-row"><label>Testemunha 1 — Nome</label><input type="text" id="ct-t1-nome" value="${editando ? escapeHtml(c.testemunha1Nome) : ""}" /></div>
          <div class="form-row"><label>Testemunha 1 — CPF</label><input type="text" id="ct-t1-cpf" value="${editando ? escapeHtml(c.testemunha1Cpf) : ""}" /></div>
        </div>
        <div class="form-cols">
          <div class="form-row"><label>Testemunha 2 — Nome</label><input type="text" id="ct-t2-nome" value="${editando ? escapeHtml(c.testemunha2Nome) : ""}" /></div>
          <div class="form-row"><label>Testemunha 2 — CPF</label><input type="text" id="ct-t2-cpf" value="${editando ? escapeHtml(c.testemunha2Cpf) : ""}" /></div>
        </div>
        <div class="sub">Pode deixar em branco e preencher à mão na hora da assinatura, se preferir.</div>

        <div id="contrato-form-erro" class="form-erro hidden" style="margin-top:10px;"></div>
        <div class="modal-close-row">
          <button type="button" id="btn-cancelar-ct" class="btn btn-outline">Fechar</button>
          <button type="submit" class="btn btn-primary">${editando ? "Salvar alterações" : "Gerar contrato"}</button>
        </div>
      </form>
    `);

    document.getElementById("btn-cancelar-ct").addEventListener("click", fecharModal);

    const selectVaga = document.getElementById("ct-vaga");

    const rowPercentual = document.getElementById("ct-row-percentual");
    const boxComissao = document.getElementById("ct-box-comissao");
    const rowValorFixo = document.getElementById("ct-row-valorfixo");
    const rowValorPermuta = document.getElementById("ct-row-valorpermuta");
    const rowDescricaoPermuta = document.getElementById("ct-row-descricaopermuta");
    const radiosTipo = document.querySelectorAll('input[name="ct-tipo-cobranca"]');
    const atualizarVisibilidadeCobranca = () => {
      const tipo = document.querySelector('input[name="ct-tipo-cobranca"]:checked').value;
      rowPercentual.style.display = tipo === "Percentual" ? "" : "none";
      boxComissao.style.display = tipo === "Percentual" ? "" : "none";
      rowValorFixo.style.display = tipo === "ValorFixo" ? "" : "none";
      rowValorPermuta.style.display = tipo === "Permuta" ? "" : "none";
      rowDescricaoPermuta.style.display = tipo === "Permuta" ? "" : "none";
      atualizarPreviewValor();
      atualizarClausulaPadrao();
    };
    radiosTipo.forEach((r) => r.addEventListener("change", atualizarVisibilidadeCobranca));

    // Comissão (área comercial): só existe uma pergunta de sim/não — quando marcada,
    // revela o campo de valor; quando desmarcada, zera o valor pra garantir que uma
    // comissão escondida não continue influenciando o cálculo por engano.
    const checkComissao = document.getElementById("ct-tem-comissao");
    const rowComissaoValor = document.getElementById("ct-row-comissao-valor");
    const inputComissao = document.getElementById("ct-comissao");
    const atualizarVisibilidadeComissao = () => {
      rowComissaoValor.style.display = checkComissao.checked ? "" : "none";
      if (!checkComissao.checked) inputComissao.value = "0";
      atualizarPreviewValor();
      atualizarClausulaPadrao();
    };
    checkComissao.addEventListener("change", atualizarVisibilidadeComissao);

    // Valor final manual: mesma lógica — some o campo quando desmarcado, pra não deixar
    // um valor esquecido sobrepondo o cálculo automático sem a usuária perceber.
    const checkValorFinal = document.getElementById("ct-usa-valor-final");
    const rowValorFinalInput = document.getElementById("ct-row-valor-final-input");
    const atualizarVisibilidadeValorFinal = () => {
      rowValorFinalInput.style.display = checkValorFinal.checked ? "" : "none";
      if (!checkValorFinal.checked) inputValorFinal.value = "";
      atualizarPreviewValor();
    };
    checkValorFinal.addEventListener("change", atualizarVisibilidadeValorFinal);

    // Calcula e mostra ao vivo o valor total estimado do contrato, puxando o salário
    // já cadastrado na vaga quando o tipo de cobrança é "Percentual" (somado à comissão
    // estimada, se preenchida) — assim a usuária vê o resultado do cálculo na hora, sem
    // precisar salvar para descobrir o valor. Se "Valor final do contrato" estiver
    // preenchido, ele sobrepõe qualquer cálculo automático.
    const previewEl = document.getElementById("ct-preview-valor");
    const inputValorFinal = document.getElementById("ct-valor-final");
    function vagaSelecionada() {
      if (editando) return { salario: c.vagaSalario || 0, titulo: c.vagaTitulo };
      const vaga = vagas.find((v) => v.id === selectVaga.value);
      return vaga ? { salario: vaga.salario || 0, titulo: vaga.titulo } : null;
    }
    // Calcula o valor total do contrato com as regras atuais da tela (mesma lógica do
    // backend em calcularValorContrato): valor final manual > percentual (salário +
    // comissão) > valor fixo > permuta. Usado tanto no resumo visual quanto pra deixar
    // o valor já explícito na cláusula de honorários (não só o percentual).
    function calcularValorTotalAtual() {
      const tipo = document.querySelector('input[name="ct-tipo-cobranca"]:checked').value;
      const vagaInfo = vagaSelecionada();
      let valorTotal = 0;
      let detalhe = "";
      const valorFinalManual = inputValorFinal.value !== "" ? Number(inputValorFinal.value) : null;

      if (valorFinalManual !== null && !Number.isNaN(valorFinalManual)) {
        valorTotal = valorFinalManual;
        detalhe = "Valor digitado manualmente — sobrepõe o cálculo automático.";
      } else if (tipo === "Percentual") {
        const pct = Number(document.getElementById("ct-percentual").value) || 0;
        const comissao = Number(document.getElementById("ct-comissao").value) || 0;
        if (!vagaInfo) {
          detalhe = "Selecione a vaga para calcular.";
        } else if (!vagaInfo.salario) {
          detalhe = `Cadastre o salário do cargo na vaga "${vagaInfo.titulo}" (Funil de Vagas) para o sistema calcular automaticamente.`;
        } else {
          valorTotal = Math.round((((vagaInfo.salario + comissao) * pct) / 100) * 100) / 100;
          detalhe = comissao > 0
            ? `Base de cálculo: ${formatarReal(vagaInfo.salario)} (salário) + ${formatarReal(comissao)} (comissão) = ${formatarReal(vagaInfo.salario + comissao)} × ${pct}%`
            : `Base de cálculo: ${formatarReal(vagaInfo.salario)} (salário da vaga) × ${pct}%`;
        }
      } else if (tipo === "ValorFixo") {
        valorTotal = Number(document.getElementById("ct-valorfixo").value) || 0;
        detalhe = "Valor fixo negociado com o cliente.";
      } else {
        valorTotal = Number(document.getElementById("ct-valorpermuta").value) || 0;
        detalhe = "Valor da permuta — não é dinheiro em caixa, entra só como valor contratado.";
      }
      return { valorTotal, detalhe };
    }

    function atualizarPreviewValor() {
      const { valorTotal, detalhe } = calcularValorTotalAtual();
      const parcela1Pct = Number(document.getElementById("ct-parcela1").value) || 0;
      const parcela2Pct = Number(document.getElementById("ct-parcela2").value) || 0;
      const valorParcela1 = Math.round(((valorTotal * parcela1Pct) / 100) * 100) / 100;
      const valorParcela2 = Math.round(((valorTotal * parcela2Pct) / 100) * 100) / 100;

      previewEl.innerHTML = `
        <div class="kpi-label">Valor total estimado do contrato</div>
        <div class="kpi-value">${formatarReal(valorTotal)}</div>
        <div class="sub" style="margin-top:2px;">${detalhe}</div>
        ${valorTotal > 0 ? `<div class="sub" style="margin-top:6px;">1ª parcela: <strong>${formatarReal(valorParcela1)}</strong> · 2ª parcela: <strong>${formatarReal(valorParcela2)}</strong></div>` : ""}
      `;
    }

    // Cláusula de honorários: fica preenchida automaticamente (mesmo texto que o PDF/Word
    // vai gerar) até a usuária começar a editar a caixa à mão — a partir daí, o texto dela
    // é que vale e para de ser sobrescrito pelas mudanças nos campos acima.
    const textareaClausula = document.getElementById("ct-clausula-honorarios");
    let clausulaEditadaManualmente = editando && !!(c.clausulaHonorariosTexto || "").trim();
    textareaClausula.value = clausulaEditadaManualmente
      ? c.clausulaHonorariosTexto
      : textoHonorariosPadrao({
          tipoCobranca: tipoInicial,
          percentualHonorarios: editando ? c.percentualHonorarios : PADRAO.percentualHonorarios,
          comissaoEstimada: editando ? c.comissaoEstimada || 0 : PADRAO.comissaoEstimada,
          valorFixo: editando ? c.valorFixo || 0 : PADRAO.valorFixo,
          valorPermuta: editando ? c.valorPermuta || 0 : PADRAO.valorPermuta,
          descricaoPermuta: editando ? c.descricaoPermuta || "" : "",
          parcelaInicialPct: editando ? c.parcelaInicialPct : PADRAO.parcelaInicialPct,
          parcelaFechamentoPct: editando ? c.parcelaFechamentoPct : PADRAO.parcelaFechamentoPct,
          valorTotal: calcularValorTotalAtual().valorTotal,
        });
    textareaClausula.addEventListener("input", () => { clausulaEditadaManualmente = true; });
    function atualizarClausulaPadrao() {
      if (clausulaEditadaManualmente) return;
      textareaClausula.value = textoHonorariosPadrao({
        tipoCobranca: document.querySelector('input[name="ct-tipo-cobranca"]:checked').value,
        percentualHonorarios: document.getElementById("ct-percentual").value,
        comissaoEstimada: document.getElementById("ct-comissao").value,
        valorFixo: document.getElementById("ct-valorfixo").value,
        valorPermuta: document.getElementById("ct-valorpermuta").value,
        descricaoPermuta: document.getElementById("ct-descricaopermuta").value,
        parcelaInicialPct: document.getElementById("ct-parcela1").value,
        parcelaFechamentoPct: document.getElementById("ct-parcela2").value,
        valorTotal: calcularValorTotalAtual().valorTotal,
      });
    }

    ["ct-percentual", "ct-comissao", "ct-valorfixo", "ct-valorpermuta", "ct-descricaopermuta", "ct-parcela1", "ct-parcela2"].forEach((id) => {
      document.getElementById(id).addEventListener("input", () => {
        atualizarPreviewValor();
        atualizarClausulaPadrao();
      });
    });
    inputValorFinal.addEventListener("input", atualizarPreviewValor);
    atualizarVisibilidadeCobranca();
    // Estado inicial dos dois blocos opcionais (comissão / valor final manual) — revela
    // o campo de valor já preenchido quando a caixinha vem marcada (editando um contrato
    // que já usava isso), sem mexer no valor guardado.
    if (checkComissao.checked) rowComissaoValor.style.display = "";
    if (checkValorFinal.checked) rowValorFinalInput.style.display = "";

    // Vencimento da 2ª parcela = vencimento da 1ª + 30 dias, recalculado sempre que a
    // 1ª mudar — a menos que a usuária já tenha editado a 2ª data a mão, aí respeitamos
    // a escolha dela e paramos de sobrescrever.
    const inputVencP1 = document.getElementById("ct-venc-p1");
    const inputVencP2 = document.getElementById("ct-venc-p2");
    let venc2EditadoManualmente = editando && !!c.dataVencimentoParcela2 && c.dataVencimentoParcela2 !== somarDias(c.dataVencimentoParcela1, 30);
    inputVencP2.addEventListener("input", () => { venc2EditadoManualmente = true; });
    inputVencP1.addEventListener("change", () => {
      if (venc2EditadoManualmente) return;
      inputVencP2.value = somarDias(inputVencP1.value, 30);
    });

    if (selectVaga) {
      const avisoEmpresa = document.getElementById("ct-aviso-empresa");
      selectVaga.addEventListener("change", () => {
        const vaga = vagas.find((v) => v.id === selectVaga.value);
        if (!vaga) {
          avisoEmpresa.classList.add("hidden");
          return;
        }
        const empresa = store.empresas.find((e) => e.id === vaga.empresaId);
        if (!empresa || !empresa.cnpj || !empresa.endereco) {
          avisoEmpresa.textContent = `Complete o CNPJ e o Endereço de "${empresa ? empresa.nome : "—"}" em Configurações > Empresas Clientes antes de gerar o contrato.`;
          avisoEmpresa.classList.remove("hidden");
        } else {
          avisoEmpresa.classList.add("hidden");
        }
        atualizarPreviewValor();
      });
    }

    document.getElementById("form-contrato").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const payload = {
        dataContrato: document.getElementById("ct-data").value,
        vigenciaDias: document.getElementById("ct-vigencia").value,
        tipoCobranca: document.querySelector('input[name="ct-tipo-cobranca"]:checked').value,
        percentualHonorarios: document.getElementById("ct-percentual").value,
        comissaoEstimada: document.getElementById("ct-comissao").value,
        valorTotalPersonalizado: document.getElementById("ct-valor-final").value,
        clausulaHonorariosTexto: document.getElementById("ct-clausula-honorarios").value.trim(),
        valorFixo: document.getElementById("ct-valorfixo").value,
        valorPermuta: document.getElementById("ct-valorpermuta").value,
        descricaoPermuta: document.getElementById("ct-descricaopermuta").value.trim(),
        prazoReposicaoDias: document.getElementById("ct-reposicao").value,
        parcelaInicialPct: document.getElementById("ct-parcela1").value,
        parcelaFechamentoPct: document.getElementById("ct-parcela2").value,
        dataVencimentoParcela1: document.getElementById("ct-venc-p1").value,
        dataVencimentoParcela2: document.getElementById("ct-venc-p2").value,
        prazoRescisaoAvisoDias: document.getElementById("ct-aviso").value,
        testemunha1: { nome: document.getElementById("ct-t1-nome").value.trim(), cpf: document.getElementById("ct-t1-cpf").value.trim() },
        testemunha2: { nome: document.getElementById("ct-t2-nome").value.trim(), cpf: document.getElementById("ct-t2-cpf").value.trim() },
      };
      if (!editando) payload.vagaId = selectVaga.value;

      try {
        const contrato = editando
          ? await api.patch(`/api/contratos/${contratoExistente.id}`, payload)
          : await api.post("/api/contratos", payload);
        showToast(`Contrato ${contrato.numero} ${editando ? "atualizado" : "gerado"}.`, "sucesso");
        fecharModal();
        await carregarLista();
        if (!editando) window.open(`/api/contratos/${contrato.id}/pdf`, "_blank");
      } catch (err) {
        const box = document.getElementById("contrato-form-erro");
        box.textContent = err.message;
        box.classList.remove("hidden");
      }
    });
  }
}
