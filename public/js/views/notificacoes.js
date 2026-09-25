import { api } from "../api.js";
import { formatarData } from "../state.js";

export async function renderNotificacoes(root) {
  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Central de Notificações</h2>
        <div class="sub">Alertas de vagas atribuídas, prazos e aprovações.</div>
      </div>
      <button id="btn-marcar-lidas" class="btn btn-outline btn-sm">Marcar todas como lidas</button>
    </div>
    <div id="notif-list" class="notif-list"></div>
  `;

  async function carregar() {
    const notificacoes = await api.get("/api/notificacoes");
    const el = root.querySelector("#notif-list");
    if (notificacoes.length === 0) {
      el.innerHTML = '<div class="empty-state">Você ainda não tem notificações.</div>';
      return;
    }
    el.innerHTML = notificacoes
      .map(
        (n) => `
      <div class="notif-item ${n.lida ? "lida" : ""}" data-id="${n.id}">
        <div>
          <div class="notif-tipo">${n.tipo}</div>
          <div class="notif-assunto">${n.assunto}</div>
          <div class="notif-msg">${n.mensagem || ""}</div>
        </div>
        <div class="notif-data">${formatarData(n.dataEnvio)}${n.lida ? "" : ' <button class="link-btn btn-marcar-uma">marcar lida</button>'}</div>
      </div>`
      )
      .join("");

    el.querySelectorAll(".btn-marcar-uma").forEach((btn) =>
      btn.addEventListener("click", async (e) => {
        const id = e.target.closest(".notif-item").dataset.id;
        await api.patch(`/api/notificacoes/${id}/lida`, {});
        carregar();
        window.__evoe.atualizarBadgeNotificacoes();
      })
    );
  }

  root.querySelector("#btn-marcar-lidas").addEventListener("click", async () => {
    await api.post("/api/notificacoes/marcar-todas-lidas", {});
    carregar();
    window.__evoe.atualizarBadgeNotificacoes();
  });

  await carregar();
}
