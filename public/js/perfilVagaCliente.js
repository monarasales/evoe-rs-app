// Formulário do PERFIL DA VAGA que o cliente preenche pelo link enviado pela Evoé
// (/perfil-vaga ou /perfil-vaga/<código>). Rascunho salvo no próprio navegador do cliente;
// envio para /api/publico/perfil-vaga. O texto "perfil que não contratamos" tem alerta
// de termos discriminatórios e é de uso interno (nunca vai para a divulgação).
import { termosSensiveis } from "./mensagemVaga.js";

const app = document.getElementById("app");
const token = (location.pathname.match(/^\/perfil-vaga\/([^/?#]+)/) || [])[1] || "";
const CHAVE_RASCUNHO = `evoe_perfil_vaga_${token || "novo"}`;
const esc = (s) => {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
};

let OP = {};
let DIAS = [];
let estado = "";
let d = vazio();

function vazio() {
  return {
    empresa: { nome: "", cnpj: "", segmento: "", endereco: "", bairro: "", cidade: "" },
    contato: { nome: "", cargo: "", email: "", whatsapp: "" },
    vaga: { cargo: "", quantidade: 1, motivo: "", tipoContratacao: "", modeloTrabalho: "", localTrabalho: "", inicioDesejado: "" },
    cultura: { valores: "", ritmo: "", lideranca: "", ambiente: "", valoriza: "" },
    comportamentais: [],
    comportamentaisOutros: "",
    naoContratar: "",
    tecnicas: { atividades: [""], escolaridade: "", formacao: "", experiencia: "", ferramentas: "", cnh: "", outros: "" },
    jornada: { dias: {}, intervalo: "", observacao: "" },
    remuneracao: {
      salario: "",
      salarioACombinar: false,
      comissao: { tem: false, descricao: "" },
      alimentacao: { tipo: "", valor: "", periodicidade: "por dia" },
      valeTransporte: false,
      planoSaude: { tem: false, operadora: "", detalhes: "" },
      planoOdonto: { tem: false, operadora: "" },
      outros: [],
      outrosTexto: "",
    },
    observacoes: "",
  };
}

/** Junta o que veio do servidor/rascunho com a estrutura vazia (campos novos nunca quebram). */
function mesclar(base, extra) {
  if (!extra || typeof extra !== "object") return base;
  for (const k of Object.keys(extra)) {
    if (base[k] && typeof base[k] === "object" && !Array.isArray(base[k])) base[k] = mesclar(base[k], extra[k]);
    else if (extra[k] !== undefined && extra[k] !== null) base[k] = extra[k];
  }
  return base;
}

const pega = (caminho) => caminho.split(".").reduce((o, k) => (o ? o[k] : undefined), d);
function poe(caminho, valor) {
  const ks = caminho.split(".");
  let o = d;
  ks.slice(0, -1).forEach((k) => (o = o[k] = o[k] || {}));
  o[ks[ks.length - 1]] = valor;
}

function salvarRascunho() {
  try {
    localStorage.setItem(CHAVE_RASCUNHO, JSON.stringify(d));
  } catch (e) {
    /* navegador sem armazenamento: só não guarda o rascunho */
  }
}

// ---------- Pedaços do formulário ----------
const campo = (rot, c, { tipo = "text", ph = "", opc = false, dica = "", attrs = "" } = {}) =>
  `<label>${rot}${opc ? ' <span class="opc">(opcional)</span>' : ""}</label>
   <input type="${tipo}" data-c="${c}" value="${esc(pega(c) ?? "")}" placeholder="${esc(ph)}" ${attrs} />${dica ? `<div class="dica">${dica}</div>` : ""}`;
const area = (rot, c, { ph = "", opc = false, dica = "" } = {}) =>
  `<label>${rot}${opc ? ' <span class="opc">(opcional)</span>' : ""}</label>
   <textarea data-c="${c}" placeholder="${esc(ph)}">${esc(pega(c) || "")}</textarea>${dica ? `<div class="dica">${dica}</div>` : ""}`;
const chipsUm = (rot, c, opcoes, { opc = false } = {}) =>
  `<label>${rot}${opc ? ' <span class="opc">(opcional)</span>' : ""}</label>
   <div class="chips">${opcoes.map((o) => `<button type="button" class="chip ${pega(c) === o ? "on" : ""}" data-um="${c}" data-v="${esc(o)}">${esc(o)}</button>`).join("")}</div>`;
const chipsVarios = (c, opcoes) =>
  `<div class="chips">${opcoes.map((o) => `<button type="button" class="chip ${(pega(c) || []).includes(o) ? "on" : ""}" data-varios="${c}" data-v="${esc(o)}">${esc(o)}</button>`).join("")}</div>`;
const simNao = (rot, c) =>
  `<label>${rot}</label><div class="sn">
    <button type="button" class="chip ${pega(c) ? "on" : ""}" data-sn="${c}" data-v="1">Sim</button>
    <button type="button" class="chip ${!pega(c) ? "on" : ""}" data-sn="${c}" data-v="0">Não</button></div>`;
const cartao = (n, titulo, corpo, id = "") => `<section class="cartao" ${id ? `id="${id}"` : ""}><h2><span class="num">${n}</span>${titulo}</h2>${corpo}</section>`;

const minutos = (h) => (h ? Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5)) : 0);
function totalSemana() {
  let t = 0;
  for (const x of Object.values(d.jornada.dias)) if (x.ativo && x.inicio && x.fim) t += Math.max(0, minutos(x.fim) - minutos(x.inicio));
  return Math.round((t / 60) * 10) / 10;
}

function blocoHorarios() {
  const ativos = DIAS.filter(([k]) => d.jornada.dias[k] && d.jornada.dias[k].ativo);
  if (!ativos.length) return '<div class="dica">Toque nos dias em que a pessoa vai trabalhar.</div>';
  return `<div class="horarios">${ativos
    .map(
      ([k, rot]) => `<div class="horario"><strong>${rot}</strong>
        <input type="time" data-hora="${k}.inicio" value="${esc(d.jornada.dias[k].inicio || "")}" aria-label="Entrada ${rot}" />
        <input type="time" data-hora="${k}.fim" value="${esc(d.jornada.dias[k].fim || "")}" aria-label="Saída ${rot}" /></div>`
    )
    .join("")}</div>
    ${ativos.length > 1 ? '<button type="button" class="btn-mini" id="copiar-horario" style="margin-top:8px;">Copiar o horário do 1º dia para os outros</button>' : ""}
    <div class="total" id="total-semana">${totalSemana() ? `Total: ${String(totalSemana()).replace(".", ",")} horas por semana (sem descontar o intervalo)` : ""}</div>`;
}

function blocoAtividades() {
  return `<div class="lista-itens">${d.tecnicas.atividades
    .map((a, i) => `<div class="item"><input type="text" data-atv="${i}" value="${esc(a)}" placeholder="Ex.: emitir notas fiscais, atender clientes no balcão..." />${d.tecnicas.atividades.length > 1 ? `<button type="button" class="btn-mini remover" data-rem-atv="${i}" aria-label="Remover">✕</button>` : ""}</div>`)
    .join("")}</div><button type="button" class="btn-mini" id="add-atv" style="margin-top:8px;">+ Adicionar outra atividade</button>`;
}

function alertaTermos() {
  const achados = termosSensiveis([d.naoContratar, d.comportamentaisOutros, d.cultura.valoriza].join(" \n "));
  return achados.length
    ? `<div class="alerta">⚠️ Atenção: ${achados.map((a) => `<strong>"${esc(a.termo)}"</strong> (${esc(a.tipo)})`).join(", ")} pode ser considerado discriminatório (CLT art. 373-A e Lei 9.029/95). Prefira descrever comportamentos e atitudes — a nossa equipe vai conversar com você sobre isso.</div>`
    : "";
}

function formulario() {
  const r = d.remuneracao;
  return `
  ${cartao(1, "Sua empresa", `
    ${campo("Nome da empresa *", "empresa.nome", { ph: "Nome fantasia ou razão social" })}
    <div class="linha"><div>${campo("CNPJ", "empresa.cnpj", { opc: true, ph: "00.000.000/0000-00", attrs: 'inputmode="numeric"' })}</div><div>${campo("Segmento", "empresa.segmento", { opc: true, ph: "Ex.: farmácia, construção, varejo" })}</div></div>
    ${campo("Endereço", "empresa.endereco", { opc: true, ph: "Rua, número" })}
    <div class="linha"><div>${campo("Bairro", "empresa.bairro", { opc: true })}</div><div>${campo("Cidade", "empresa.cidade", { opc: true, ph: "Fortaleza" })}</div></div>`)}

  ${cartao(2, "Quem está preenchendo", `
    <div class="linha"><div>${campo("Seu nome *", "contato.nome")}</div><div>${campo("Seu cargo", "contato.cargo", { opc: true, ph: "Ex.: sócio, gerente de RH" })}</div></div>
    <div class="linha"><div>${campo("Seu e-mail *", "contato.email", { tipo: "email" })}</div><div>${campo("Seu WhatsApp *", "contato.whatsapp", { tipo: "tel", ph: "(85) 90000-0000", attrs: 'inputmode="numeric"' })}</div></div>
    <div class="dica">A confirmação da Evoé chega neste e-mail e WhatsApp.</div>`)}

  ${cartao(3, "A vaga", `
    <div class="linha"><div>${campo("Cargo *", "vaga.cargo", { ph: "Ex.: Assistente Administrativo" })}</div><div>${campo("Quantas vagas", "vaga.quantidade", { tipo: "number", attrs: 'min="1" max="99"' })}</div></div>
    ${chipsUm("Motivo da contratação", "vaga.motivo", OP.motivos, { opc: true })}
    ${chipsUm("Tipo de contratação", "vaga.tipoContratacao", OP.tiposContratacao)}
    ${chipsUm("Modelo de trabalho", "vaga.modeloTrabalho", OP.modelosTrabalho)}
    <div class="linha"><div>${campo("Local de trabalho", "vaga.localTrabalho", { opc: true, ph: "Se for diferente do endereço da empresa" })}</div><div>${campo("Quando precisa que a pessoa comece", "vaga.inicioDesejado", { opc: true, ph: "Ex.: o quanto antes, 1º de novembro" })}</div></div>`)}

  ${cartao(4, "Cultura da empresa", `
    <div class="explica">💡 <strong>O que é cultura?</strong> É o “jeito de ser” da empresa: os valores, o ritmo do dia a dia, como a liderança conduz a equipe e o que é mais valorizado. Com isso buscamos alguém que, além de saber fazer, <strong>se encaixe e fique</strong> na sua equipe.</div>
    ${area("Quais são os valores da empresa?", "cultura.valores", { opc: true, ph: "Ex.: respeito ao cliente, honestidade, trabalho em equipe..." })}
    ${chipsUm("Como é o ritmo de trabalho?", "cultura.ritmo", OP.ritmos, { opc: true })}
    ${chipsUm("Como é a liderança?", "cultura.lideranca", OP.liderancas, { opc: true })}
    ${chipsUm("Como é o ambiente?", "cultura.ambiente", OP.ambientes, { opc: true })}
    ${area("O que mais valorizam em quem trabalha aí?", "cultura.valoriza", { opc: true, ph: "Ex.: pontualidade, iniciativa para resolver problemas..." })}`)}

  ${cartao(5, "Competências comportamentais desejáveis", `
    <div class="dica" style="margin-bottom:10px;">Toque nas que são importantes para esta vaga (o ideal são até 6).</div>
    ${chipsVarios("comportamentais", OP.comportamentais)}
    ${campo("Outra competência importante", "comportamentaisOutros", { opc: true })}`)}

  ${cartao(6, "Perfil que a empresa não gosta de contratar", `
    <div class="explica">🔒 Uso interno da Evoé — esta resposta <strong>não aparece no anúncio da vaga</strong>. Descreva <strong>comportamentos e atitudes</strong> que não combinam com a vaga (ex.: “pessoas que não gostam de rotina”, “quem tem dificuldade em seguir processos”). Por lei, não é permitido restringir por idade, sexo, estado civil, gravidez, aparência, raça, religião ou origem.</div>
    ${area("", "naoContratar", { opc: true, ph: "Ex.: profissionais sem paciência para atendimento ao público..." })}
    <div id="alerta-termos">${alertaTermos()}</div>`)}

  ${cartao(7, "Competências técnicas — o que a pessoa precisa saber fazer", `
    <label>Principais atividades do dia a dia</label>
    <div id="atividades">${blocoAtividades()}</div>
    <div class="linha">
      <div><label>Escolaridade mínima <span class="opc">(opcional)</span></label><select data-c="tecnicas.escolaridade"><option value="">—</option>${OP.escolaridades.map((e) => `<option ${d.tecnicas.escolaridade === e ? "selected" : ""}>${esc(e)}</option>`).join("")}</select></div>
      <div>${campo("Formação / curso", "tecnicas.formacao", { opc: true, ph: "Ex.: Administração, Técnico em Enfermagem" })}</div>
    </div>
    ${campo("Experiência necessária", "tecnicas.experiencia", { opc: true, ph: "Ex.: 1 ano em atendimento ao cliente" })}
    ${campo("Ferramentas ou sistemas que precisa dominar", "tecnicas.ferramentas", { opc: true, ph: "Ex.: Excel intermediário, sistema ERP, máquina de cartão" })}
    <div class="linha"><div>${campo("CNH", "tecnicas.cnh", { opc: true, ph: "Ex.: categoria B" })}</div><div>${campo("Outros conhecimentos", "tecnicas.outros", { opc: true })}</div></div>`)}

  ${cartao(8, "Dias e horários de trabalho *", `
    <label>Dias da semana</label>
    <div class="dias">${DIAS.map(([k, rot]) => `<button type="button" class="dia ${d.jornada.dias[k] && d.jornada.dias[k].ativo ? "on" : ""}" data-dia="${k}">${rot}</button>`).join("")}</div>
    <div class="dica">Cada dia pode ter um horário diferente (ex.: sábado só até o meio-dia).</div>
    <div id="horarios">${blocoHorarios()}</div>
    <div class="linha"><div>${campo("Intervalo", "jornada.intervalo", { opc: true, ph: "Ex.: 1 hora de almoço" })}</div><div>${campo("Observação sobre a escala", "jornada.observacao", { opc: true, ph: "Ex.: sábados alternados, escala 12x36" })}</div></div>`)}

  ${cartao(9, "Salário e benefícios", `
    <div class="linha">
      <div>${campo("Salário (R$) *", "remuneracao.salario", { ph: "Ex.: 1.800,00", attrs: `inputmode="decimal" ${r.salarioACombinar ? "disabled" : ""}` })}</div>
      <div><label>&nbsp;</label><label style="font-weight:400;display:flex;gap:8px;align-items:center;margin:0;"><input type="checkbox" data-chk="remuneracao.salarioACombinar" ${r.salarioACombinar ? "checked" : ""} /> Salário a combinar</label></div>
    </div>
    ${simNao("Tem comissão?", "remuneracao.comissao.tem")}
    ${r.comissao.tem ? `<div class="cond">${campo("Como funciona a comissão", "remuneracao.comissao.descricao", { ph: "Ex.: 2% sobre as vendas, média de R$ 500/mês" })}</div>` : ""}
    ${chipsUm("Alimentação", "remuneracao.alimentacao.tipo", OP.alimentacao)}
    ${r.alimentacao.tipo && !["Não oferece", "Refeição no local"].includes(r.alimentacao.tipo) ? `<div class="cond linha"><div>${campo("Valor (R$)", "remuneracao.alimentacao.valor", { ph: "Ex.: 25,00", attrs: 'inputmode="decimal"' })}</div><div><label>Por</label><select data-c="remuneracao.alimentacao.periodicidade">${OP.periodicidades.map((p) => `<option ${r.alimentacao.periodicidade === p ? "selected" : ""}>${p}</option>`).join("")}</select></div></div>` : ""}
    ${simNao("Vale-transporte?", "remuneracao.valeTransporte")}
    ${simNao("Plano de saúde?", "remuneracao.planoSaude.tem")}
    ${r.planoSaude.tem ? `<div class="cond linha"><div>${campo("Qual operadora", "remuneracao.planoSaude.operadora", { ph: "Ex.: Hapvida, Unimed" })}</div><div>${campo("Detalhes", "remuneracao.planoSaude.detalhes", { opc: true, ph: "Coparticipação, dependentes..." })}</div></div>` : ""}
    ${simNao("Plano odontológico?", "remuneracao.planoOdonto.tem")}
    ${r.planoOdonto.tem ? `<div class="cond">${campo("Qual operadora", "remuneracao.planoOdonto.operadora", { opc: true })}</div>` : ""}
    <label>Outros benefícios <span class="opc">(toque nos que oferece)</span></label>
    ${chipsVarios("remuneracao.outros", OP.outrosBeneficios)}
    ${campo("Algum outro benefício?", "remuneracao.outrosTexto", { opc: true })}`)}

  ${cartao(10, "Algo mais?", area("Observações", "observacoes", { opc: true, ph: "Qualquer informação que ajude a encontrar a pessoa certa." }))}

  <input type="text" class="isca" id="site" tabindex="-1" autocomplete="off" aria-hidden="true" />
  <div id="erro" class="erro" hidden></div>
  <button type="button" class="botao" id="enviar">${estado === "Aguardando validação" || estado === "Ajuste solicitado" ? "Enviar ajustes" : "Enviar perfil da vaga"}</button>
  <p class="rodape">Seus dados são usados apenas para o processo seletivo, conforme a LGPD. O rascunho fica salvo neste aparelho até você enviar.</p>`;
}

// ---------- Progresso ----------
function progresso() {
  const passos = [
    !!d.empresa.nome,
    !!(d.contato.nome && d.contato.email && d.contato.whatsapp),
    !!(d.vaga.cargo && d.vaga.tipoContratacao),
    !!(d.cultura.valores || d.cultura.ritmo || d.cultura.lideranca),
    d.comportamentais.length > 0,
    true,
    d.tecnicas.atividades.some(Boolean),
    Object.values(d.jornada.dias).some((x) => x.ativo && x.inicio && x.fim),
    !!(d.remuneracao.salario || d.remuneracao.salarioACombinar),
  ];
  const feitos = passos.filter(Boolean).length;
  document.getElementById("barra").style.width = `${Math.round((feitos / passos.length) * 100)}%`;
  document.getElementById("progresso-txt").textContent = `${feitos} de ${passos.length} partes preenchidas`;
}

// ---------- Tela ----------
function statusHtml(info) {
  if (!info) return "";
  const quando = (iso) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "");
  if (info.status === "Validado")
    return `<div class="status ok">✅ <strong>Perfil validado pela Evoé${info.validadoEm ? ` em ${quando(info.validadoEm)}` : ""}.</strong>${info.mensagemCliente ? `<pre>${esc(info.mensagemCliente.replace(/\*/g, ""))}</pre>` : ""}</div>`;
  if (info.status === "Ajuste solicitado")
    return `<div class="status aviso">✏️ <strong>A Evoé pediu um ajuste:</strong><pre>${esc(info.mensagemCliente)}</pre>Corrija abaixo e toque em “Enviar ajustes”.</div>`;
  if (info.status === "Aguardando validação")
    return `<div class="status info">📨 <strong>Recebemos o seu perfil${info.enviadoEm ? ` em ${quando(info.enviadoEm)}` : ""}.</strong> Nossa equipe está revisando e você receberá a confirmação por e-mail e WhatsApp. Se precisar, ainda dá para ajustar abaixo.</div>`;
  if (info.status === "Arquivado") return '<div class="status aviso">Este perfil foi encerrado. Em caso de dúvida, fale com a Evoé.</div>';
  return "";
}

function desenhar(info) {
  if (info && ["Validado", "Arquivado"].includes(info.status)) {
    app.innerHTML = `<h1>Perfil da vaga${d.vaga.cargo ? `: ${esc(d.vaga.cargo)}` : ""}</h1>${statusHtml(info)}<p class="intro">Obrigada pela confiança! Qualquer alteração, é só falar com a sua consultora da Evoé.</p>`;
    document.getElementById("progresso").hidden = true;
    return;
  }
  app.innerHTML = `
    <h1>Vamos encontrar a pessoa certa para a sua equipe 💜</h1>
    <p class="intro">Conte para a Evoé sobre a sua empresa e a vaga. Leva cerca de 10 minutos — campos com * são obrigatórios. Quanto mais detalhes, mais certeira será a seleção.</p>
    ${statusHtml(info)}
    ${formulario()}`;
  document.getElementById("progresso").hidden = false;
  progresso();
}

function redesenharMantendoRolagem() {
  const y = window.scrollY;
  desenhar(infoAtual);
  window.scrollTo(0, y);
}

let infoAtual = null;

// ---------- Eventos (delegados: a tela é redesenhada a cada escolha) ----------
app.addEventListener("input", (e) => {
  const el = e.target;
  if (el.dataset.c) {
    poe(el.dataset.c, el.value);
    if (el.dataset.c === "naoContratar" || el.dataset.c === "comportamentaisOutros" || el.dataset.c === "cultura.valoriza") {
      const box = document.getElementById("alerta-termos");
      if (box) box.innerHTML = alertaTermos();
    }
  } else if (el.dataset.atv !== undefined) d.tecnicas.atividades[Number(el.dataset.atv)] = el.value;
  else if (el.dataset.hora) {
    const [dia, k] = el.dataset.hora.split(".");
    d.jornada.dias[dia][k] = el.value;
    const tot = document.getElementById("total-semana");
    if (tot) tot.textContent = totalSemana() ? `Total: ${String(totalSemana()).replace(".", ",")} horas por semana (sem descontar o intervalo)` : "";
  }
  salvarRascunho();
  progresso();
});
app.addEventListener("change", (e) => {
  const el = e.target;
  if (el.dataset.chk) {
    poe(el.dataset.chk, el.checked);
    salvarRascunho();
    redesenharMantendoRolagem();
  } else if (el.tagName === "SELECT" && el.dataset.c) {
    poe(el.dataset.c, el.value);
    salvarRascunho();
  }
});
app.addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.um) poe(b.dataset.um, pega(b.dataset.um) === b.dataset.v ? "" : b.dataset.v);
  else if (b.dataset.varios) {
    const atual = new Set(pega(b.dataset.varios) || []);
    atual.has(b.dataset.v) ? atual.delete(b.dataset.v) : atual.add(b.dataset.v);
    poe(b.dataset.varios, [...atual]);
  } else if (b.dataset.sn) poe(b.dataset.sn, b.dataset.v === "1");
  else if (b.dataset.dia) {
    const k = b.dataset.dia;
    const atual = d.jornada.dias[k];
    if (atual && atual.ativo) delete d.jornada.dias[k];
    else {
      // novo dia já vem com o horário do primeiro dia marcado (dá para mudar)
      const modelo = Object.values(d.jornada.dias).find((x) => x.ativo && x.inicio) || {};
      d.jornada.dias[k] = { ativo: true, inicio: modelo.inicio || "", fim: modelo.fim || "" };
    }
  } else if (b.id === "copiar-horario") {
    const ativos = DIAS.map(([k]) => k).filter((k) => d.jornada.dias[k] && d.jornada.dias[k].ativo);
    const prim = d.jornada.dias[ativos[0]];
    ativos.slice(1).forEach((k) => Object.assign(d.jornada.dias[k], { inicio: prim.inicio, fim: prim.fim }));
  } else if (b.id === "add-atv") d.tecnicas.atividades.push("");
  else if (b.dataset.remAtv !== undefined) d.tecnicas.atividades.splice(Number(b.dataset.remAtv), 1);
  else if (b.id === "enviar") return enviar(b);
  else return;
  salvarRascunho();
  redesenharMantendoRolagem();
});

