// Editor da "Página da vaga" — o conteúdo completo que o candidato vê no link da vaga.
// Tudo nesta tela é público. Salva em vaga.pagina (PUT /api/vagas/:id/pagina).

import { api } from "../api.js";
import { showToast } from "../state.js";
import { abrirModal, fecharModal } from "../modal.js";
import { termosSensiveis } from "../mensagemVaga.js";

const esc = (s) => {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
};

const BENEFICIOS_SUGERIDOS = [
  "Vale-transporte",
  "Vale-refeição",
  "Vale-alimentação",
  "Plano de saúde",
  "Plano odontológico",
  "Seguro de vida",
  "Day off no aniversário",
  "Comissão",
  "Bônus por resultado",
  "Auxílio home office",
  "Gympass / Wellhub",
  "Bolsa-auxílio",
];

/** Quantas seções da página estão preenchidas (para o indicador no cadastro da vaga). */
export function progressoPagina(p) {
  if (!p) return { feitas: 0, total: 10 };
  const itens = [
    p.missao,
    (p.objetivos || []).length,
    (p.responsabilidades || []).length,
    (p.requisitos || []).length,
    p.perfilComportamental,
    p.salario,
    (p.beneficios || []).length,
    p.horario,
    p.bairro || p.cidade,
    p.tipoContratacao || p.modeloTrabalho,
  ];
  return { feitas: itens.filter(Boolean).length, total: itens.length };
}

