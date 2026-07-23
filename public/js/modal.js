const backdrop = document.getElementById("modal-backdrop");
const content = document.getElementById("modal-content");

export function abrirModal(html) {
  content.innerHTML = html;
  backdrop.classList.remove("hidden");
}

export function fecharModal() {
  backdrop.classList.add("hidden");
  content.innerHTML = "";
}

backdrop.addEventListener("click", (e) => {
  if (e.target === backdrop) fecharModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") fecharModal();
});
