import { api } from "./api.js";
import { store, showToast, isGestor } from "./state.js";
import { registrarRota, setRaiz, iniciarRouter, navegarPara } from "./router.js";
import { renderKanban } from "./views/kanban.js";
import { renderCandidatos } from "./views/candidatos.js";
import { renderDashboard } from "./views/dashboard.js";
import { renderConfiguracoes } from "./views/cadastros.js";
import { renderNotificacoes } from "./views/notificacoes.js";
import { renderContratos } from "./views/contratos.js";
import { renderCrm } from "./views/crm.js";
import { renderFinanceiro } from "./views/financeiro.js";
import { renderComissoes } from "./views/comissoes.js";

const loginScreen = document.getElementById("login-screen");
const mainScreen = document.getElementById("main-screen");
const loginForm = document.getElementById("login-form");
const loginErro = document.getElementById("login-erro");
const mainNav = document.getElementById("main-nav");
const userNome = document.getElementById("user-nome");
const userPerfil = document.getElementById("user-perfil");
const btnLogout = document.getElementById("btn-logout");
const btnNotificacoes = document.getElementById("btn-notificacoes");
const notifBadge = document.getElementById("notif-badge");

// Estrutura de navegação da sidebar. "Recrutamento & Seleção" é o núcleo
// operacional (funil + candidatos); "Configurações" reúne tudo que é
// cadastro/ajuste (empresas, equipe, e futuramente parâmetros do sistema).
const NAV_SECOES = [
  {
    titulo: null,
    itens: [{ href: "#/dashboard", label: "Dashboard", icone: "📊" }],
  },
  {
    titulo: "Recrutamento & Seleção",
    itens: [
      { href: "#/kanban", label: "Funil de Vagas", icone: "🧭" },
      { href: "#/candidatos", label: "Candidatos", icone: "👥" },
    ],
  },
  {
    titulo: "Comercial",
    itens: [
      { href: "#/crm", label: "CRM", icone: "🤝" },
      { href: "#/financeiro", label: "Financeiro", icone: "💰", somenteGestor: true },
      { href: "#/comissoes", label: "Comissões", icone: "🏆", somenteGestor: true },
    ],
  },
  {
    titulo: "Administração",
    itens: [
      { href: "#/contratos", label: "Contratos", icone: "📝" },
      { href: "#/configuracoes", label: "Configurações", icone: "⚙️" },
    ],
  },
];

function montarNav() {
  mainNav.innerHTML = NAV_SECOES.map((secao) => {
    const itensVisiveis = secao.itens.filter((l) => !l.somenteGestor || isGestor());
    if (itensVisiveis.length === 0) return "";
    return `
      ${secao.titulo ? `<div class="sidebar-nav-titulo">${secao.titulo}</div>` : ""}
      ${itensVisiveis
        .map((l) => `<a href="${l.href}"><span class="nav-icone">${l.icone}</span><span>${l.label}</span></a>`)
        .join("")}
    `;
  }).join("");
}

async function carregarCachesBasicos() {
  const [consultores, empresas, etapasVaga, etapasCandidato] = await Promise.all([
    api.get("/api/consultores"),
    api.get("/api/empresas"),
    api.get("/api/vagas/etapas"),
    api.get("/api/candidatos/etapas"),
  ]);
  store.consultores = consultores;
  store.empresas = empresas;
  store.etapasVaga = etapasVaga;
  store.etapasCandidato = etapasCandidato;
}

async function atualizarBadgeNotificacoes() {
  try {
    const { total } = await api.get("/api/notificacoes/nao-lidas/contagem");
    if (total > 0) {
      notifBadge.textContent = total > 99 ? "99+" : String(total);
      notifBadge.classList.remove("hidden");
    } else {
      notifBadge.classList.add("hidden");
    }
  } catch (e) {
    /* silencioso: não interrompe o uso do app por falha de contagem */
  }
}

function mostrarApp() {
  loginScreen.classList.add("hidden");
  mainScreen.classList.remove("hidden");
  userNome.textContent = store.usuario.nome;
  userPerfil.textContent = store.usuario.perfil;
  montarNav();
}

function mostrarLogin() {
  mainScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");
}

async function tentarSessaoExistente() {
  try {
    const usuario = await api.get("/api/auth/me");
    store.usuario = usuario;
    return true;
  } catch (e) {
    return false;
  }
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginErro.classList.add("hidden");
  const username = document.getElementById("login-username").value.trim();
  const senha = document.getElementById("login-senha").value;
  try {
    const usuario = await api.post("/api/auth/login", { username, senha });
    store.usuario = usuario;
    await bootAposLogin();
  } catch (err) {
    loginErro.textContent = err.message;
    loginErro.classList.remove("hidden");
  }
});

async function bootAposLogin() {
  await carregarCachesBasicos();
  mostrarApp();
  atualizarBadgeNotificacoes();
  navegarPara("#/dashboard");
  iniciarRouter();
  setInterval(atualizarBadgeNotificacoes, 30000);
}

btnLogout.addEventListener("click", async () => {
  await api.post("/api/auth/logout");
  location.reload();
});

btnNotificacoes.addEventListener("click", () => {
  navegarPara("#/notificacoes");
});

function registrarRotas() {
  registrarRota("/dashboard", renderDashboard);
  registrarRota("/kanban", renderKanban);
  registrarRota("/candidatos", renderCandidatos);
  registrarRota("/candidatos/:vagaId", renderCandidatos);
  registrarRota("/configuracoes", renderConfiguracoes);
  registrarRota("/notificacoes", renderNotificacoes);
  registrarRota("/contratos", renderContratos);
  registrarRota("/crm", renderCrm);
  registrarRota("/financeiro", renderFinanceiro);
  registrarRota("/comissoes", renderComissoes);
}

async function init() {
  setRaiz(document.getElementById("view-root"));
  registrarRotas();

  const logado = await tentarSessaoExistente();
  if (logado) {
    await carregarCachesBasicos();
    mostrarApp();
    atualizarBadgeNotificacoes();
    iniciarRouter();
    setInterval(atualizarBadgeNotificacoes, 30000);
  } else {
    mostrarLogin();
  }
}

// pequenas exportações usadas por outras views (evita import circular do state)
window.__evoe = { showToast, atualizarBadgeNotificacoes };

init();
