// Campo de escolha com busca ("combobox"): mostra as opções em ordem alfabética e,
// a cada letra digitada, abre as que COMEÇAM com o texto (empresa ou vaga) e, a partir
// de 3 letras, também as que apenas contêm o texto. Funciona com teclado (↑ ↓ Enter Esc) e toque.
//
// uso: const cb = criarCombobox(elementoContainer, { opcoes, valor, placeholder, aoEscolher, opcaoVazia })
//   opcoes: [{ valor, rotulo, detalhe?, termos?: [strings pesquisáveis], apagada?: bool }]

const normalizar = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

function escapar(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}

export function criarCombobox(container, { opcoes, valor = "", placeholder = "Digite para buscar...", aoEscolher = () => {}, opcaoVazia = null }) {
  const lista = [...opcoes].sort((a, b) => normalizar(a.rotulo).localeCompare(normalizar(b.rotulo), "pt-BR"));
  if (opcaoVazia) lista.unshift({ valor: "", rotulo: opcaoVazia, fixa: true });
  let atual = lista.find((o) => o.valor === valor) || (opcaoVazia ? lista[0] : null);
  let destaque = 0;
  let visiveis = [];

  container.classList.add("combo");
  container.innerHTML = `
    <input type="text" class="combo-input" autocomplete="off" spellcheck="false" placeholder="${escapar(placeholder)}" />
    <button type="button" class="combo-seta" tabindex="-1" aria-label="Abrir lista">▾</button>
    <div class="combo-lista hidden" role="listbox"></div>
  `;
  const input = container.querySelector(".combo-input");
  const painel = container.querySelector(".combo-lista");
  const mostrarAtual = () => (input.value = atual && !atual.fixa ? atual.rotulo : "");
  mostrarAtual();

  function filtrar(texto) {
    const q = normalizar(texto);
    if (!q) return lista;
    const termosDe = (o) => [o.rotulo, ...(o.termos || [])].map(normalizar);
    const comeca = [];
    const contem = [];
    for (const o of lista) {
      if (o.fixa) continue;
      const termos = termosDe(o);
      // "começa com": o texto inteiro ou qualquer palavra (empresa, cargo...)
      if (termos.some((t) => t.startsWith(q) || t.split(/[\s—–\-/·]+/).some((p) => p.startsWith(q)))) comeca.push(o);
      else if (termos.some((t) => t.includes(q))) contem.push(o);
    }
    // Com 1–2 letras, só o que COMEÇA com elas (evita "ruído"); a partir de 3, também o que contém.
    return q.length < 3 ? comeca : [...comeca, ...contem];
  }

  function desenhar() {
    painel.innerHTML = visiveis.length
      ? visiveis
          .map(
            (o, i) => `<div class="combo-opcao ${i === destaque ? "ativa" : ""} ${o.apagada ? "apagada" : ""}" data-i="${i}" role="option">
              <div>${escapar(o.rotulo)}</div>${o.detalhe ? `<div class="combo-detalhe">${escapar(o.detalhe)}</div>` : ""}
            </div>`
          )
          .join("")
      : '<div class="combo-vazio">Nada encontrado.</div>';
    const ativa = painel.querySelector(".combo-opcao.ativa");
    if (ativa) ativa.scrollIntoView({ block: "nearest" });
  }

  function abrir(texto = "") {
    visiveis = filtrar(texto);
    destaque = 0;
    painel.classList.remove("hidden");
    desenhar();
  }
  function fechar() {
    painel.classList.add("hidden");
    mostrarAtual();
  }
  function escolher(o) {
    atual = o;
    fechar();
    aoEscolher(o.valor, o);
  }

  input.addEventListener("focus", () => {
    input.select();
    abrir("");
  });
  input.addEventListener("input", () => abrir(input.value));
  input.addEventListener("keydown", (e) => {
    if (painel.classList.contains("hidden") && ["ArrowDown", "ArrowUp"].includes(e.key)) abrir(input.value);
    if (e.key === "ArrowDown") {
      destaque = Math.min(destaque + 1, visiveis.length - 1);
      desenhar();
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      destaque = Math.max(destaque - 1, 0);
      desenhar();
      e.preventDefault();
    } else if (e.key === "Enter") {
      if (!painel.classList.contains("hidden") && visiveis[destaque]) {
        escolher(visiveis[destaque]);
        e.preventDefault();
      }
    } else if (e.key === "Escape") {
      fechar();
      input.blur();
    }
  });
  // mousedown (e não click) para escolher antes do blur fechar a lista
  painel.addEventListener("mousedown", (e) => {
    const el = e.target.closest(".combo-opcao");
    if (!el) return;
    e.preventDefault();
    escolher(visiveis[Number(el.dataset.i)]);
  });
  container.querySelector(".combo-seta").addEventListener("mousedown", (e) => {
    e.preventDefault();
    if (painel.classList.contains("hidden")) {
      input.focus();
    } else fechar();
  });
  input.addEventListener("blur", () => setTimeout(fechar, 120));

  return {
    get valor() {
      return atual ? atual.valor : "";
    },
    definir(v) {
      atual = lista.find((o) => o.valor === v) || atual;
      mostrarAtual();
    },
    focar: () => input.focus(),
  };
}
