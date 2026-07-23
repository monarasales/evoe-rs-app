import { api } from "../api.js";
import { store, isGestor, showToast, formatarData } from "../state.js";
import { abrirModal, fecharModal } from "../modal.js";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

const PADRAO = {
  percentualHonorarios: 90,
  parcelaInicialPct: 50,
  parcelaFechamentoPct: 50,
  prazoReposicaoDias: 60,
  vigenciaDias: 90,
  prazoRescisaoAvisoDias: 30,
};

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
          <tr><th>Nº</th><th>Cliente</th><th>Vaga</th><th>Data</th><th>Status</th><th></th></tr>
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
              <td><span class="tag ${c.status === "Gerado" ? "tag-nprazo" : "tag-standby"}">${escapeHtml(c.status)}</span></td>
              <td class="acoes-contrato">
                <button class="btn btn-outline btn-sm btn-pdf" title="Baixar PDF">📄 PDF</button>
                <button class="btn btn-outline btn-sm btn-email" title="Enviar por e-mail">✉️ E-mail</button>
                <button class="btn btn-outline btn-sm btn-whats" title="Enviar por WhatsApp">💬 WhatsApp</button>
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

  async function abrirFormularioContrato() {
    const vagas = await api.get("/api/vagas");
    const vagasOrdenadas = [...vagas].sort((a, b) => (a.dataAbertura < b.dataAbertura ? 1 : -1));

    abrirModal(`
      <h2>Novo Contrato</h2>
      <form id="form-contrato">
        <div class="form-row">
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
        <div id="ct-aviso-empresa" class="form-erro hidden" style="margin-top:-6px;"></div>

        <div class="form-cols">
          <div class="form-row"><label>Data do contrato</label><input type="date" id="ct-data" value="${new Date().toISOString().slice(0, 10)}" /></div>
          <div class="form-row"><label>Vigência (dias)</label><input type="number" id="ct-vigencia" min="1" value="${PADRAO.vigenciaDias}" /></div>
        </div>

        <div class="section-title" style="margin-top:6px;">Honorários</div>
        <div class="form-cols">
          <div class="form-row"><label>Percentual sobre o salário (%)</label><input type="number" id="ct-percentual" min="1" max="200" value="${PADRAO.percentualHonorarios}" /></div>
          <div class="form-row"><label>Prazo de reposição (dias)</label><input type="number" id="ct-reposicao" min="1" value="${PADRAO.prazoReposicaoDias}" /></div>
        </div>
        <div class="form-cols">
          <div class="form-row"><label>1ª parcela — início do serviço (%)</label><input type="number" id="ct-parcela1" min="0" max="100" value="${PADRAO.parcelaInicialPct}" /></div>
          <div class="form-row"><label>2ª parcela — fechamento da vaga (%)</label><input type="number" id="ct-parcela2" min="0" max="100" value="${PADRAO.parcelaFechamentoPct}" /></div>
        </div>
        <div class="form-row"><label>Aviso prévio para rescisão sem multa (dias)</label><input type="number" id="ct-aviso" min="1" value="${PADRAO.prazoRescisaoAvisoDias}" /></div>

        <div class="section-title" style="margin-top:6px;">Testemunhas</div>
        <div class="form-cols">
          <div class="form-row"><label>Testemunha 1 — Nome</label><input type="text" id="ct-t1-nome" /></div>
          <div class="form-row"><label>Testemunha 1 — CPF</label><input type="text" id="ct-t1-cpf" /></div>
        </div>
        <div class="form-cols">
          <div class="form-row"><label>Testemunha 2 — Nome</label><input type="text" id="ct-t2-nome" /></div>
          <div class="form-row"><label>Testemunha 2 — CPF</label><input type="text" id="ct-t2-cpf" /></div>
        </div>
        <div class="sub">Pode deixar em branco e preencher à mão na hora da assinatura, se preferir.</div>

        <div id="contrato-form-erro" class="form-erro hidden" style="margin-top:10px;"></div>
        <div class="modal-close-row">
          <button type="button" id="btn-cancelar-ct" class="btn btn-outline">Fechar</button>
          <button type="submit" class="btn btn-primary">Gerar contrato</button>
        </div>
      </form>
    `);

    document.getElementById("btn-cancelar-ct").addEventListener("click", fecharModal);

    const selectVaga = document.getElementById("ct-vaga");
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
    });

    document.getElementById("form-contrato").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const payload = {
        vagaId: selectVaga.value,
        dataContrato: document.getElementById("ct-data").value,
        vigenciaDias: document.getElementById("ct-vigencia").value,
        percentualHonorarios: document.getElementById("ct-percentual").value,
        prazoReposicaoDias: document.getElementById("ct-reposicao").value,
        parcelaInicialPct: document.getElementById("ct-parcela1").value,
        parcelaFechamentoPct: document.getElementById("ct-parcela2").value,
        prazoRescisaoAvisoDias: document.getElementById("ct-aviso").value,
        testemunha1: { nome: document.getElementById("ct-t1-nome").value.trim(), cpf: document.getElementById("ct-t1-cpf").value.trim() },
        testemunha2: { nome: document.getElementById("ct-t2-nome").value.trim(), cpf: document.getElementById("ct-t2-cpf").value.trim() },
      };
      try {
        const contrato = await api.post("/api/contratos", payload);
        showToast(`Contrato ${contrato.numero} gerado.`, "sucesso");
        fecharModal();
        await carregarLista();
        window.open(`/api/contratos/${contrato.id}/pdf`, "_blank");
      } catch (err) {
        const box = document.getElementById("contrato-form-erro");
        box.textContent = err.message;
        box.classList.remove("hidden");
      }
    });
  }
}
