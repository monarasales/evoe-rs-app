import { api } from "./api.js";
import { store, showToast, isGestor, podeGerenciarVagas, usaControlePonto } from "./state.js";
import { registrarRota, setRaiz, iniciarRouter, navegarPara } from "./router.js";
import { blocoDoDia } from "./horarioBlocos.js";
import { obterLocalizacao } from "./geo.js";
import { renderKanban } from "./views/kanban.js";
import { renderCandidatos } from "./views/candidatos.js";
import { renderDashboard } from "./views/dashboard.js";
import { renderConfiguracoes } from "./views/cadastros.js";
import { renderNotificacoes } from "./views/notificacoes.js";
import { renderContratos } from "./views/contratos.js";
import { renderCrm } from "./views/crm.js";
import { renderFinanceiro } from "./views/financeiro.js";
import { renderComissoes } from "./views/comissoes.js";
import { renderPonto } from "./views/ponto.js";
import { renderMeuCadastro } from "./views/meuCadastro.js";
import { renderEquipe } from "./views/equipe.js";
import { renderSolicitacoesVaga } from "./views/solicitacoesVaga.js";
import { renderDespesas } from "./views/despesas.js";
import { renderCultura } from "./views/cultura.js";
import { renderAcompanhamento } from "./views/acompanhamento.js";

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
// operacional (funil + candidatos); "Configurações" só tem os parâmetros de
// operação do sistema — a ficha da equipe fica em Colaborador > Equipe.
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
      // Pedidos recebidos pelo link público (public/solicitar-vaga.html) — visível a
      // quem gerencia o funil; só o Gestor aprova/rejeita (ver solicitacoesVaga.js).
      { href: "#/solicitacoes-vaga", label: "Solicitações de Vaga", icone: "📥", somenteGestorOuSupervisora: true, idBadge: "nav-badge-solicitacoes" },
    ],
  },
  {
    titulo: "Comercial",
    itens: [
      // CRM só para Gestor: dados de clientes/prospects não devem ficar abertos
      // para Recrutador/Supervisora editarem livremente.
      { href: "#/crm", label: "CRM", icone: "🤝", somenteGestor: true },
      { href: "#/financeiro", label: "Financeiro", icone: "💰", somenteGestor: true },
      { href: "#/acompanhamento", label: "Acompanhamento de Garantia", icone: "📋", somenteGestor: true },
    ],
  },
  {
    // Agrupa tudo que é "sobre a própria pessoa/equipe" num único lugar — o Ponto
    // de todo mundo (para quem gerencia) ou o próprio (para quem bate ponto), o
    // cadastro pessoal de cada um (incluindo o da Gestora), e a Comissão, que é um
    // ganho do colaborador por vaga fechada, não uma questão comercial.
    titulo: "Colaborador",
    itens: [
      { href: "#/ponto", label: "Controle de Ponto", icone: "🕒", somentePonto: true },
      { href: "#/comissoes", label: "Comissões", icone: "🏆", somenteGestorOuSupervisora: true },
      { href: "#/meu-cadastro", label: "Meu Cadastro", icone: "🪪" },
      // Ficha cadastro da equipe (era "Configurações > Funcionários") — mora aqui
      // porque é sobre as pessoas do time, não um parâmetro do sistema.
      { href: "#/equipe", label: "Equipe", icone: "🧑‍🤝‍🧑", somenteGestor: true },
    ],
  },
  {
    titulo: "Gestão Interna",
    itens: [
      { href: "#/despesas", label: "Despesas", icone: "💸", somenteGestor: true },
      { href: "#/cultura", label: "Cultura Organizacional", icone: "🌱", somenteGestor: true },
    ],
  },
  {
    titulo: "Administração",
    itens: [
      { href: "#/contratos", label: "Contratos", icone: "📝", somenteGestor: true },
      { href: "#/configuracoes", label: "Configurações", icone: "⚙️" },
    ],
  },
];

