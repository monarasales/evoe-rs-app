// Roteador simples baseado em hash (#/rota), sem nenhuma biblioteca.

const rotas = [];
let raiz = null;

export function registrarRota(path, handler) {
  rotas.push({ path, handler });
}

export function setRaiz(el) {
  raiz = el;
}

function combinar(path, hash) {
  const partesPath = path.split("/").filter(Boolean);
  const partesHash = hash.split("/").filter(Boolean);
  if (partesPath.length !== partesHash.length) return null;
  const params = {};
  for (let i = 0; i < partesPath.length; i++) {
    if (partesPath[i].startsWith(":")) {
      params[partesPath[i].slice(1)] = decodeURIComponent(partesHash[i]);
    } else if (partesPath[i] !== partesHash[i]) {
      return null;
    }
  }
  return params;
}

async function resolver() {
  const hash = (location.hash || "#/dashboard").slice(1) || "/";
  for (const rota of rotas) {
    const params = combinar(rota.path, hash);
    if (params) {
      atualizarNavAtiva(hash);
      raiz.innerHTML = "";
      await rota.handler(raiz, params);
      return;
    }
  }
  raiz.innerHTML = '<div class="empty-state">Página não encontrada.</div>';
}

function atualizarNavAtiva(hash) {
  document.querySelectorAll("#main-nav a").forEach((a) => {
    const alvo = a.getAttribute("href").slice(1);
    a.classList.toggle("active", hash.split("/")[1] === alvo.split("/")[1]);
  });
}

export function iniciarRouter() {
  window.addEventListener("hashchange", resolver);
  resolver();
}

export function navegarPara(hash) {
  location.hash = hash;
}
