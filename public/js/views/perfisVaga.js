// Perfis de vaga enviados pelos clientes (só Gestor): gerar link para o cliente, revisar,
// pedir ajuste, validar (cria empresa + vaga com a página de divulgação) e confirmar ao
// cliente por WhatsApp/e-mail.
import { api } from "../api.js";
import { store, showToast, isGestor, consultoresDeVagas } from "../state.js";
import { abrirModal, fecharModal } from "../modal.js";
import { criarCombobox } from "../combobox.js";
import { termosSensiveis } from "../mensagemVaga.js";

const esc = (s) => {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
};
const dataHora = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const brl = (n) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const TAG = {
  "Link enviado": "tag-standby",
  "Aguardando validação": "tag-prospect-proposta",
  "Ajuste solicitado": "tag-atrasada",
  Validado: "tag-prospect-fechado",
  Arquivado: "tag-encerrada",
};
/** Telefone para o wa.me (com 55), aceitando +55, zero na frente etc. */
const telWhats = (t) => {
  let d = String(t || "").replace(/\D/g, "").replace(/^0+/, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  return d.length >= 10 ? `55${d}` : "";
};
const ORDEM = ["Aguardando validação", "Ajuste solicitado", "Link enviado", "Validado", "Arquivado"];
const NOMES_DIAS = { seg: "Seg", ter: "Ter", qua: "Qua", qui: "Qui", sex: "Sex", sab: "Sáb", dom: "Dom" };

async function copiar(texto, aviso) {
  try {
    await navigator.clipboard.writeText(texto);
    showToast(aviso, "sucesso");
  } catch (e) {
    prompt("Copie:", texto);
  }
}

export async function renderPerfisVaga(root) {
  if (!isGestor()) {
    root.innerHTML = '<div class="empty-state">Esta área é exclusiva do perfil Gestor.</div>';
    return;
  }
  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Perfis de vaga dos clientes</h2>
        <div class="sub">O cliente preenche o perfil da vaga pelo link; você revisa e valida — a vaga é criada já com a página de divulgação.</div>
      </div>
      <div class="link-acoes">
        <button class="btn btn-outline btn-sm" id="pv-link-geral">🔗 Copiar link geral</button>
        <button class="btn btn-primary btn-sm" id="pv-convite">+ Gerar link para um cliente</button>
      </div>
    </div>
    <div class="funil-chips" id="pv-chips"></div>
    <div id="pv-lista"><div class="empty-state">Carregando...</div></div>`;
  let lista = [];
  let linkGeral = "";
  let filtro = "";

  async function carregar() {
    const r = await api.get("/api/solicitacoes-vaga");
    lista = r.lista;
    linkGeral = r.linkGeral;
    desenhar();
    if (window.__evoe.atualizarBadgePerfis) window.__evoe.atualizarBadgePerfis();
  }

  function desenhar() {
    const conta = (s) => lista.filter((x) => x.status === s).length;
    root.querySelector("#pv-chips").innerHTML =
      `<button type="button" class="funil-chip ${!filtro ? "ativo" : ""}" data-f="">Todos <strong>${lista.length}</strong></button>` +
      ORDEM.map((s) => `<button type="button" class="funil-chip ${filtro === s ? "ativo" : ""}" data-f="${s}">${s} <strong>${conta(s)}</strong></button>`).join("");
    root.querySelectorAll("#pv-chips [data-f]").forEach((b) =>
      b.addEventListener("click", () => {
        filtro = b.dataset.f;
        desenhar();
      })
    );
    const itens = lista
      .filter((s) => !filtro || s.status === filtro)
      .sort((a, b) => ORDEM.indexOf(a.status) - ORDEM.indexOf(b.status) || String(b.enviadoEm || b.createdAt).localeCompare(String(a.enviadoEm || a.createdAt)));
    const el = root.querySelector("#pv-lista");
    if (!itens.length) {
      el.innerHTML = `<div class="empty-state">${lista.length ? "Nenhum perfil neste filtro." : 'Nenhum perfil ainda. Use "+ Gerar link para um cliente" e envie pelo WhatsApp.'}</div>`;
      return;
    }
    el.innerHTML = `<div class="pv-grid">${itens
      .map(
        (s) => `<div class="pv-card ${s.status === "Aguardando validação" ? "pv-card-novo" : ""}" data-id="${s.id}">
          <div class="pv-card-topo"><span class="tag ${TAG[s.status] || ""}">${esc(s.status)}</span><span class="sub">${s.enviadoEm ? `enviado ${dataHora(s.enviadoEm)}` : `link criado ${dataHora(s.createdAt)}`}</span></div>
          <strong>${esc(s.dados.vaga.cargo || "(cargo ainda não informado)")}</strong>
          <div>${esc(s.dados.empresa.nome || "—")}</div>
          <div class="sub">${esc(s.dados.contato.nome || "")}${s.dados.contato.whatsapp ? ` · ${esc(s.dados.contato.whatsapp)}` : ""}${s.dados.contato.email ? ` · ${esc(s.dados.contato.email)}` : ""}</div>
          ${s.dados.remuneracao && s.dados.remuneracao.salario ? `<div class="sub">${brl(s.dados.remuneracao.salario)}${s.jornadaResumo && s.jornadaResumo.texto ? ` · ${esc(s.jornadaResumo.texto)}` : ""}</div>` : ""}
        </div>`
      )
      .join("")}</div>`;
    el.querySelectorAll(".pv-card").forEach((c) => c.addEventListener("click", () => abrir(lista.find((s) => s.id === c.dataset.id))));
  }

  // ---------- Detalhe ----------
  function secoes(s) {
    const d = s.dados;
    const r = d.remuneracao;
    const linha = (rot, v) => (v ? `<div class="pv-linha"><span>${rot}</span><div>${v}</div></div>` : "");
    const dias = Object.entries(d.jornada.dias || {})
      .filter(([, x]) => x.ativo)
      .map(([k, x]) => `${NOMES_DIAS[k]} ${esc(x.inicio)}–${esc(x.fim)}`)
      .join(" · ");
    const alerta = termosSensiveis([d.naoContratar, d.comportamentaisOutros, d.cultura.valoriza].join(" \n "));
    return `
      <div class="pv-secao"><h4>🏢 Empresa e contato</h4>
        ${linha("Empresa", `${esc(d.empresa.nome)}${d.empresa.cnpj ? ` · CNPJ ${esc(d.empresa.cnpj)}` : ""}${d.empresa.segmento ? ` · ${esc(d.empresa.segmento)}` : ""}`)}
        ${linha("Endereço", esc([d.empresa.endereco, d.empresa.bairro, d.empresa.cidade].filter(Boolean).join(", ")))}
        ${linha("Contato", `${esc(d.contato.nome)}${d.contato.cargo ? ` (${esc(d.contato.cargo)})` : ""} · ${esc(d.contato.email)} · ${esc(d.contato.whatsapp)}`)}
      </div>
      <div class="pv-secao"><h4>💼 Vaga</h4>
        ${linha("Cargo", `${esc(d.vaga.cargo)} — ${d.vaga.quantidade} vaga(s)`)}
        ${linha("Contratação", esc([d.vaga.tipoContratacao, d.vaga.modeloTrabalho, d.vaga.motivo].filter(Boolean).join(" · ")))}
        ${linha("Local", esc(d.vaga.localTrabalho))}
        ${linha("Início", esc(d.vaga.inicioDesejado))}
      </div>
      <div class="pv-secao"><h4>🌱 Cultura</h4>
        ${linha("Valores", esc(d.cultura.valores))}${linha("Ritmo", esc(d.cultura.ritmo))}${linha("Liderança", esc(d.cultura.lideranca))}${linha("Ambiente", esc(d.cultura.ambiente))}${linha("Valorizam", esc(d.cultura.valoriza))}
      </div>
      <div class="pv-secao"><h4>🤝 Competências comportamentais</h4>
        <div class="chips-ro">${[...d.comportamentais, d.comportamentaisOutros].filter(Boolean).map((c) => `<span class="tag tag-prospect-contato">${esc(c)}</span>`).join(" ") || "—"}</div>
      </div>
      <div class="pv-secao"><h4>🔒 Perfil que não contratam <span class="sub">(interno — não vai para a divulgação)</span></h4>
        <div>${esc(d.naoContratar) || "—"}</div>
        ${alerta.length ? `<div class="ponto-aviso" style="margin-top:6px;">⚠️ Termo(s) possivelmente discriminatório(s): ${alerta.map((a) => `<strong>"${esc(a.termo)}"</strong> (${esc(a.tipo)})`).join(", ")}. Alinhe com o cliente antes de seguir (CLT 373-A, Lei 9.029/95).</div>` : ""}
      </div>
      <div class="pv-secao"><h4>🛠️ Competências técnicas</h4>
        ${d.tecnicas.atividades.length ? `<ul>${d.tecnicas.atividades.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}
        ${linha("Escolaridade", esc([d.tecnicas.escolaridade, d.tecnicas.formacao].filter(Boolean).join(" — ")))}${linha("Experiência", esc(d.tecnicas.experiencia))}${linha("Ferramentas", esc(d.tecnicas.ferramentas))}${linha("CNH", esc(d.tecnicas.cnh))}${linha("Outros", esc(d.tecnicas.outros))}
      </div>
      <div class="pv-secao"><h4>🗓️ Jornada</h4>
        ${linha("Dias", dias)}${linha("Resumo", s.jornadaResumo ? `${esc(s.jornadaResumo.texto)} (${String(s.jornadaResumo.horasSemana).replace(".", ",")}h/semana)` : "")}${linha("Intervalo", esc(d.jornada.intervalo))}${linha("Obs.", esc(d.jornada.observacao))}
      </div>
      <div class="pv-secao"><h4>💰 Remuneração e benefícios</h4>
        ${linha("Salário", r.salario ? brl(r.salario) : r.salarioACombinar ? "A combinar" : "—")}
        ${linha("Comissão", r.comissao.tem ? `Sim${r.comissao.descricao ? ` — ${esc(r.comissao.descricao)}` : ""}` : "Não")}
        ${linha("Alimentação", r.alimentacao.tipo ? `${esc(r.alimentacao.tipo)}${r.alimentacao.valor ? ` — ${brl(r.alimentacao.valor)} ${esc(r.alimentacao.periodicidade)}` : ""}` : "—")}
        ${linha("Vale-transporte", r.valeTransporte ? "Sim" : "Não")}
        ${linha("Plano de saúde", r.planoSaude.tem ? `Sim${r.planoSaude.operadora ? ` — ${esc(r.planoSaude.operadora)}` : ""}${r.planoSaude.detalhes ? ` (${esc(r.planoSaude.detalhes)})` : ""}` : "Não")}
        ${linha("Odontológico", r.planoOdonto.tem ? `Sim${r.planoOdonto.operadora ? ` — ${esc(r.planoOdonto.operadora)}` : ""}` : "Não")}
        ${linha("Outros", esc([...r.outros, r.outrosTexto].filter(Boolean).join(", ")))}
      </div>
      ${d.observacoes ? `<div class="pv-secao"><h4>📝 Observações</h4><div>${esc(d.observacoes)}</div></div>` : ""}`;
  }

  function mensagemPadrao(s) {
    const nome = String(s.dados.contato.nome || "").trim().split(/\s+/)[0];
    return [
      `Olá${nome ? `, ${nome}` : ""}! Tudo bem? 😊`,
      `Aqui é a Monara, da Evoé Gestão & RH. Recebemos e validamos o perfil da vaga de *${s.dados.vaga.cargo}*. ✅`,
      "Já iniciamos o processo de recrutamento e seleção e vamos manter você informado(a) a cada etapa.",
      "Obrigada pela confiança e pela parceria! 💜",
    ].join("\n\n");
  }

  function abrir(s) {
    const podeValidar = ["Aguardando validação", "Ajuste solicitado"].includes(s.status);
    const em30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    abrirModal(`
      <h2>${esc(s.dados.vaga.cargo || "Perfil da vaga")} <span class="tag ${TAG[s.status] || ""}">${esc(s.status)}</span></h2>
      <div class="sub" style="margin-bottom:10px;">${esc(s.origem || "")} · link do cliente: <a href="${esc(s.link)}" target="_blank" rel="noopener">abrir</a> · <button type="button" class="link-btn" id="pv-copiar-link">copiar</button></div>
      ${s.status === "Link enviado" ? '<div class="ponto-aviso">O cliente ainda não preencheu. Reenvie o link se precisar.</div>' : secoes(s)}
      ${s.status === "Validado" ? `<div class="funil-final aprovado" style="margin-top:10px;">✅ Validado por ${esc(s.validadoPor)} em ${dataHora(s.validadoEm)} — a vaga foi criada no Funil de Vagas.</div>
        <div class="link-acoes" style="margin-top:8px;"><a class="btn btn-outline btn-sm" href="#/kanban" id="pv-ir-funil">Ir para o Funil de Vagas</a>
        ${s.dados.contato.whatsapp ? `<a class="btn btn-primary btn-sm" target="_blank" rel="noopener" href="https://wa.me/${telWhats(s.dados.contato.whatsapp)}?text=${encodeURIComponent(s.mensagemCliente || "")}">Reenviar confirmação pelo WhatsApp</a>` : ""}</div>` : ""}
      ${
        podeValidar
          ? `<div class="pv-validar">
              <h3>✅ Validar e criar a vaga</h3>
              <div class="form-row"><label>Empresa no sistema</label><div id="pv-empresa"></div>
                <div class="sub">${s.empresaSugerida ? `Encontramos "${esc(s.empresaSugerida.nome)}" já cadastrada.` : `Se deixar em branco, "${esc(s.dados.empresa.nome)}" será cadastrada como nova empresa.`}</div></div>
              <div class="form-cols">
                <div class="form-row"><label>Consultor responsável</label><select id="pv-consultor"><option value="">Escolha...</option>${consultoresDeVagas([]).map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join("")}</select></div>
                <div class="form-row"><label>Prazo de fechamento</label><input type="date" id="pv-prazo" value="${em30}" /></div>
              </div>
              <div class="form-row"><label>Prioridade</label><select id="pv-prioridade">${["Baixa", "Média", "Alta"].map((p) => `<option ${p === "Média" ? "selected" : ""}>${p}</option>`).join("")}</select></div>
              <div class="form-row"><label>Mensagem de confirmação ao cliente <span class="sub">(vai por e-mail e você envia pelo WhatsApp)</span></label><textarea id="pv-msg" rows="7">${esc(mensagemPadrao(s))}</textarea></div>
              <button type="button" class="btn btn-primary" id="pv-validar">✅ Validar e criar vaga</button>
            </div>
            <details class="pv-ajuste"><summary>✏️ Pedir ajuste ao cliente</summary>
              <div class="form-row" style="margin-top:8px;"><textarea id="pv-ajuste-txt" rows="3" placeholder="Ex.: informar o valor do vale-refeição e o horário de sábado."></textarea></div>
              <button type="button" class="btn btn-secondary btn-sm" id="pv-ajuste">Enviar pedido de ajuste</button>
            </details>`
          : ""
      }
      <div id="pv-resultado"></div>
      <div id="pv-erro" class="form-erro hidden"></div>
      ${(s.historico || []).length ? `<details style="margin-top:10px;"><summary class="sub">Histórico</summary><ul class="funil-historico">${s.historico.slice().reverse().map((h) => `<li>${dataHora(h.em)} · ${esc(h.acao)}${h.por ? ` · ${esc(h.por)}` : ""}</li>`).join("")}</ul></details>` : ""}
      <div class="modal-close-row">
        ${s.status !== "Validado" ? `<button type="button" class="btn btn-outline" id="pv-arquivar" style="margin-right:auto;">${s.status === "Arquivado" ? "Desarquivar" : "Arquivar"}</button>` : ""}
        <button type="button" class="btn btn-outline" id="pv-fechar">Fechar</button>
      </div>`);
    const $ = (id) => document.getElementById(id);
    const erro = (m) => {
      $("pv-erro").textContent = m;
      $("pv-erro").classList.toggle("hidden", !m);
    };
    $("pv-fechar").addEventListener("click", fecharModal);
    $("pv-copiar-link").addEventListener("click", () => copiar(s.link, "Link do cliente copiado."));
    const ir = $("pv-ir-funil");
    if (ir) ir.addEventListener("click", fecharModal);
    const arq = $("pv-arquivar");
    if (arq)
      arq.addEventListener("click", async () => {
        try {
          await api.post(`/api/solicitacoes-vaga/${s.id}/arquivar`, { desarquivar: s.status === "Arquivado" });
          fecharModal();
          carregar();
        } catch (e) {
          erro(e.message);
        }
      });
    if (!podeValidar) return;
    let empresaId = s.empresaSugerida ? s.empresaSugerida.id : s.empresaId || "";
    criarCombobox($("pv-empresa"), {
      opcoes: store.empresas.map((e) => ({ valor: e.id, rotulo: e.nome })),
      valor: empresaId,
      opcaoVazia: `➕ Cadastrar nova: ${s.dados.empresa.nome}`,
      placeholder: "Digite o nome da empresa...",
      aoEscolher: (v) => (empresaId = v),
    });
    $("pv-validar").addEventListener("click", async () => {
      erro("");
      const btn = $("pv-validar");
      btn.disabled = true;
      btn.textContent = "Validando...";
      try {
        const r = await api.post(`/api/solicitacoes-vaga/${s.id}/validar`, {
          empresaId,
          consultorId: $("pv-consultor").value,
          prazoFechamento: $("pv-prazo").value,
          prioridade: $("pv-prioridade").value,
          mensagem: $("pv-msg").value,
        });
        if (!store.empresas.some((e) => e.id === r.vaga.empresaId)) store.empresas = await api.get("/api/empresas");
        document.querySelector(".pv-validar").outerHTML = "";
        const aj = document.querySelector(".pv-ajuste");
        if (aj) aj.remove();
        $("pv-resultado").innerHTML = `<div class="funil-final aprovado">✅ Perfil validado! A vaga <strong>${esc(r.vaga.titulo)}</strong> foi criada no Backlog, com o perfil completo e a página de divulgação preenchidos.</div>
          <div class="sub" style="margin:6px 0;">${r.email.ok ? "✉️ Confirmação enviada por e-mail ao cliente." : `✉️ E-mail não enviado (${esc(r.email.erro)}).`} Envie também pelo WhatsApp:</div>
          <a class="btn btn-primary" href="${esc(r.linkWhatsapp)}" target="_blank" rel="noopener">💬 Enviar confirmação pelo WhatsApp</a>`;
        showToast("Perfil validado e vaga criada.", "sucesso");
        carregar();
      } catch (e) {
        erro(e.message);
        btn.disabled = false;
        btn.textContent = "✅ Validar e criar vaga";
      }
    });
    $("pv-ajuste").addEventListener("click", async () => {
      erro("");
      try {
        const r = await api.post(`/api/solicitacoes-vaga/${s.id}/ajuste`, { mensagem: $("pv-ajuste-txt").value });
        $("pv-resultado").innerHTML = `<div class="ponto-aviso">✏️ Pedido de ajuste registrado. ${r.email.ok ? "O cliente recebeu por e-mail." : `E-mail não enviado (${esc(r.email.erro)}).`}</div>
          <a class="btn btn-primary btn-sm" style="margin-top:6px;" href="${esc(r.linkWhatsapp)}" target="_blank" rel="noopener">💬 Enviar pedido pelo WhatsApp</a>`;
        carregar();
      } catch (e) {
        erro(e.message);
      }
    });
  }

  // ---------- Gerar link para um cliente ----------
  function convite() {
    abrirModal(`
      <h2>🔗 Gerar link para o cliente</h2>
      <div class="sub" style="margin-bottom:10px;">O link fica ligado ao e-mail e WhatsApp do contato; os dados da empresa já vão preenchidos para ele conferir.</div>
      <div class="form-row"><label>Empresa (se já for cliente)</label><div id="cv-empresa"></div></div>
      <div class="form-row" id="cv-nome-row"><label>Nome da empresa (cliente novo)</label><input type="text" id="cv-empresa-nome" /></div>
      <div class="form-cols">
        <div class="form-row"><label>Nome do contato</label><input type="text" id="cv-contato" /></div>
        <div class="form-row"><label>Cargo da vaga <span class="sub">(opcional)</span></label><input type="text" id="cv-cargo" /></div>
      </div>
      <div class="form-cols">
        <div class="form-row"><label>WhatsApp do contato</label><input type="tel" id="cv-whats" placeholder="(85) 90000-0000" /></div>
        <div class="form-row"><label>E-mail do contato</label><input type="email" id="cv-email" /></div>
      </div>
      <div id="cv-resultado"></div>
      <div id="cv-erro" class="form-erro hidden"></div>
      <div class="modal-close-row">
        <button type="button" class="btn btn-outline" id="cv-fechar">Fechar</button>
        <button type="button" class="btn btn-primary" id="cv-gerar">Gerar link</button>
      </div>`);
    const $ = (id) => document.getElementById(id);
    let empresaId = "";
    criarCombobox($("cv-empresa"), {
      opcoes: store.empresas.map((e) => ({ valor: e.id, rotulo: e.nome })),
      opcaoVazia: "— Cliente novo —",
      placeholder: "Digite o nome da empresa...",
      aoEscolher: (v) => {
        empresaId = v;
        const e = store.empresas.find((x) => x.id === v) || {};
        $("cv-nome-row").style.display = v ? "none" : "";
        if (v) {
          $("cv-contato").value = e.contatoResponsavel || "";
          $("cv-whats").value = e.whatsappContato || "";
          $("cv-email").value = e.emailContato || "";
        }
      },
    });
    $("cv-fechar").addEventListener("click", fecharModal);
    $("cv-gerar").addEventListener("click", async () => {
      $("cv-erro").classList.add("hidden");
      try {
        const r = await api.post("/api/solicitacoes-vaga/convite", {
          empresaId,
          empresaNome: $("cv-empresa-nome").value,
          contatoNome: $("cv-contato").value,
          cargo: $("cv-cargo").value,
          whatsapp: $("cv-whats").value,
          email: $("cv-email").value,
        });
        $("cv-gerar").remove();
        $("cv-resultado").innerHTML = `<div class="funil-final aprovado">✅ Link criado: <a href="${esc(r.link)}" target="_blank" rel="noopener">${esc(r.link)}</a></div>
          <div class="link-acoes" style="margin-top:8px;">
            <a class="btn btn-primary btn-sm" href="${esc(r.linkWhatsapp)}" target="_blank" rel="noopener">💬 Enviar pelo WhatsApp</a>
            <button type="button" class="btn btn-outline btn-sm" id="cv-copiar-msg">Copiar mensagem</button>
            <button type="button" class="btn btn-outline btn-sm" id="cv-copiar-link">Copiar só o link</button>
          </div>`;
        $("cv-copiar-msg").addEventListener("click", () => copiar(r.textoConvite, "Mensagem copiada."));
        $("cv-copiar-link").addEventListener("click", () => copiar(r.link, "Link copiado."));
        carregar();
      } catch (e) {
        $("cv-erro").textContent = e.message;
        $("cv-erro").classList.remove("hidden");
      }
    });
  }

  root.querySelector("#pv-convite").addEventListener("click", convite);
  root.querySelector("#pv-link-geral").addEventListener("click", () => copiar(linkGeral, "Link geral copiado — serve para qualquer cliente."));
  await carregar();
}