function montarNav() {
  mainNav.innerHTML = NAV_SECOES.map((secao) => {
    const itensVisiveis = secao.itens.filter(
      (l) =>
        (!l.somenteGestor || isGestor()) &&
        (!l.somenteGestorOuSupervisora || podeGerenciarVagas()) &&
        (!l.somentePonto || podeGerenciarVagas() || usaControlePonto())
    );
    if (itensVisiveis.length === 0) return "";
    return `
      ${secao.titulo ? `<div class="sidebar-nav-titulo">${secao.titulo}</div>` : ""}
      ${itensVisiveis
        .map(
          (l) =>
            `<a href="${l.href}"><span class="nav-icone">${l.icone}</span><span>${l.label}</span>${l.idBadge ? `<span id="${l.idBadge}" class="tag tag-atrasada hidden" style="margin-left:6px;">0</span>` : ""}</a>`
        )
        .join("")}
    `;
  }).join("");
}

// Quantas solicitações de vaga (link público) estão esperando revisão — mostra um
// contador na sidebar pra quem gerencia o funil não perder o pedido do cliente no
// meio da rotina. Só busca se a pessoa tem acesso à tela (Gestor/Supervisora).
async function atualizarBadgeSolicitacoes() {
  if (!podeGerenciarVagas()) return;
  const badge = document.getElementById("nav-badge-solicitacoes");
  if (!badge) return;
  try {
    const pendentes = await api.get("/api/solicitacoes-vaga?status=Pendente");
    if (pendentes.length > 0) {
      badge.textContent = pendentes.length > 99 ? "99+" : String(pendentes.length);
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  } catch (e) {
    /* silencioso: contador é um extra, não pode travar o uso do sistema */
  }
}

async function carregarCachesBasicos() {
  const [consultores, empresas, etapasVaga, etapasCandidato, motivosListaNegra] = await Promise.all([
    api.get("/api/consultores"),
    api.get("/api/empresas"),
    api.get("/api/vagas/etapas"),
    api.get("/api/candidatos/etapas"),
    api.get("/api/candidatos/motivos-lista-negra"),
  ]);
  store.consultores = consultores;
  store.empresas = empresas;
  store.etapasVaga = etapasVaga;
  store.etapasCandidato = etapasCandidato;
  store.motivosListaNegra = motivosListaNegra;
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

const btnPontoWidget = document.getElementById("btn-ponto-widget");
const pontoWidgetTexto = document.getElementById("ponto-widget-texto");

// Estado da próxima batida pendente, guardado pra o clique do botão saber o que
// fazer sem precisar refazer a conta. Some quando o dia está completo ou quando
// o Controle de Ponto não se aplica à pessoa.
let proximaBatidaWidget = null;

// Descobre qual é a PRÓXIMA batida do dia (mesma lógica usada em Controle de
// Ponto — ver views/ponto.js) só que aqui pro botão fixo da barra lateral, que
// fica visível em QUALQUER tela do sistema assim que a pessoa faz login — é
// esse o "botão de bater ponto" que precisa ser óbvio de primeira.
function calcularProximaBatida(hoje) {
  const meuRegistro = store.consultores.find((c) => c.id === store.usuario.id);
  const diaSemanaHoje = hoje ? hoje.diaSemana : new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(new Date());
  const blocoHoje = meuRegistro ? blocoDoDia(meuRegistro.horarioEsperado, diaSemanaHoje) : null;
  const temPausa = blocoHoje ? (Number(blocoHoje.pausaAlmocoMinutos) || 0) > 0 : false;
  if (!hoje) return { rotulo: "Bater Entrada", mensagemSucesso: "Entrada registrada." };
  if (hoje.horaSaida) return null; // dia completo
  if (temPausa && !hoje.pausaSaida) return { rotulo: "Sair p/ Almoço", mensagemSucesso: "Saída para o almoço registrada." };
  if (temPausa && hoje.pausaSaida && !hoje.pausaEntrada) return { rotulo: "Voltar do Almoço", mensagemSucesso: "Volta do almoço registrada." };
  return { rotulo: "Bater Saída", mensagemSucesso: "Saída registrada." };
}

function pintarBotaoPontoWidget() {
  btnPontoWidget.classList.remove("ponto-widget-pendente", "ponto-widget-completo");
  if (proximaBatidaWidget) {
    pontoWidgetTexto.textContent = `Bater Ponto — ${proximaBatidaWidget.rotulo}`;
    btnPontoWidget.classList.add("ponto-widget-pendente");
  } else {
    pontoWidgetTexto.textContent = "✓ Ponto de hoje completo";
    btnPontoWidget.classList.add("ponto-widget-completo");
  }
}

// Controle de Ponto: o botão da sidebar é o próprio relógio de ponto — um clique
// já registra a batida (entrada, pausa ou saída, o que for a vez), com feedback
// visual de cor pra deixar claro que funcionou. Fica visível em todas as telas,
// não só em Controle de Ponto, pra ninguém "perder" o botão.
btnPontoWidget.addEventListener("click", async () => {
  if (!proximaBatidaWidget) {
    navegarPara("#/ponto");
    return;
  }
  const acaoAtual = proximaBatidaWidget;
  btnPontoWidget.disabled = true;
  pontoWidgetTexto.textContent = "Registrando...";
  try {
    const localizacao = await obterLocalizacao();
    await api.post("/api/ponto/bater", localizacao || {});
    btnPontoWidget.classList.remove("ponto-widget-pendente");
    btnPontoWidget.classList.add("ponto-widget-sucesso");
    pontoWidgetTexto.textContent = "✓ Registrado!";
    showToast(acaoAtual.mensagemSucesso, "sucesso");
    setTimeout(async () => {
      btnPontoWidget.classList.remove("ponto-widget-sucesso");
      btnPontoWidget.disabled = false;
      await inicializarPontoDoDia();
    }, 900);
  } catch (err) {
    showToast(err.message, "erro");
    btnPontoWidget.disabled = false;
    pintarBotaoPontoWidget();
  }
});

async function inicializarPontoDoDia() {
  if (!usaControlePonto()) {
    btnPontoWidget.classList.add("hidden");
    return;
  }
  btnPontoWidget.classList.remove("hidden");
  try {
    const hoje = await api.get("/api/ponto/hoje");
    proximaBatidaWidget = calcularProximaBatida(hoje);
    pintarBotaoPontoWidget();
  } catch (e) {
    /* silencioso: ponto é um extra, não pode travar o login por falha aqui */
  }
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
  atualizarBadgeSolicitacoes();
  inicializarPontoDoDia();
  navegarPara("#/dashboard");
  iniciarRouter();
  setInterval(atualizarBadgeNotificacoes, 30000);
  setInterval(atualizarBadgeSolicitacoes, 30000);
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
  registrarRota("/acompanhamento", renderAcompanhamento);
  registrarRota("/comissoes", renderComissoes);
  registrarRota("/ponto", renderPonto);
  registrarRota("/meu-cadastro", renderMeuCadastro);
  registrarRota("/equipe", renderEquipe);
  registrarRota("/solicitacoes-vaga", renderSolicitacoesVaga);
  registrarRota("/despesas", renderDespesas);
  registrarRota("/cultura", renderCultura);
}

async function init() {
  setRaiz(document.getElementById("view-root"));
  registrarRotas();

  const logado = await tentarSessaoExistente();
  if (logado) {
    await carregarCachesBasicos();
    mostrarApp();
    atualizarBadgeNotificacoes();
    atualizarBadgeSolicitacoes();
    inicializarPontoDoDia();
    iniciarRouter();
    setInterval(atualizarBadgeNotificacoes, 30000);
    setInterval(atualizarBadgeSolicitacoes, 30000);
  } else {
    mostrarLogin();
  }
}

// pequenas exportações usadas por outras views (evita import circular do state)
window.__evoe = { showToast, atualizarBadgeNotificacoes };

init();
