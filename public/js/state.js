// Estado global simples (sem framework): guarda o usuário logado e caches
// pequenos (consultores, empresas) usados em vários formulários da SPA.

export const store = {
  usuario: null,
  consultores: [],
  empresas: [],
  etapasVaga: [],
  etapasCandidato: [],
  motivosListaNegra: [],
};

export function isGestor() {
  return store.usuario && store.usuario.perfil === "Gestor";
}

// Supervisora tem o mesmo acesso do Gestor ao Funil de Vagas e ao Dashboard (visão de
// todos os consultores), mas não a Contratos nem a Configurações — essas continuam
// restritas a isGestor().
export function podeGerenciarVagas() {
  return store.usuario && (store.usuario.perfil === "Gestor" || store.usuario.perfil === "Supervisora");
}

// Controle de Ponto: hoje só se aplica a quem tem tipoVinculo "Estágio" (o campo
// vem junto no login/`/api/auth/me`, ver server/routes/auth.js).
export function ehEstagiario() {
  return !!(store.usuario && store.usuario.tipoVinculo === "Estágio");
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
