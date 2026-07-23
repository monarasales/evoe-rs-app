// Estado global simples (sem framework): guarda o usuário logado e caches
// pequenos (consultores, empresas) usados em vários formulários da SPA.

export const store = {
  usuario: null,
  consultores: [],
  empresas: [],
  etapasVaga: [],
  etapasCandidato: [],
};

export function isGestor() {
  return store.usuario && store.usuario.perfil === "Gestor";
}

export function showToast(mensagem, tipo = "") {
  const toast = document.getElementById("toast");
  toast.textContent = mensagem;
  toast.className = "toast" + (tipo ? " " + tipo : "");
  toast.classList.remove("hidden");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.add("hidden"), 3200);
}

export function formatarData(iso) {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function nomeConsultor(id) {
  const c = store.consultores.find((x) => x.id === id);
  return c ? c.nome : "—";
}

export function nomeEmpresa(id) {
  const e = store.empresas.find((x) => x.id === id);
  return e ? e.nome : "—";
}
