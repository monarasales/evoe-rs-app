// Autoatendimento: qualquer consultor logado (inclusive a Gestora) pode manter os
// PRÓPRIOS dados de contato e os dois endereços em dia por aqui, sem depender de
// alguém com perfil Gestor mexer no cadastro por ela/ele — importante sobretudo para
// o Controle de Ponto, que usa esses dois endereços pra saber de onde a batida veio.
import { api } from "../api.js";
import { store, showToast, usaControlePonto } from "../state.js";

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
        <div class="sub">Seus dados de contato e endereços — usados também pelo Controle de Ponto para saber de onde você bateu o ponto.</div>
      </div>
    </div>
    <div class="card" style="max-width:560px;">
      <div class="form-row"><label>Nome</label><input type="text" value="${escapeHtml(eu.nome)}" disabled /></div>
      <div class="form-cols">
        <div class="form-row"><label>E-mail</label><input type="email" value="${escapeHtml(eu.email)}" disabled /></div>
        <div class="form-row"><label>Perfil</label><input type="text" value="${escapeHtml(eu.perfil)}" disabled /></div>
      </div>
      <div class="sub" style="margin:-4px 0 14px;">Nome, e-mail e perfil só o Gestor pode alterar (Configurações &gt; Funcionários).</div>

      <form id="form-meu-cadastro">
        <div class="form-row"><label>Telefone / WhatsApp</label><input type="text" id="mc-whatsapp" value="${escapeHtml(eu.whatsapp || "")}" /></div>
        <div class="form-row"><label>Endereço Residencial</label><input type="text" id="mc-endereco" placeholder="Rua, número, bairro, cidade/UF" value="${escapeHtml(eu.endereco || "")}" /></div>
        <div class="form-row"><label>Endereço de Trabalho</label><input type="text" id="mc-endereco-trabalho" placeholder="Rua, número, bairro, cidade/UF" value="${escapeHtml(eu.enderecoTrabalho || "")}" /></div>
        ${
          usaControlePonto()
            ? '<div class="sub" style="margin-top:-6px; margin-bottom:10px;">Preencha os dois — em dias de home office ou no escritório, o sistema identifica sozinho qual dos dois bateu mais perto.</div>'
            : ""
        }
        <div id="meu-cadastro-erro" class="form-erro hidden"></div>
        <button type="submit" class="btn btn-primary">Salvar</button>
      </form>
    </div>
  `;

  document.getElementById("form-meu-cadastro").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const payload = {
      whatsapp: document.getElementById("mc-whatsapp").value.trim(),
      endereco: document.getElementById("mc-endereco").value.trim(),
      enderecoTrabalho: document.getElementById("mc-endereco-trabalho").value.trim(),
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
      const box = document.getElementById("meu-cadastro-erro");
      box.textContent = err.message;
      box.classList.remove("hidden");
    }
  });
}
