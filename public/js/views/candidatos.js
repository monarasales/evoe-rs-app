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
const ORIGENS = ["", "LinkedIn", "Indicação", "Banco de talentos", "Site / formulário", "Instagram", "WhatsApp", "Outra"];

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
      <select id="cand-filtro-etapa" class="input-toolbar"><option value="">Todas as etapas</option></select>
    </div>
    <div id="cand-contagem" class="sub" style="margin-bottom:8px;"></div>
    <div id="candidatos-tabela"><div class="empty-state">Carregando...</div></div>
  `;

  const vagas = await api.get("/api/vagas");
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
  const filtroEtapa = root.querySelector("#cand-filtro-etapa");
  filtroEtapa.innerHTML += store.etapasCandidato.map((e) => `<option>${escapeHtml(e)}</option>`).join("");

  const cbFiltro = criarCombobox(root.querySelector("#cand-filtro-vaga"), {
    opcoes: opcoesVaga(vagas),
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
      .filter((c) => !filtroVaga || c.vagaId === filtroVaga)
      .filter((c) => !filtroEtapa.value || c.etapaCandidato === filtroEtapa.value)
      .filter((c) => {
        if (!q) return true;
        const texto = [c.nome, c.email, c.telefone, c.cidade, c.linkedin, c.parecerComportamental, c.obsReferencia, ...(c.pareceres || []).map((p) => p.texto)].join(" ");
        const digitos = q.replace(/\D/g, "");
        return normalizar(texto).includes(q) || (digitos.length >= 4 && String(c.telefone || "").replace(/\D/g, "").includes(digitos));
      })
      .sort((a, b) => normalizar(a.nome).localeCompare(normalizar(b.nome), "pt-BR"));
  }

  function montarTabela() {
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
          <tr><th>Candidato</th><th>Empresa · Vaga</th><th>Etapa</th><th>Currículo</th><th>Pareceres</th><th>Entrevista</th><th></th></tr>
        </thead>
        <tbody>
          ${lista
            .map((c) => {
              const v = vagaPorId(c.vagaId);
              const nPareceres = (c.pareceres || []).length + ((c.parecerComportamental || "").trim() ? 1 : 0);
              return `
            <tr data-id="${c.id}">
              <td><strong>${escapeHtml(c.nome)}</strong><div class="sub">${escapeHtml([c.telefone, c.email].filter(Boolean).join(" · "))}</div></td>
              <td>${v ? `${escapeHtml(empresaNome(v.empresaId))}<div class="sub">${escapeHtml(v.titulo)}</div>` : "—"}</td>
              <td>${escapeHtml(c.etapaCandidato)}</td>
              <td>${c.curriculo ? `<a href="/api/candidatos/${c.id}/curriculo" target="_blank" rel="noopener" title="${escapeHtml(c.curriculo.nomeOriginal)}">📄 abrir</a>` : '<span class="sub">—</span>'}</td>
              <td>${nPareceres ? `💬 ${nPareceres}` : '<span class="sub">—</span>'}${c.jusbrasilOk ? ' <span title="Referência/Jusbrasil OK">✅</span>' : ""}</td>
              <td>${c.dataEntrevista ? dataBr(c.dataEntrevista) : "—"}</td>
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
  filtroEtapa.addEventListener("change", montarTabela);
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
              ? `<div class="cand-vaga-atual">${escapeHtml(vagaPorId(c.vagaId) ? rotuloVaga(vagaPorId(c.vagaId)) : "Vaga removida")}</div>`
              : '<label>Empresa / vaga *</label><div id="c-vaga"></div><div class="sub" style="margin-top:4px;">Digite a primeira letra da empresa ou do cargo.</div>'
          }
        </div>
        <div class="form-row">
          <label>Etapa do candidato</label>
          <select id="c-etapa">
            ${store.etapasCandidato.map((e) => `<option ${(c.etapaCandidato || "Inscrito") === e ? "selected" : ""}>${escapeHtml(e)}</option>`).join("")}
          </select>
        </div>

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

        <div class="section-title">Currículo</div>
        <div id="c-curriculo-atual">${blocoCurriculo(c)}</div>
        <div class="form-row">
          <label>${c.curriculo ? "Substituir currículo" : "Anexar currículo"}</label>
          <input type="file" id="c-curriculo" accept=".pdf,.doc,.docx,.odt,.rtf,.txt,.jpg,.jpeg,.png" />
          <div class="sub" style="margin-top:4px;">PDF, Word ou imagem, até 8 MB. Ao substituir, o anterior continua guardado.</div>
        </div>

        <div class="section-title">Avaliação</div>
        <div class="form-cols">
          <div class="form-row"><label>Data da entrevista</label><input type="text" id="c-data-entrevista" inputmode="numeric" maxlength="10" placeholder="dd/mm/aaaa" value="${c.dataEntrevista ? dataBr(c.dataEntrevista) : ""}" /></div>
          <div class="form-row"><label>Retorno do cliente</label><input type="text" id="c-data-retorno" inputmode="numeric" maxlength="10" placeholder="dd/mm/aaaa" value="${c.dataRetornoCliente ? dataBr(c.dataRetornoCliente) : ""}" /></div>
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
      const arquivo = $("c-curriculo").files[0];
      if (!editando && !vagaEscolhida) return mostrarErro("Escolha a vaga (digite a empresa ou o cargo).");
      if (!nome) return mostrarErro("Informe o nome do candidato.");
      if (dataEntrevista === null || dataRetornoCliente === null) return mostrarErro("Datas no formato dd/mm/aaaa (ex.: 15/10/2026).");
      if (arquivo && arquivo.size > 8 * 1024 * 1024) return mostrarErro("O currículo passa de 8 MB.");

      const payload = {
        nome,
        email: $("c-email").value.trim(),
        telefone: $("c-telefone").value.trim(),
        cidade: $("c-cidade").value.trim(),
        linkedin: $("c-linkedin").value.trim(),
        origem: $("c-origem").value,
        pretensaoSalarial: $("c-pretensao").value.trim(),
        etapaCandidato: $("c-etapa").value,
        dataEntrevista: dataEntrevista || null,
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
          salvo = await api.post("/api/candidatos", { ...payload, vagaId: vagaEscolhida });
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
