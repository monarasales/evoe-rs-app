// Autoatendimento: qualquer consultor logado (inclusive a Gestora) pode manter os
// PRÓPRIOS dados de contato, endereços e dados bancários/PIX em dia por aqui, sem
// depender de alguém com perfil Gestor mexer no cadastro por ela/ele — importante
// sobretudo para o Controle de Ponto, que usa os dois endereços pra saber de onde a
// batida veio, e para o pagamento de salário/comissão, que usa os dados bancários/PIX.
import { api } from "../api.js";
import { store, showToast, usaControlePonto } from "../state.js";
import { campoEnderecoHtml, aplicarBuscaCep, montarEnderecoDosCampos } from "../enderecoCampo.js";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

export async function renderMeuCadastro(root) {
  root.innerHTML = '<div class="empty-state">Carregando...</div>';

  // store.consultores já vem carregado no boot (GET /api/consultores, aberto a
  // qualquer logado) — usamos pra achar o próprio registro completo, já que
  // /api/auth/me só devolve o essencial (nome, perfil, e-mail).
  const consultores = await api.get("/api/consultores");
  const eu = consultores.find((c) => c.id === store.usuario.id);
  if (!eu) {
    root.innerHTML = '<div class="empty-state">Não encontramos seu cadastro. Fale com o Gestor.</div>';
    return;
  }

  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Meu Cadastro</h2>
        <div class="sub">Seus dados de contato, endereços e dados bancários/PIX — usados pelo Controle de Ponto e para pagamento de salário/comissão.</div>
      </div>
    </div>
    <div class="card" style="max-width:560px;">
      <div class="form-row"><label>Nome</label><input type="text" value="${escapeHtml(eu.nome)}" disabled /></div>
      <div class="form-cols">
        <div class="form-row"><label>E-mail</label><input type="email" value="${escapeHtml(eu.email)}" disabled /></div>
        <div class="form-row"><label>Perfil</label><input type="text" value="${escapeHtml(eu.perfil)}" disabled /></div>
      </div>
      <div class="sub" style="margin:-4px 0 14px;">Nome, e-mail e perfil só o Gestor pode alterar (Colaborador &gt; Equipe).</div>

      <form id="form-meu-cadastro">
        <div class="form-row"><label>Telefone / WhatsApp</label><input type="text" id="mc-whatsapp" value="${escapeHtml(eu.whatsapp || "")}" /></div>
        ${campoEnderecoHtml("mc-end", "Endereço Residencial", eu.endereco)}
        ${campoEnderecoHtml("mc-endt", "Endereço de Trabalho", eu.enderecoTrabalho)}
        ${
          usaControlePonto()
            ? '<div class="sub" style="margin-top:-6px; margin-bottom:10px;">Preencha os dois — em dias de home office ou no escritório, o sistema identifica sozinho qual dos dois bateu mais perto.</div>'
            : ""
        }

        <h3 class="section-title" style="margin-top:10px;">Dados Bancários / PIX</h3>
        <div class="sub" style="margin-top:-6px; margin-bottom:8px;">Usados para pagamento de salário/comissão — só o Gestor vê essa informação.</div>
        <div class="form-cols">
          <div class="form-row"><label>Banco</label><input type="text" id="mc-banco" placeholder="ex: Nubank, Banco do Brasil" value="${escapeHtml(eu.banco || "")}" /></div>
          <div class="form-row"><label>Agência</label><input type="text" id="mc-agencia" value="${escapeHtml(eu.agencia || "")}" /></div>
        </div>
        <div class="form-cols">
          <div class="form-row"><label>Conta (com dígito)</label><input type="text" id="mc-conta" value="${escapeHtml(eu.conta || "")}" /></div>
          <div class="form-row"><label>Chave PIX</label><input type="text" id="mc-pix" placeholder="CPF, e-mail, telefone ou aleatória" value="${escapeHtml(eu.chavePix || "")}" /></div>
        </div>

        <div id="meu-cadastro-erro" class="form-erro hidden"></div>
        <button type="submit" class="btn btn-primary">Salvar</button>
      </form>
    </div>
  `;

  aplicarBuscaCep("mc-end");
  aplicarBuscaCep("mc-endt");

  document.getElementById("form-meu-cadastro").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const erroEl = document.getElementById("meu-cadastro-erro");
    erroEl.classList.add("hidden");

    const { endereco, erro: erroEndereco } = montarEnderecoDosCampos("mc-end", eu.endereco, "Endereço Residencial");
    if (erroEndereco) {
      erroEl.textContent = erroEndereco;
      erroEl.classList.remove("hidden");
      return;
    }
    const { endereco: enderecoTrabalho, erro: erroEnderecoTrabalho } = montarEnderecoDosCampos(
      "mc-endt",
      eu.enderecoTrabalho,
      "Endereço de Trabalho"
    );
    if (erroEnderecoTrabalho) {
      erroEl.textContent = erroEnderecoTrabalho;
      erroEl.classList.remove("hidden");
      return;
    }

    const payload = {
      whatsapp: document.getElementById("mc-whatsapp").value.trim(),
      endereco,
      enderecoTrabalho,
      banco: document.getElementById("mc-banco").value.trim(),
      agencia: document.getElementById("mc-agencia").value.trim(),
      conta: document.getElementById("mc-conta").value.trim(),
      chavePix: document.getElementById("mc-pix").value.trim(),
    };
    try {
      const atualizado = await api.patch("/api/consultores/me", payload);
      const enderecoSemGeo = payload.endereco && !atualizado.enderecoLat;
      const enderecoTrabalhoSemGeo = payload.enderecoTrabalho && !atualizado.enderecoTrabalhoLat;
      if (usaControlePonto() && (enderecoSemGeo || enderecoTrabalhoSemGeo)) {
        showToast("Dados salvos, mas não conseguimos localizar automaticamente um dos endereços — tente deixá-lo mais completo (bairro, cidade).", "erro");
      } else {
        showToast("Dados salvos.", "sucesso");
      }
    } catch (err) {
      erroEl.textContent = err.message;
      erroEl.classList.remove("hidden");
    }
  });
}
