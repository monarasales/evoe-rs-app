// Candidatos — banco de talentos da Evoé.
// Lista com busca (nome, e-mail, telefone, cidade, parecer), filtro de vaga com
// busca alfabética por empresa/vaga, cadastro completo com currículo e pareceres
// dos consultores, e inclusão do mesmo candidato em outra vaga.
// Regra do sistema: nada se perde — a edição só envia os campos da tela e o
// servidor faz merge com o que já existe.

import { api } from "../api.js";
import { store, showToast, podeGerenciarVagas } from "../state.js";
import { abrirModal, fecharModal } from "../modal.js";
import { criarCombobox } from "../combobox.js";
import { campoData, brParaIso, dataBr } from "../pontoUtil.js";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

const normalizar = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const ENCERRADA = (v) => /^1[12]\./.test(v.etapaAtual || "");
const ORIGENS = ["", "Link da vaga", "LinkedIn", "Indicação", "Banco de talentos", "Site / formulário", "Instagram", "WhatsApp", "Outra"];

function telefoneMascara(valor) {
  const d = String(valor || "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function tamanhoArquivo(bytes) {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function lerArquivoBase64(arquivo) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    r.readAsDataURL(arquivo);
  });
}

export async function renderCandidatos(root, params) {
  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Candidatos</h2>
        <div class="sub">Banco de talentos: candidatos de todas as vagas, com currículo e pareceres.</div>
      </div>
      <button id="btn-novo-candidato" class="btn btn-primary">+ Novo Candidato</button>
    </div>
    <div class="cand-filtros">
      <input type="search" id="cand-busca" class="input-toolbar" placeholder="🔍 Buscar por nome, e-mail, telefone, cidade ou parecer" />
      <div id="cand-filtro-vaga"></div>
    </div>
    <div class="funil-chips" id="cand-funil"></div>
    <div id="cand-contagem" class="sub" style="margin-bottom:8px;"></div>
    <div id="candidatos-tabela"><div class="empty-state">Carregando...</div></div>
  `;

  const [vagas, fasesInfo] = await Promise.all([api.get("/api/vagas"), api.get("/api/candidatos/fases")]);
  const FASES = fasesInfo.fases;
  const FINAIS = fasesInfo.finais;
  const CAMINHO = FASES.filter((f) => !FINAIS.includes(f));
  motivosReprovacao = fasesInfo.motivos;
  const empresaNome = (id) => (store.empresas.find((e) => e.id === id) || {}).nome || "Sem empresa";
  const vagaPorId = (id) => vagas.find((v) => v.id === id);
  const rotuloVaga = (v) => `${empresaNome(v.empresaId)} — ${v.titulo}`;
  const opcoesVaga = (lista) =>
    lista.map((v) => ({
      valor: v.id,
      rotulo: rotuloVaga(v),
      termos: [empresaNome(v.empresaId), v.titulo],
      detalhe: `${v.etapaAtual || ""}${ENCERRADA(v) ? " · encerrada" : ""}`,
      apagada: ENCERRADA(v),
    }));
  // Recrutador só cadastra nas próprias vagas (o servidor também confere).
  const vagasQuePodeEditar = () => (podeGerenciarVagas() ? vagas : vagas.filter((v) => v.consultorId === store.usuario.id));

  let todos = [];
  let filtroVaga = params.vagaId || "";
  const busca = root.querySelector("#cand-busca");
  let filtroFase = "";

  const cbFiltro = criarCombobox(root.querySelector("#cand-filtro-vaga"), {
    opcoes: [{ valor: "__banco__", rotulo: "★ Banco de talentos (sem vaga)", termos: ["banco", "talentos"], detalhe: "Cadastros espontâneos pela página de vagas" }, ...opcoesVaga(vagas)],
    valor: filtroVaga,
    opcaoVazia: "Todas as vagas",
    placeholder: "Vaga: digite a empresa ou o cargo",
    aoEscolher: (v) => {
      filtroVaga = v;
      montarTabela();
    },
  });

  async function carregar() {
    todos = await api.get("/api/candidatos");
    montarTabela();
  }

  function filtrados() {
    const q = normalizar(busca.value.trim());
    return todos
      .filter((c) => !filtroVaga || (filtroVaga === "__banco__" ? !c.vagaId : c.vagaId === filtroVaga))
      .filter((c) => !filtroFase || (c.fase || "Recrutamento") === filtroFase)
      .filter((c) => {
        if (!q) return true;
        const texto = [c.nome, c.email, c.telefone, c.cidade, c.linkedin, c.areaInteresse, c.parecerComportamental, c.obsReferencia, ...(c.pareceres || []).map((p) => p.texto)].join(" ");
        const digitos = q.replace(/\D/g, "");
        return normalizar(texto).includes(q) || (digitos.length >= 4 && String(c.telefone || "").replace(/\D/g, "").includes(digitos));
      })
      .sort((a, b) => normalizar(a.nome).localeCompare(normalizar(b.nome), "pt-BR"));
  }

  // Contadores do funil (respeitam vaga e busca, não a fase escolhida).
  function desenharFunil() {
    const salvo = filtroFase;
    filtroFase = "";
    const base = filtrados();
    filtroFase = salvo;
    const conta = (f) => base.filter((c) => (c.fase || "Recrutamento") === f).length;
    root.querySelector("#cand-funil").innerHTML =
      `<button type="button" class="funil-chip ${!filtroFase ? "ativo" : ""}" data-fase="">Todas <strong>${base.length}</strong></button>` +
      FASES.map((f) => `<button type="button" class="funil-chip fase-${classeFase(f)} ${filtroFase === f ? "ativo" : ""}" data-fase="${escapeHtml(f)}">${escapeHtml(f)} <strong>${conta(f)}</strong></button>`).join("");
    root.querySelectorAll(".funil-chip").forEach((b) =>
      b.addEventListener("click", () => {
        filtroFase = b.dataset.fase;
        montarTabela();
      })
    );
  }

  function montarTabela() {
    desenharFunil();
    const el = root.querySelector("#candidatos-tabela");
    const lista = filtrados();
    root.querySelector("#cand-contagem").textContent = `${lista.length} candidato(s)${lista.length !== todos.length ? ` de ${todos.length}` : ""}`;
    if (lista.length === 0) {
      el.innerHTML = '<div class="empty-state">Nenhum candidato encontrado.</div>';
      return;
    }
    el.innerHTML = `
      <div class="tabela-rolavel"><table>
        <thead>
          <tr><th>Candidato</th><th>Empresa · Vaga</th><th>Fase</th><th>DISC</th><th>Currículo</th><th>Pareceres</th><th>Entrevistas</th><th></th></tr>
        </thead>
        <tbody>
          ${lista
            .map((c) => {
              const v = vagaPorId(c.vagaId);
              const nPareceres = (c.pareceres || []).length + ((c.parecerComportamental || "").trim() ? 1 : 0);
              return `
            <tr data-id="${c.id}">
              <td><strong>${escapeHtml(c.nome)}</strong>${c.inscritoPeloLink ? ' <span class="tag tag-prospect-contato" title="Inscrito pelo link da vaga">link</span>' : ""}<div class="sub">${escapeHtml([c.telefone, c.email].filter(Boolean).join(" · "))}</div></td>
              <td>${v ? `${escapeHtml(empresaNome(v.empresaId))}<div class="sub">${escapeHtml(v.titulo)}</div>` : !c.vagaId ? `<span class="tag tag-standby">Banco de talentos</span>${c.areaInteresse ? `<div class="sub">${escapeHtml(c.areaInteresse)}</div>` : ""}` : "—"}</td>
              <td>${tagFase(c)}</td>
              <td>${c.disc ? `<span class="tag disc-tag disc-${c.disc.resultado.primario}" title="Perfil DISC">${escapeHtml(c.disc.resultado.perfil)}</span>` : c.discToken ? '<span class="sub" title="Link do teste enviado, aguardando resposta">⏳</span>' : '<span class="sub">—</span>'}</td>
              <td>${c.curriculo ? `<a href="/api/candidatos/${c.id}/curriculo" target="_blank" rel="noopener" title="${escapeHtml(c.curriculo.nomeOriginal)}">📄 abrir</a>` : '<span class="sub">—</span>'}</td>
              <td>${nPareceres ? `💬 ${nPareceres}` : '<span class="sub">—</span>'}${c.jusbrasilOk ? ' <span title="Referência/Jusbrasil OK">✅</span>' : ""}</td>
              <td class="sub">${[c.dataEntrevista ? `RH ${dataBr(c.dataEntrevista)}` : "", c.dataEntrevistaCliente ? `Cliente ${dataBr(c.dataEntrevistaCliente)}` : ""].filter(Boolean).join("<br>") || "—"}</td>
              <td><button class="btn btn-outline btn-sm btn-editar">Abrir</button></td>
            </tr>`;
            })
            .join("")}
        </tbody>
      </table></div>
    `;
    el.querySelectorAll(".btn-editar").forEach((btn) =>
      btn.addEventListener("click", (e) => {
        const id = e.target.closest("tr").dataset.id;
        abrirFormularioCandidato(todos.find((c) => c.id === id));
      })
    );
  }

  let espera;
  busca.addEventListener("input", () => {
    clearTimeout(espera);
    espera = setTimeout(montarTabela, 150);
  });

  root.querySelector("#btn-novo-candidato").addEventListener("click", () => abrirFormularioCandidato(null));

  await carregar();

  // ======================= Formulário (novo / editar) =======================
  function abrirFormularioCandidato(candidato) {
    const editando = !!candidato;
    const c = candidato || {};
    const v = (campo) => escapeHtml(c[campo] || "");
    const podeEditar = !editando || podeGerenciarVagas() || (vagaPorId(c.vagaId) || {}).consultorId === store.usuario.id;

    abrirModal(`
      <h2>${editando ? escapeHtml(c.nome) : "Novo Candidato"}</h2>
      <form id="form-candidato" class="form-candidato" novalidate>
        <div class="section-title" style="margin-top:0;">Vaga</div>
        <div class="form-row">
          ${
            editando
              ? `<div class="cand-vaga-atual">${escapeHtml(vagaPorId(c.vagaId) ? rotuloVaga(vagaPorId(c.vagaId)) : !c.vagaId ? `Banco de talentos${c.areaInteresse ? ` — interesse: ${c.areaInteresse}` : ""}` : "Vaga removida")}</div>${!c.vagaId ? '<div class="sub" style="margin-top:4px;">Para colocar no processo de uma vaga, use "Incluir em outra vaga" no fim deste cadastro.</div>' : ""}`
              : '<label>Empresa / vaga *</label><div id="c-vaga"></div><div class="sub" style="margin-top:4px;">Digite a primeira letra da empresa ou do cargo.</div>'
          }
        </div>
        ${
          editando
            ? `<div class="section-title">Funil do candidato</div><div id="c-funil">${blocoFunil(c)}</div>`
            : `<div class="form-row"><label>Fase inicial</label>
                <select id="c-fase-inicial">${CAMINHO.map((f) => `<option ${f === "Recrutamento" ? "selected" : ""}>${escapeHtml(f)}</option>`).join("")}</select></div>`
        }

        <div class="section-title">Dados do candidato</div>
        <div class="form-row"><label>Nome completo *</label><input type="text" id="c-nome" value="${v("nome")}" /></div>
        <div class="form-cols">
          <div class="form-row"><label>E-mail</label><input type="email" id="c-email" value="${v("email")}" /></div>
          <div class="form-row"><label>Telefone / WhatsApp</label><input type="tel" id="c-telefone" inputmode="numeric" maxlength="15" placeholder="(85) 90000-0000" value="${v("telefone")}" /></div>
        </div>
        <div class="form-cols">
          <div class="form-row"><label>Cidade</label><input type="text" id="c-cidade" value="${v("cidade")}" /></div>
          <div class="form-row"><label>LinkedIn</label><input type="text" id="c-linkedin" placeholder="linkedin.com/in/..." value="${v("linkedin")}" /></div>
        </div>
        <div class="form-cols">
          <div class="form-row"><label>Como chegou</label>
            <select id="c-origem">${[...new Set([...ORIGENS, c.origem || ""])].map((o) => `<option value="${escapeHtml(o)}" ${(c.origem || "") === o ? "selected" : ""}>${o ? escapeHtml(o) : "—"}</option>`).join("")}</select>
          </div>
          <div class="form-row"><label>Pretensão salarial</label><input type="text" id="c-pretensao" placeholder="ex.: R$ 2.500" value="${v("pretensaoSalarial")}" /></div>
        </div>

        ${
          c.consentimentoLgpd || c.mensagemCandidato
            ? `<div class="cand-inscricao">
                ${c.inscritoPeloLink ? "🔗 Inscrito(a) pelo link da vaga" : c.cadastroEspontaneo ? "⭐ Cadastro espontâneo no banco de talentos" : "Dados enviados pelo candidato"}${c.consentimentoLgpd ? ` · consentimento LGPD em ${new Date(c.consentimentoLgpd.aceitoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : ""}
                ${(c.reinscricoes || []).length ? ` · reenviou ${c.reinscricoes.length}x` : ""}
                ${c.mensagemCandidato ? `<div class="parecer-texto" style="margin-top:6px;"><strong>Mensagem do candidato:</strong> ${escapeHtml(c.mensagemCandidato)}</div>` : ""}
              </div>`
            : ""
        }
        <div class="section-title">Currículo</div>
        <div id="c-curriculo-atual">${blocoCurriculo(c)}</div>
        <div class="form-row">
          <label>${c.curriculo ? "Substituir currículo" : "Anexar currículo"}</label>
          <input type="file" id="c-curriculo" accept=".pdf,.doc,.docx,.odt,.rtf,.txt,.jpg,.jpeg,.png" />
          <div class="sub" style="margin-top:4px;">PDF, Word ou imagem, até 8 MB. Ao substituir, o anterior continua guardado.</div>
        </div>

        ${editando ? `<div class="section-title">Teste DISC</div><div id="c-disc">${blocoDisc(c)}</div>` : ""}

        <div class="section-title">Datas do processo</div>
        <div class="form-cols tres">
          <div class="form-row"><label>Entrevista com a consultoria</label><input type="text" id="c-data-entrevista" inputmode="numeric" maxlength="10" placeholder="dd/mm/aaaa" value="${c.dataEntrevista ? dataBr(c.dataEntrevista) : ""}" /></div>
          <div class="form-row"><label>Entrevista com o cliente</label><input type="text" id="c-data-entrevista-cliente" inputmode="numeric" maxlength="10" placeholder="dd/mm/aaaa" value="${c.dataEntrevistaCliente ? dataBr(c.dataEntrevistaCliente) : ""}" /></div>
          <div class="form-row"><label>Retorno do cliente</label><input type="text" id="c-data-retorno" inputmode="numeric" maxlength="10" placeholder="dd/mm/aaaa" value="${c.dataRetornoCliente ? dataBr(c.dataRetornoCliente) : ""}" /></div>
        </div>

        <div class="section-title">Avaliação</div>
        <div class="avaliacoes">
          <div class="avaliacao-box">
            <div class="avaliacao-topo"><strong>Avaliação da consultoria</strong> ${seletorNota("c-nota-consultoria", c.notaConsultoria)}</div>
            <textarea id="c-av-consultoria" rows="4" placeholder="Avaliação da Evoé na entrevista: competências, pontos fortes, pontos de atenção, aderência à vaga...">${v("avaliacaoConsultoria")}</textarea>
          </div>
          <div class="avaliacao-box">
            <div class="avaliacao-topo"><strong>Avaliação da empresa (cliente)</strong> ${seletorNota("c-nota-empresa", c.notaEmpresa)}</div>
            <textarea id="c-av-empresa" rows="4" placeholder="Devolutiva do cliente após a entrevista com o gestor...">${v("avaliacaoEmpresa")}</textarea>
          </div>
        </div>
        <div class="form-row"><label>Parecer comportamental</label><textarea id="c-parecer" rows="3">${v("parecerComportamental")}</textarea></div>
        <div class="form-row checkbox-row">
          <input type="checkbox" id="c-jusbrasil" ${c.jusbrasilOk ? "checked" : ""} />
          <label for="c-jusbrasil" style="margin:0;">Checagem de referência e Jusbrasil OK</label>
        </div>
        <div class="form-row"><label>Observações da checagem de referência</label><textarea id="c-obs-referencia" rows="2">${v("obsReferencia")}</textarea></div>

        <div class="section-title">Pareceres dos consultores</div>
        <div id="c-pareceres">${listaPareceres(c)}</div>
        <div class="form-row">
          <label>${editando ? "Novo parecer" : "Parecer do consultor"}</label>
          <textarea id="c-novo-parecer" rows="3" placeholder="Impressões da entrevista, pontos fortes, pontos de atenção..."></textarea>
          ${editando ? '<button type="button" class="btn btn-secondary btn-sm" id="c-add-parecer" style="margin-top:6px;">Adicionar parecer</button>' : ""}
        </div>

        ${
          editando
            ? `<div class="section-title">Incluir em outra vaga</div>
               <div class="cand-copiar">
                 <div id="c-copiar-vaga" style="flex:1;"></div>
                 <button type="button" class="btn btn-outline btn-sm" id="c-copiar">Incluir</button>
               </div>
               <div class="sub" style="margin-top:4px;">Cria o candidato na outra vaga com os mesmos dados e currículo; este cadastro continua como está.</div>`
            : ""
        }

        <div id="candidato-form-erro" class="form-erro hidden" style="margin-top:12px;"></div>
        <div class="modal-close-row">
          ${editando && podeEditar ? '<button type="button" id="btn-excluir-candidato" class="btn btn-danger" style="margin-right:auto;">Excluir</button>' : ""}
          <button type="button" id="btn-cancelar-c" class="btn btn-outline">Fechar</button>
          ${podeEditar ? `<button type="submit" class="btn btn-primary">${editando ? "Salvar" : "Adicionar"}</button>` : ""}
        </div>
      </form>
    `);

    const $ = (id) => document.getElementById(id);
    const erroBox = $("candidato-form-erro");
    const mostrarErro = (msg) => {
      erroBox.textContent = msg;
      erroBox.classList.remove("hidden");
      erroBox.scrollIntoView({ block: "nearest" });
    };
    $("c-telefone").addEventListener("input", (e) => (e.target.value = telefoneMascara(e.target.value)));
    campoData($("c-data-entrevista"));
    campoData($("c-data-retorno"));
    campoData($("c-data-entrevista-cliente"));
    $("btn-cancelar-c").addEventListener("click", fecharModal);

    let vagaEscolhida = editando ? c.vagaId : filtroVaga && vagasQuePodeEditar().some((x) => x.id === filtroVaga) ? filtroVaga : "";
    if (!editando) {
      criarCombobox($("c-vaga"), {
        opcoes: opcoesVaga(vagasQuePodeEditar()),
        valor: vagaEscolhida,
        placeholder: "Digite a empresa ou o cargo...",
        aoEscolher: (val) => (vagaEscolhida = val),
      });
    }

    if (editando) {
      ligarFunil(c);
      ligarDisc(c);
      ligarPareceres(c);
      let vagaCopia = "";
      criarCombobox($("c-copiar-vaga"), {
        opcoes: opcoesVaga(vagasQuePodeEditar().filter((x) => x.id !== c.vagaId)),
        placeholder: "Escolha a outra vaga...",
        aoEscolher: (val) => (vagaCopia = val),
      });
      $("c-copiar").addEventListener("click", async () => {
        if (!vagaCopia) return mostrarErro("Escolha a vaga de destino.");
        try {
          await api.post(`/api/candidatos/${c.id}/copiar`, { vagaId: vagaCopia });
          showToast(`${c.nome} incluído(a) na outra vaga.`, "sucesso");
          await carregar();
        } catch (err) {
          mostrarErro(err.message);
        }
      });
      const btnExcluir = $("btn-excluir-candidato");
      if (btnExcluir) {
        btnExcluir.addEventListener("click", async () => {
          if (!confirm(`Excluir ${c.nome} desta vaga? Os dados deste cadastro serão apagados (o currículo continua guardado no servidor).`)) return;
          try {
            await api.del(`/api/candidatos/${c.id}`);
            fecharModal();
            showToast("Candidato excluído.", "sucesso");
            carregar();
          } catch (err) {
            showToast(err.message, "erro");
          }
        });
      }
    }

    function ligarFunil(cand) {
      const area = $("c-funil");
      const mover = async (fase, extra = {}) => {
        try {
          Object.assign(cand, await api.post(`/api/candidatos/${cand.id}/fase`, { fase, ...extra }));
          area.innerHTML = blocoFunil(cand);
          ligarFunil(cand);
          carregar();
          showToast(`${cand.nome}: ${fase}.`, "sucesso");
        } catch (err) {
          mostrarErro(err.message);
        }
      };
      area.querySelectorAll("[data-ir]").forEach((b) =>
        b.addEventListener("click", () => {
          const fase = b.dataset.ir;
          if (b.dataset.confirmar && !confirm(`Mover ${cand.nome} para "${fase}"?`)) return;
          mover(fase);
        })
      );
      const btnReprovar = area.querySelector("#funil-reprovar");
      if (btnReprovar)
        btnReprovar.addEventListener("click", () => {
          area.querySelector("#funil-painel-reprovar").classList.toggle("hidden");
        });
      const confirmar = area.querySelector("#funil-confirmar-reprovar");
      if (confirmar)
        confirmar.addEventListener("click", () => {
          const motivo = area.querySelector("#funil-motivo").value;
          if (!motivo) return mostrarErro("Escolha o motivo da reprovação.");
          mover("Reprovado", { motivo, observacao: area.querySelector("#funil-obs").value });
        });
      const devolutiva = area.querySelector("#funil-devolutiva");
      if (devolutiva)
        devolutiva.addEventListener("click", () => {
          const vaga = vagaPorId(cand.vagaId);
          const tel = String(cand.telefone || "").replace(/\D/g, "");
          const texto =
            `Olá, ${(cand.nome || "").split(" ")[0]}! Agradecemos muito seu interesse e participação no processo seletivo` +
            `${vaga ? ` para a vaga de ${vaga.titulo}` : ""}. Neste momento, seguiremos com outros perfis mais aderentes aos requisitos da vaga. ` +
            `Seu currículo continuará em nosso banco de talentos para futuras oportunidades. Desejamos sucesso! — Evoé Gestão e RH`;
          window.open(`https://wa.me/${tel.length >= 10 ? "55" + tel : ""}?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
        });
    }

    function ligarDisc(cand) {
      const area = $("c-disc");
      const urlDisc = () => `${location.origin}/disc/${cand.discToken}`;
      const pedir = async (refazer) => {
        try {
          Object.assign(cand, await api.post(`/api/candidatos/${cand.id}/disc/link`, { refazer }));
          area.innerHTML = blocoDisc(cand);
          ligarDisc(cand);
          carregar();
          showToast(refazer ? "Novo link gerado. O resultado anterior ficou guardado no histórico." : "Link do teste DISC gerado.", "sucesso");
        } catch (err) {
          mostrarErro(err.message);
        }
      };
      const gerar = area.querySelector("#disc-gerar");
      if (gerar) gerar.addEventListener("click", () => pedir(false));
      const refazer = area.querySelector("#disc-refazer");
      if (refazer)
        refazer.addEventListener("click", () => {
          if (confirm(`Gerar um novo teste para ${cand.nome}? O resultado atual não será apagado: fica no histórico.`)) pedir(true);
        });
      const copiar = area.querySelector("#disc-copiar");
      if (copiar)
        copiar.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(urlDisc());
            showToast("Link do teste copiado.", "sucesso");
          } catch (e) {
            prompt("Copie o link:", urlDisc());
          }
        });
      const whats = area.querySelector("#disc-whats");
      if (whats)
        whats.addEventListener("click", () => {
          const tel = String(cand.telefone || "").replace(/\D/g, "");
          const texto = `Olá, ${(cand.nome || "").split(" ")[0]}! Uma das etapas do processo seletivo da Evoé Gestão e RH é o teste de perfil comportamental (DISC), leva cerca de 8 minutos: ${urlDisc()}`;
          window.open(`https://wa.me/${tel.length >= 10 ? "55" + tel : ""}?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
        });
    }

    function ligarPareceres(cand) {
      document.querySelectorAll("[data-remover-parecer]").forEach((b) =>
        b.addEventListener("click", async () => {
          if (!confirm("Remover este parecer?")) return;
          try {
            const atualizado = await api.del(`/api/candidatos/${cand.id}/pareceres/${b.dataset.removerParecer}`);
            Object.assign(cand, atualizado);
            $("c-pareceres").innerHTML = listaPareceres(cand);
            ligarPareceres(cand);
            carregar();
          } catch (err) {
            mostrarErro(err.message);
          }
        })
      );
      const add = $("c-add-parecer");
      if (add && !add.dataset.ligado) {
        add.dataset.ligado = "1";
        add.addEventListener("click", async () => {
          const texto = $("c-novo-parecer").value.trim();
          if (!texto) return mostrarErro("Escreva o parecer antes de adicionar.");
          try {
            const atualizado = await api.post(`/api/candidatos/${cand.id}/pareceres`, { texto });
            Object.assign(cand, atualizado);
            $("c-novo-parecer").value = "";
            $("c-pareceres").innerHTML = listaPareceres(cand);
            ligarPareceres(cand);
            showToast("Parecer adicionado.", "sucesso");
            carregar();
          } catch (err) {
            mostrarErro(err.message);
          }
        });
      }
    }

    $("form-candidato").addEventListener("submit", async (e) => {
      e.preventDefault();
      erroBox.classList.add("hidden");
      const nome = $("c-nome").value.trim();
      const dataEntrevista = brParaIso($("c-data-entrevista").value);
      const dataRetornoCliente = brParaIso($("c-data-retorno").value);
      const dataEntrevistaCliente = brParaIso($("c-data-entrevista-cliente").value);
      const arquivo = $("c-curriculo").files[0];
      if (!editando && !vagaEscolhida) return mostrarErro("Escolha a vaga (digite a empresa ou o cargo).");
      if (!nome) return mostrarErro("Informe o nome do candidato.");
      if (dataEntrevista === null || dataRetornoCliente === null || dataEntrevistaCliente === null) return mostrarErro("Datas no formato dd/mm/aaaa (ex.: 15/10/2026).");
      if (arquivo && arquivo.size > 8 * 1024 * 1024) return mostrarErro("O currículo passa de 8 MB.");

      const payload = {
        nome,
        email: $("c-email").value.trim(),
        telefone: $("c-telefone").value.trim(),
        cidade: $("c-cidade").value.trim(),
        linkedin: $("c-linkedin").value.trim(),
        origem: $("c-origem").value,
        pretensaoSalarial: $("c-pretensao").value.trim(),
        dataEntrevista: dataEntrevista || null,
        dataEntrevistaCliente: dataEntrevistaCliente || null,
        avaliacaoConsultoria: $("c-av-consultoria").value,
        notaConsultoria: $("c-nota-consultoria").value || null,
        avaliacaoEmpresa: $("c-av-empresa").value,
        notaEmpresa: $("c-nota-empresa").value || null,
        dataRetornoCliente: dataRetornoCliente || null,
        jusbrasilOk: $("c-jusbrasil").checked,
        obsReferencia: $("c-obs-referencia").value,
        parecerComportamental: $("c-parecer").value,
      };
      const btnSalvar = e.submitter || $("form-candidato").querySelector("button[type=submit]");
      btnSalvar.disabled = true;
      btnSalvar.textContent = "Salvando...";
      try {
        let salvo;
        if (editando) {
          salvo = await api.patch(`/api/candidatos/${c.id}`, payload);
        } else {
          salvo = await api.post("/api/candidatos", { ...payload, vagaId: vagaEscolhida, fase: $("c-fase-inicial").value });
        }
        const avisos = [];
        if (arquivo) {
          try {
            await api.post(`/api/candidatos/${salvo.id}/curriculo`, { nomeArquivo: arquivo.name, conteudoBase64: await lerArquivoBase64(arquivo) });
          } catch (err) {
            avisos.push(`Candidato salvo, mas o currículo não foi anexado: ${err.message}`);
          }
        }
        const parecerNovo = $("c-novo-parecer").value.trim();
        if (parecerNovo) {
          try {
            await api.post(`/api/candidatos/${salvo.id}/pareceres`, { texto: parecerNovo });
          } catch (err) {
            avisos.push(`Candidato salvo, mas o parecer não foi gravado: ${err.message}`);
          }
        }
        await carregar();
        window.__evoe.atualizarBadgeNotificacoes();
        if (avisos.length) {
          mostrarErro(avisos.join(" "));
          btnSalvar.disabled = false;
          btnSalvar.textContent = editando ? "Salvar" : "Adicionar";
          return;
        }
        fecharModal();
        if (!editando && filtroVaga && filtroVaga !== salvo.vagaId) {
          // Mostra a vaga onde o candidato acabou de entrar, para ele aparecer na lista.
          filtroVaga = salvo.vagaId;
          cbFiltro.definir(salvo.vagaId);
          montarTabela();
        }
        showToast(editando ? "Candidato atualizado." : "Candidato adicionado.", "sucesso");
      } catch (err) {
        mostrarErro(err.message);
        btnSalvar.disabled = false;
        btnSalvar.textContent = editando ? "Salvar" : "Adicionar";
      }
    });
  }
}

function blocoCurriculo(c) {
  if (!c.curriculo) return '<div class="sub" style="margin-bottom:8px;">Nenhum currículo anexado.</div>';
  const cv = c.curriculo;
  const anteriores = (c.curriculosAnteriores || [])
    .slice()
    .reverse()
    .map(
      (a) =>
        `<li><a href="/api/candidatos/${c.id}/curriculo?arquivo=${encodeURIComponent(a.arquivo)}" target="_blank" rel="noopener">${escapeHtml(a.nomeOriginal)}</a> <span class="sub">(${new Date(a.enviadoEm).toLocaleDateString("pt-BR")})</span></li>`
    )
    .join("");
  return `<div class="cand-cv">
      📄 <a href="/api/candidatos/${c.id}/curriculo" target="_blank" rel="noopener"><strong>${escapeHtml(cv.nomeOriginal)}</strong></a>
      <span class="sub">${tamanhoArquivo(cv.tamanho)} · enviado em ${new Date(cv.enviadoEm).toLocaleDateString("pt-BR")}${cv.enviadoPor ? ` por ${escapeHtml(cv.enviadoPor)}` : ""}</span>
      · <a href="/api/candidatos/${c.id}/curriculo?baixar=1">baixar</a>
      ${anteriores ? `<details style="margin-top:4px;"><summary class="sub">Versões anteriores</summary><ul>${anteriores}</ul></details>` : ""}
    </div>`;
}

function listaPareceres(c) {
  const lista = (c.pareceres || []).slice().reverse();
  if (!lista.length) return '<div class="sub" style="margin-bottom:8px;">Nenhum parecer de consultor ainda.</div>';
  const meuId = store.usuario.id;
  const gestao = ["Gestor", "Supervisora"].includes(store.usuario.perfil);
  return lista
    .map(
      (p) => `<div class="parecer-item">
        <div class="parecer-topo"><strong>${escapeHtml(p.autorNome || "Consultor")}</strong>
          <span class="sub">${new Date(p.criadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
          ${p.autorId === meuId || gestao ? `<button type="button" class="link-btn" data-remover-parecer="${p.id}" style="margin-left:auto;color:var(--danger);">remover</button>` : ""}
        </div>
        <div class="parecer-texto">${escapeHtml(p.texto)}</div>
      </div>`
    )
    .join("");
}

const NOMES_DISC = { D: "Dominância", I: "Influência", S: "Estabilidade", C: "Conformidade" };
const TITULOS_DISC = { D: "Executor", I: "Comunicador", S: "Planejador", C: "Analista" };

function blocoDisc(c) {
  const anteriores = (c.discAnteriores || [])
    .map(
      (d, i) =>
        `<li><a href="/api/candidatos/${c.id}/disc/relatorio?anterior=${i}" target="_blank" rel="noopener">${escapeHtml(d.resultado.perfil)} — ${new Date(d.concluidoEm).toLocaleDateString("pt-BR")}</a></li>`
    )
    .join("");
  const historico = anteriores ? `<details style="margin-top:6px;"><summary class="sub">Resultados anteriores</summary><ul>${anteriores}</ul></details>` : "";
  if (c.disc) {
    const r = c.disc.resultado;
    const barras = ["D", "I", "S", "C"]
      .map(
        (f) => `<div class="disc-barra"><span><strong>${f}</strong> ${NOMES_DISC[f]}</span>
          <div class="bar-track"><div class="bar-fill disc-fill-${f}" style="width:${Math.max(3, r.intensidade[f])}%"></div></div><strong>${r.intensidade[f]}</strong></div>`
      )
      .join("");
    return `<div class="disc-box">
      <div class="disc-topo"><span class="tag disc-tag disc-${r.primario}">${escapeHtml(r.perfil)}</span>
        <strong>${TITULOS_DISC[r.primario]}${r.secundario ? ` / ${TITULOS_DISC[r.secundario]}` : ""}</strong>
        <span class="sub">respondido em ${new Date(c.disc.concluidoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span></div>
      ${barras}
      <div class="link-acoes">
        <a class="btn btn-primary btn-sm" href="/api/candidatos/${c.id}/disc/relatorio" target="_blank" rel="noopener">Ver relatório completo / salvar PDF</a>
        <button type="button" class="btn btn-outline btn-sm" id="disc-refazer">Pedir novo teste</button>
      </div>
      ${historico}
    </div>`;
  }
  if (c.discToken) {
    return `<div class="disc-box">
      <div class="sub" style="margin-bottom:8px;">⏳ Link enviado${c.discSolicitadoEm ? ` em ${new Date(c.discSolicitadoEm).toLocaleDateString("pt-BR")}` : ""} — aguardando o candidato responder.</div>
      <div class="link-acoes">
        <button type="button" class="btn btn-primary btn-sm" id="disc-copiar">Copiar link do teste</button>
        <button type="button" class="btn btn-outline btn-sm" id="disc-whats">Enviar pelo WhatsApp</button>
      </div>
      ${historico}
    </div>`;
  }
  return `<div class="disc-box">
    <div class="sub" style="margin-bottom:8px;">Este candidato ainda não fez o teste DISC.</div>
    <button type="button" class="btn btn-secondary btn-sm" id="disc-gerar">Gerar link do teste DISC</button>
    ${historico}
  </div>`;
}

// ---------- Funil do candidato ----------
let motivosReprovacao = []; // vem do servidor (GET /api/candidatos/fases)
const ORDEM_FUNIL = ["Recrutamento", "Triagem", "Seleção com RH", "Checagem de referência", "Seleção com gestor", "Aprovado"];
const classeFase = (f) =>
  String(f || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, "-");

function tagFase(c) {
  const fase = c.fase || "Recrutamento";
  const titulo = fase === "Reprovado" && c.reprovacao ? `${c.reprovacao.motivo}${c.reprovacao.fase ? ` (na ${c.reprovacao.fase})` : ""}` : "";
  return `<span class="tag fase-tag fase-${classeFase(fase)}" title="${escapeHtml(titulo)}">${escapeHtml(fase)}</span>${
    fase === "Reprovado" && c.reprovacao ? `<div class="sub">${escapeHtml(c.reprovacao.motivo)}</div>` : ""
  }`;
}

function seletorNota(id, valor) {
  return `<select id="${id}" class="nota-select" title="Nota de 1 a 5">
    <option value="">Nota —</option>
    ${[5, 4, 3, 2, 1].map((n) => `<option value="${n}" ${Number(valor) === n ? "selected" : ""}>${"★".repeat(n)}${"☆".repeat(5 - n)}</option>`).join("")}
  </select>`;
}

function blocoFunil(c) {
  const fase = c.fase || "Recrutamento";
  const idx = ORDEM_FUNIL.indexOf(fase);
  const final = ["Aprovado", "Reprovado", "Desistiu"].includes(fase);
  const passos = ORDEM_FUNIL.map((f, i) => {
    const estado = f === fase ? "atual" : idx >= 0 && i < idx ? "feito" : "";
    return `<button type="button" class="funil-passo ${estado}" data-ir="${escapeHtml(f)}" data-confirmar="1" ${f === fase ? "disabled" : ""}>
      <span class="funil-bola">${estado === "feito" ? "✓" : i + 1}</span><span class="funil-nome">${escapeHtml(f)}</span></button>`;
  }).join("");
  const proxima = idx >= 0 && idx < ORDEM_FUNIL.length - 1 ? ORDEM_FUNIL[idx + 1] : null;
  const rotuloAvancar =
    fase === "Recrutamento" || fase === "Triagem" ? "✅ Aprovar na triagem" : proxima === "Aprovado" ? "🏆 Aprovar candidato" : `Avançar para ${proxima}`;
  const destinoAvancar = fase === "Recrutamento" || fase === "Triagem" ? "Seleção com RH" : proxima;
  const historico = (c.historicoFases || [])
    .slice()
    .reverse()
    .map(
      (h) =>
        `<li><strong>${escapeHtml(h.fase)}</strong> · ${h.em ? new Date(h.em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : ""}${h.por ? ` · ${escapeHtml(h.por)}` : ""}${h.motivo ? ` · motivo: ${escapeHtml(h.motivo)}` : ""}${h.obs ? ` · ${escapeHtml(h.obs)}` : ""}</li>`
    )
    .join("");
  const motivos = motivosReprovacao;
  return `<div class="funil-box">
    <div class="funil-passos">${passos}</div>
    ${
      fase === "Reprovado"
        ? `<div class="funil-final reprovado">❌ <strong>Reprovado</strong>${c.reprovacao ? ` na fase ${escapeHtml(c.reprovacao.fase || "—")} · ${escapeHtml(c.reprovacao.motivo)}${c.reprovacao.observacao ? ` — ${escapeHtml(c.reprovacao.observacao)}` : ""}${c.reprovacao.por ? ` <span class="sub">(${escapeHtml(c.reprovacao.por)}, ${new Date(c.reprovacao.em).toLocaleDateString("pt-BR")})</span>` : ""}` : ""}</div>`
        : fase === "Desistiu"
        ? '<div class="funil-final desistiu">🚪 <strong>Candidato desistiu</strong></div>'
        : fase === "Aprovado"
        ? '<div class="funil-final aprovado">🏆 <strong>Aprovado no processo</strong></div>'
        : ""
    }
    <div class="link-acoes" style="margin-top:10px;">
      ${!final && destinoAvancar ? `<button type="button" class="btn btn-primary btn-sm" data-ir="${escapeHtml(destinoAvancar)}" ${destinoAvancar === "Aprovado" ? 'data-confirmar="1"' : ""}>${rotuloAvancar}</button>` : ""}
      ${!final ? `<button type="button" class="btn btn-danger btn-sm" id="funil-reprovar">❌ Reprovar${fase === "Recrutamento" || fase === "Triagem" ? " na triagem" : ""}</button>` : ""}
      ${!final ? '<button type="button" class="btn btn-outline btn-sm" data-ir="Desistiu" data-confirmar="1">Desistiu</button>' : ""}
      ${final ? `<button type="button" class="btn btn-outline btn-sm" data-ir="${escapeHtml((c.reprovacao && c.reprovacao.fase) || "Triagem")}" data-confirmar="1">↩ Reativar candidato</button>` : ""}
      ${fase === "Reprovado" ? '<button type="button" class="btn btn-outline btn-sm" id="funil-devolutiva">Enviar devolutiva pelo WhatsApp</button>' : ""}
    </div>
    <div class="funil-reprovar hidden" id="funil-painel-reprovar">
      <div class="form-cols">
        <div class="form-row"><label>Motivo da reprovação</label><select id="funil-motivo"><option value="">Escolha...</option>${motivos.map((m) => `<option>${m}</option>`).join("")}</select></div>
        <div class="form-row"><label>Observação <span class="sub">(opcional, interna)</span></label><input type="text" id="funil-obs" maxlength="1000" /></div>
      </div>
      <button type="button" class="btn btn-danger btn-sm" id="funil-confirmar-reprovar">Confirmar reprovação</button>
    </div>
    ${c.faseMigradaDe ? `<div class="sub" style="margin-top:8px;">Etapa no modelo antigo: ${escapeHtml(c.faseMigradaDe)}</div>` : ""}
    ${historico ? `<details style="margin-top:6px;"><summary class="sub">Histórico do funil</summary><ul class="funil-historico">${historico}</ul></details>` : ""}
  </div>`;
}