/** aoConcluir: chamado ao salvar ou fechar (ex.: reabrir a vaga). */
export async function abrirEditorPagina(vaga, aoConcluir) {
  let opcoes;
  try {
    opcoes = await api.get("/api/vagas/pagina/opcoes");
  } catch (err) {
    return showToast(err.message, "erro");
  }
  const p = vaga.pagina || {};
  const salarioSugerido = vaga.salario ? `R$ ${Number(vaga.salario).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "";

  const linhaLista = (valor = "") =>
    `<div class="lista-item"><input type="text" value="${esc(valor)}" /><button type="button" class="btn btn-outline btn-sm lista-remover" title="Remover">✕</button></div>`;
  const linhaResp = (r = {}) =>
    `<div class="lista-item"><input type="text" value="${esc(r.texto || "")}" placeholder="O que a pessoa fará" />
      <select>${opcoes.frequencias.map((f) => `<option value="${f}" ${r.frequencia === f ? "selected" : ""}>${f || "Frequência"}</option>`).join("")}</select>
      <button type="button" class="btn btn-outline btn-sm lista-remover" title="Remover">✕</button></div>`;
  const blocoLista = (id, itens, placeholder, linha = linhaLista) =>
    `<div class="lista-editavel" id="${id}" data-placeholder="${esc(placeholder)}">${(itens.length ? itens : [placeholder === "resp" ? {} : ""]).map((x) => linha(x)).join("")}</div>
     <button type="button" class="link-btn lista-adicionar" data-alvo="${id}">+ adicionar</button>`;

  abrirModal(`
    <h2>Página da vaga — ${esc(vaga.titulo)}</h2>
    <div class="ponto-aviso" style="margin-top:0;">Tudo o que estiver aqui aparece para o candidato no link da vaga. Não coloque dados internos ou do cliente confidencial. Descreva <strong>competências e comportamentos</strong> — nunca exigências de idade, sexo, aparência, estado civil, religião ou origem (CLT art. 373-A e Lei 9.029/95).</div>
    <div id="pg-alerta-termos" class="form-erro hidden"></div>
    <form id="form-pagina" class="form-pagina" novalidate>
      <div class="section-title">Visão rápida</div>
      <div class="form-cols">
        <div class="form-row"><label>Tipo de contratação</label>
          <select id="pg-contratacao"><option value="">—</option>${opcoes.tiposContratacao.map((t) => `<option ${p.tipoContratacao === t ? "selected" : ""}>${t}</option>`).join("")}</select></div>
        <div class="form-row"><label>Modelo de trabalho</label>
          <select id="pg-modelo"><option value="">—</option>${opcoes.modelosTrabalho.map((t) => `<option ${p.modeloTrabalho === t ? "selected" : ""}>${t}</option>`).join("")}</select></div>
      </div>
      <div class="form-cols">
        <div class="form-row"><label>Bairro</label><input type="text" id="pg-bairro" value="${esc(p.bairro || "")}" placeholder="ex.: Aldeota" /></div>
        <div class="form-row"><label>Cidade</label><input type="text" id="pg-cidade" value="${esc(p.cidade || "Fortaleza/CE")}" /></div>
      </div>

      <div class="section-title">Missão do cargo</div>
      <div class="form-row"><textarea id="pg-missao" rows="3" placeholder="O propósito central desta posição: por que ela existe e que valor gera.">${esc(p.missao || "")}</textarea></div>

      <div class="section-title">Objetivos do cargo</div>
      ${blocoLista("pg-objetivos", p.objetivos || [], "Uma meta que orienta o dia a dia")}

      <div class="section-title">Responsabilidades</div>
      ${blocoLista("pg-resp", p.responsabilidades || [], "resp", linhaResp)}

      <div class="section-title">Requisitos da vaga</div>
      ${blocoLista("pg-requisitos", p.requisitos || [], "Formação, experiência, conhecimento obrigatório...")}
      <label class="sub" style="display:block;margin-top:10px;">Diferenciais (desejável) — opcional</label>
      ${blocoLista("pg-diferenciais", p.diferenciais || [], "O que conta pontos, mas não é obrigatório")}

      <div class="section-title">Perfil comportamental</div>
      <div class="form-row"><textarea id="pg-perfil" rows="3" placeholder="Como a pessoa ideal se comporta: comunicação, ritmo, organização, relacionamento...">${esc(p.perfilComportamental || "")}</textarea></div>

      <div class="section-title">Ferramentas e sistemas <span class="sub">(opcional)</span></div>
      <div class="form-row"><input type="text" id="pg-ferramentas" value="${esc(p.ferramentas || "")}" placeholder="ex.: Excel avançado, ERP Omie, Google Workspace" /></div>

      <div class="section-title">Salário, benefícios e horário</div>
      <div class="form-row"><label>Salário</label><input type="text" id="pg-salario" value="${esc(p.salario || "")}" placeholder="${esc(salarioSugerido ? `ex.: ${salarioSugerido} ou "a combinar"` : "ex.: R$ 2.500,00 a R$ 3.000,00 ou a combinar")}" /></div>
      <div class="form-row"><label>Benefícios</label>
        <div class="chips" id="pg-beneficios">${(p.beneficios || []).map((b) => `<span class="chip" data-valor="${esc(b)}">${esc(b)} <button type="button" title="Remover">✕</button></span>`).join("")}</div>
        <div class="chips sugestoes" id="pg-sugestoes"></div>
        <div style="display:flex;gap:8px;margin-top:6px;"><input type="text" id="pg-beneficio-novo" placeholder="Outro benefício" style="flex:1;" /><button type="button" class="btn btn-outline btn-sm" id="pg-beneficio-add">Adicionar</button></div>
      </div>
      <div class="form-row"><label>Horário de trabalho</label><input type="text" id="pg-horario" value="${esc(p.horario || "")}" placeholder="ex.: Segunda a sexta, 08h às 17h (1h de almoço)" /></div>

      <div id="pg-erro" class="form-erro hidden"></div>
      <div class="modal-close-row">
        <button type="button" class="btn btn-outline" id="pg-fechar">Fechar</button>
        <button type="submit" class="btn btn-primary">Salvar página da vaga</button>
      </div>
    </form>
  `);

  const $ = (id) => document.getElementById(id);
  const form = $("form-pagina");
  // Alerta ao vivo de termos que podem ser discriminatórios (não bloqueia o salvamento).
  const verificarTermos = () => {
    const texto = [...form.querySelectorAll("input[type=text], textarea")].map((el) => el.value).join(" \n ");
    const achados = termosSensiveis(texto);
    const caixa = $("pg-alerta-termos");
    caixa.classList.toggle("hidden", !achados.length);
    caixa.innerHTML = achados.length
      ? `⚠️ Atenção: ${achados.map((a) => `<strong>"${esc(a.termo)}"</strong> (${esc(a.tipo)})`).join(", ")} pode ser considerado discriminatório em anúncio de vaga. Troque por competências e comportamentos (ex.: "organização", "boa comunicação").`
      : "";
  };
  form.addEventListener("input", verificarTermos);

  form.addEventListener("click", (e) => {
    const rem = e.target.closest(".lista-remover");
    if (rem) {
      const caixa = rem.closest(".lista-editavel");
      rem.closest(".lista-item").remove();
      if (!caixa.children.length) caixa.insertAdjacentHTML("beforeend", caixa.id === "pg-resp" ? linhaResp() : linhaLista());
      return;
    }
    const add = e.target.closest(".lista-adicionar");
    if (add) {
      const caixa = $(add.dataset.alvo);
      caixa.insertAdjacentHTML("beforeend", caixa.id === "pg-resp" ? linhaResp() : linhaLista());
      caixa.lastElementChild.querySelector("input").focus();
    }
  });
  // Placeholders das listas
  ["pg-objetivos", "pg-requisitos", "pg-diferenciais"].forEach((id) =>
    $(id).querySelectorAll("input").forEach((i) => (i.placeholder = $(id).dataset.placeholder))
  );
  form.addEventListener("focusin", (e) => {
    const caixa = e.target.closest(".lista-editavel");
    if (caixa && caixa.id !== "pg-resp" && !e.target.placeholder) e.target.placeholder = caixa.dataset.placeholder;
  });

  // Benefícios: chips + sugestões de um clique
  const beneficios = () => [...$("pg-beneficios").querySelectorAll(".chip")].map((c) => c.dataset.valor);
  function desenharSugestoes() {
    const atuais = beneficios();
    $("pg-sugestoes").innerHTML = BENEFICIOS_SUGERIDOS.filter((b) => !atuais.includes(b))
      .map((b) => `<button type="button" class="chip chip-sugestao" data-valor="${esc(b)}">+ ${esc(b)}</button>`)
      .join("");
  }
  function addBeneficio(valor) {
    const v = valor.trim();
    if (!v || beneficios().includes(v)) return;
    $("pg-beneficios").insertAdjacentHTML("beforeend", `<span class="chip" data-valor="${esc(v)}">${esc(v)} <button type="button" title="Remover">✕</button></span>`);
    desenharSugestoes();
  }
  $("pg-beneficios").addEventListener("click", (e) => {
    if (e.target.tagName === "BUTTON") {
      e.target.closest(".chip").remove();
      desenharSugestoes();
    }
  });
  $("pg-sugestoes").addEventListener("click", (e) => {
    const b = e.target.closest(".chip-sugestao");
    if (b) addBeneficio(b.dataset.valor);
  });
  $("pg-beneficio-add").addEventListener("click", () => {
    addBeneficio($("pg-beneficio-novo").value);
    $("pg-beneficio-novo").value = "";
  });
  $("pg-beneficio-novo").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      $("pg-beneficio-add").click();
    }
  });
  desenharSugestoes();
  verificarTermos();

  $("pg-fechar").addEventListener("click", () => {
    fecharModal();
    if (aoConcluir) aoConcluir();
  });
  const valores = (id) => [...$(id).querySelectorAll("input")].map((i) => i.value.trim()).filter(Boolean);
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const payload = {
      tipoContratacao: $("pg-contratacao").value,
      modeloTrabalho: $("pg-modelo").value,
      bairro: $("pg-bairro").value,
      cidade: $("pg-cidade").value,
      missao: $("pg-missao").value,
      objetivos: valores("pg-objetivos"),
      responsabilidades: [...$("pg-resp").querySelectorAll(".lista-item")]
        .map((l) => ({ texto: l.querySelector("input").value.trim(), frequencia: l.querySelector("select").value }))
        .filter((r) => r.texto),
      requisitos: valores("pg-requisitos"),
      diferenciais: valores("pg-diferenciais"),
      perfilComportamental: $("pg-perfil").value,
      ferramentas: $("pg-ferramentas").value,
      salario: $("pg-salario").value,
      beneficios: beneficios(),
      horario: $("pg-horario").value,
    };
    try {
      const salvo = await api.put(`/api/vagas/${vaga.id}/pagina`, payload);
      fecharModal();
      showToast("Página da vaga salva.", "sucesso");
      if (aoConcluir) aoConcluir(salvo);
    } catch (err) {
      $("pg-erro").textContent = err.message;
      $("pg-erro").classList.remove("hidden");
    }
  });
}