async function enviar(botao) {
  const erro = document.getElementById("erro");
  erro.hidden = true;
  botao.disabled = true;
  botao.textContent = "Enviando...";
  const corpo = { dados: { ...d, tecnicas: { ...d.tecnicas, atividades: d.tecnicas.atividades.filter((a) => a.trim()) } }, site: document.getElementById("site").value };
  try {
    const r = await fetch(token ? `/api/publico/perfil-vaga/${encodeURIComponent(token)}` : "/api/publico/perfil-vaga", {
      method: token ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || "Não foi possível enviar. Tente novamente.");
    try {
      localStorage.removeItem(CHAVE_RASCUNHO);
    } catch (e) {
      /* ok */
    }
    const link = `${location.origin}/perfil-vaga/${j.token}`;
    document.getElementById("progresso").hidden = true;
    app.innerHTML = `<div class="cartao sucesso"><div class="icone">💜</div>
      <h1>Recebemos o perfil da vaga!</h1>
      <p class="intro">Obrigada, ${esc(d.contato.nome.split(" ")[0])}! Nossa equipe vai revisar as informações e você receberá a <strong>confirmação da validação</strong> por e-mail e WhatsApp.</p>
      <p class="intro">Guarde este link para acompanhar ou ajustar:<br><a href="${link}">${link}</a></p></div>`;
    window.scrollTo(0, 0);
  } catch (err) {
    erro.textContent = err.message;
    erro.hidden = false;
    botao.disabled = false;
    botao.textContent = "Tentar enviar de novo";
  }
}

// ---------- Início ----------
(async function iniciar() {
  try {
    const op = await fetch("/api/publico/perfil-vaga/opcoes").then((r) => r.json());
    OP = op.opcoes;
    DIAS = op.dias;
    if (token) {
      const r = await fetch(`/api/publico/perfil-vaga/${encodeURIComponent(token)}`);
      const j = await r.json();
      if (!r.ok) {
        app.innerHTML = `<div class="status aviso">${esc(j.erro || "Link não encontrado.")}</div>`;
        return;
      }
      infoAtual = j;
      estado = j.status;
      d = mesclar(vazio(), j.dados);
      if (!d.tecnicas.atividades.length) d.tecnicas.atividades = [""];
    }
    // Rascunho deste aparelho tem prioridade enquanto o perfil não foi enviado/validado.
    if (!infoAtual || ["Link enviado", "Ajuste solicitado"].includes(infoAtual.status)) {
      try {
        const rasc = JSON.parse(localStorage.getItem(CHAVE_RASCUNHO) || "null");
        if (rasc) d = mesclar(vazio(), rasc);
      } catch (e) {
        /* ignora rascunho inválido */
      }
    }
    desenhar(infoAtual);
  } catch (e) {
    app.innerHTML = '<div class="status aviso">Não foi possível carregar o formulário. Verifique a internet e recarregue a página.</div>';
  }
})();
