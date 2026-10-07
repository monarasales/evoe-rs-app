// Página pública de vagas e inscrição (sem login).
//   /vagas          -> lista de vagas com inscrições abertas
//   /vaga/<código>  -> descrição da vaga + formulário de inscrição com currículo

(function () {
  const raiz = document.getElementById("conteudo");
  const esc = (s) => {
    const d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  };

  async function api(url, opcoes) {
    const r = await fetch(url, opcoes);
    let dados = null;
    try {
      dados = await r.json();
    } catch (e) {
      /* sem corpo */
    }
    if (!r.ok) throw new Error((dados && dados.erro) || "Não foi possível concluir. Tente novamente em instantes.");
    return dados;
  }

  const partes = location.pathname.split("/").filter(Boolean);
  if (partes[0] === "vaga" && partes[1]) paginaVaga(decodeURIComponent(partes[1]));
  else if (partes[0] === "disc" && partes[1]) paginaDisc(decodeURIComponent(partes[1]));
  else listaVagas();

  // ---------- Lista ----------
  async function listaVagas() {
    document.title = "Vagas abertas — Evoé Gestão e RH";
    try {
      const vagas = await api("/api/publico/vagas");
      raiz.innerHTML = `
        <h1>Vagas abertas</h1>
        <div class="empresa">Escolha uma vaga e envie seu currículo.</div>
        ${
          vagas.length
            ? vagas
                .map(
                  (v) => `<a class="cartao vaga-item" href="/vaga/${encodeURIComponent(v.token)}">
                    <h3>${esc(v.titulo)}</h3>
                    <div class="empresa" style="margin:0;">${v.empresa ? esc(v.empresa) : "Empresa confidencial"}</div>
                    <div class="ver">Ver vaga e se inscrever →</div>
                  </a>`
                )
                .join("")
            : '<div class="cartao vazio">No momento não há vagas com inscrições abertas. Volte em breve!</div>'
        }`;
    } catch (err) {
      raiz.innerHTML = `<div class="cartao vazio">${esc(err.message)}</div>`;
    }
  }

  // ---------- Vaga + inscrição ----------
  async function paginaVaga(token) {
    let vaga;
    let termo;
    try {
      [vaga, termo] = await Promise.all([api(`/api/publico/vagas/${encodeURIComponent(token)}`), api("/api/publico/termo")]);
    } catch (err) {
      raiz.innerHTML = `<div class="cartao vazio">${esc(err.message)}<br><br><a href="/vagas">Ver todas as vagas abertas</a></div>`;
      return;
    }
    document.title = `${vaga.titulo} — Evoé Gestão e RH`;
    const cabecalho = `
      <h1>${esc(vaga.titulo)}</h1>
      <div class="empresa">${vaga.empresa ? esc(vaga.empresa) : "Empresa confidencial"} · processo conduzido pela Evoé Gestão e RH</div>
      ${vaga.descricao ? `<div class="cartao descricao">${esc(vaga.descricao)}</div>` : ""}`;

    if (!vaga.aberta) {
      raiz.innerHTML = `${cabecalho}<div class="cartao vazio">As inscrições para esta vaga estão encerradas. Obrigado pelo interesse!<br><br><a href="/vagas">Ver outras vagas abertas</a></div>`;
      return;
    }

    raiz.innerHTML = `${cabecalho}
      <form class="cartao" id="form" novalidate>
        <h2 style="margin-top:0;">Inscreva-se</h2>
        <label for="nome">Nome completo</label><input type="text" id="nome" autocomplete="name" required />
        <div class="linha">
          <div><label for="email">E-mail</label><input type="email" id="email" autocomplete="email" required /></div>
          <div><label for="telefone">Telefone / WhatsApp</label><input type="tel" id="telefone" autocomplete="tel" inputmode="numeric" maxlength="15" placeholder="(85) 90000-0000" required /></div>
        </div>
        <div class="linha">
          <div><label for="cidade">Cidade <span class="opc">(opcional)</span></label><input type="text" id="cidade" autocomplete="address-level2" /></div>
          <div><label for="pretensao">Pretensão salarial <span class="opc">(opcional)</span></label><input type="text" id="pretensao" placeholder="ex.: R$ 2.500" /></div>
        </div>
        <label for="linkedin">LinkedIn <span class="opc">(opcional)</span></label><input type="text" id="linkedin" placeholder="linkedin.com/in/seu-perfil" />
        <label>Currículo</label>
        <label class="arquivo" id="caixa-arquivo" for="curriculo" style="margin:0;font-weight:400;">
          <input type="file" id="curriculo" accept=".pdf,.doc,.docx,.odt,.rtf,.txt,.jpg,.jpeg,.png" />
          <div id="texto-arquivo">📎 <strong>Toque para anexar seu currículo</strong><div class="dica">PDF, Word ou foto, até 8 MB</div></div>
        </label>
        <label for="mensagem">Quer contar algo mais? <span class="opc">(opcional)</span></label><textarea id="mensagem" maxlength="2000"></textarea>
        <div class="armadilha" aria-hidden="true"><label>Website<input type="text" id="website" tabindex="-1" autocomplete="off" /></label></div>
        <label class="termo"><input type="checkbox" id="consentimento" /><span>${esc(termo.texto)}</span></label>
        <div id="erro" class="erro hidden"></div>
        <button type="submit" class="botao" id="enviar">Enviar inscrição</button>
      </form>`;

    const $ = (id) => document.getElementById(id);
    $("telefone").addEventListener("input", (e) => {
      const d = e.target.value.replace(/\D/g, "").slice(0, 11);
      e.target.value =
        d.length <= 2 ? (d ? `(${d}` : "") : d.length <= 6 ? `(${d.slice(0, 2)}) ${d.slice(2)}` : d.length <= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    });
    $("curriculo").addEventListener("change", () => {
      const f = $("curriculo").files[0];
      $("caixa-arquivo").classList.toggle("tem", !!f);
      $("texto-arquivo").innerHTML = f
        ? `✅ <strong>${esc(f.name)}</strong><div class="dica">Toque para trocar o arquivo</div>`
        : '📎 <strong>Toque para anexar seu currículo</strong><div class="dica">PDF, Word ou foto, até 8 MB</div>';
    });

    // Some com o aviso de erro assim que o candidato corrige algo.
    $("form").addEventListener("input", () => $("erro").classList.add("hidden"));
    $("form").addEventListener("change", () => $("erro").classList.add("hidden"));

    const mostrarErro = (msg) => {
      $("erro").textContent = msg;
      $("erro").classList.remove("hidden");
      $("erro").scrollIntoView({ behavior: "smooth", block: "center" });
    };

    $("form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      $("erro").classList.add("hidden");
      const arquivo = $("curriculo").files[0];
      const nome = $("nome").value.trim();
      const email = $("email").value.trim();
      if (nome.length < 3) return mostrarErro("Informe seu nome completo.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return mostrarErro("Informe um e-mail válido.");
      if ($("telefone").value.replace(/\D/g, "").length < 10) return mostrarErro("Informe um telefone/WhatsApp com DDD.");
      if (!arquivo) return mostrarErro("Anexe seu currículo.");
      if (arquivo.size > 8 * 1024 * 1024) return mostrarErro("O currículo passa de 8 MB. Envie um arquivo menor (um PDF costuma ser bem leve).");
      if (!$("consentimento").checked) return mostrarErro("Para se inscrever, marque a autorização de uso dos dados (LGPD).");

      const botao = $("enviar");
      botao.disabled = true;
      botao.textContent = "Enviando...";
      try {
        const conteudoBase64 = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result).split(",")[1] || "");
          r.onerror = () => reject(new Error("Não foi possível ler o arquivo. Tente outro."));
          r.readAsDataURL(arquivo);
        });
        const r = await api(`/api/publico/vagas/${encodeURIComponent(token)}/inscricao`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nome,
            email,
            telefone: $("telefone").value,
            cidade: $("cidade").value,
            pretensaoSalarial: $("pretensao").value,
            linkedin: $("linkedin").value,
            mensagem: $("mensagem").value,
            website: $("website").value,
            consentimento: true,
            curriculo: { nomeArquivo: arquivo.name, conteudoBase64 },
          }),
        });
        raiz.innerHTML = r.discUrl
          ? `
          <div class="cartao sucesso">
            <div class="icone">✅</div>
            <h1>Inscrição recebida!</h1>
            <p>Obrigado, ${esc(nome.split(" ")[0])}! Recebemos seu currículo para a vaga <strong>${esc(vaga.titulo)}</strong>.</p>
            <div class="proxima">
              <div class="etapa">Próxima etapa</div>
              <h2 style="margin:4px 0 6px;">Teste de perfil comportamental (DISC)</h2>
              <p style="margin:0;">São 24 perguntas rápidas, cerca de 8 minutos. Não existe resposta certa ou errada — responda pensando em como você realmente é.</p>
            </div>
            <a class="botao" href="${esc(r.discUrl)}">Fazer o teste agora</a>
            <p class="dica" style="margin-top:12px;">Prefere fazer depois? Guarde este link: <br><strong>${esc(location.origin + r.discUrl)}</strong></p>
          </div>`
          : `
          <div class="cartao sucesso">
            <div class="icone">🎉</div>
            <h1>${r.atualizada ? "Inscrição atualizada!" : "Inscrição enviada!"}</h1>
            <p>Obrigado, ${esc(nome.split(" ")[0])}! Recebemos seu currículo para a vaga <strong>${esc(vaga.titulo)}</strong>.
            Se o seu perfil seguir no processo, nossa equipe entra em contato pelo telefone ou e-mail informados.</p>
            <a class="botao" href="/vagas">Ver outras vagas abertas</a>
          </div>`;
        window.scrollTo(0, 0);
      } catch (err) {
        mostrarErro(err.message);
        botao.disabled = false;
        botao.textContent = "Enviar inscrição";
      }
    });
  }

  // ---------- Teste DISC ----------
  async function paginaDisc(token) {
    document.title = "Teste de perfil comportamental — Evoé Gestão e RH";
    let dados;
    try {
      dados = await api(`/api/publico/disc/${encodeURIComponent(token)}`);
    } catch (err) {
      raiz.innerHTML = `<div class="cartao vazio">${esc(err.message)}</div>`;
      return;
    }
    if (dados.concluido) return telaFinal(dados.primeiroNome, dados.resumo, true);

    const CHAVE = `evoe-disc-${token}`;
    let estado = { atual: 0, respostas: {}, iniciadoEm: null };
    try {
      estado = { ...estado, ...JSON.parse(localStorage.getItem(CHAVE) || "{}") };
    } catch (e) {
      /* sem armazenamento: segue do zero */
    }
    const salvar = () => {
      try {
        localStorage.setItem(CHAVE, JSON.stringify(estado));
      } catch (e) {
        /* ignora */
      }
    };
    const total = dados.perguntas.length;

    function telaInicio() {
      raiz.innerHTML = `
        <div class="cartao">
          <div class="etapa">Etapa do processo seletivo${dados.vaga ? ` · ${esc(dados.vaga)}` : ""}</div>
          <h1>Olá, ${esc(dados.primeiroNome)}! 👋</h1>
          <p>Este é um teste de <strong>perfil comportamental (DISC)</strong>. Ele ajuda a entender seu jeito de trabalhar e se relacionar.</p>
          <div class="como">
            <div><strong>Como funciona:</strong> são ${total} grupos de 4 palavras.</div>
            <div>Em cada grupo, marque a palavra que <span class="tag-mais">MAIS</span> combina com você e a que <span class="tag-menos">MENOS</span> combina.</div>
            <div>Não existe resposta certa ou errada. Responda rápido, pensando em como você é no dia a dia — e não em como gostaria de ser.</div>
            <div>Leva cerca de 8 minutos. Se a página fechar, suas respostas ficam salvas neste aparelho.</div>
          </div>
          <button class="botao" id="comecar">${Object.keys(estado.respostas).length ? "Continuar o teste" : "Começar o teste"}</button>
        </div>`;
      document.getElementById("comecar").addEventListener("click", () => {
        if (!estado.iniciadoEm) estado.iniciadoEm = new Date().toISOString();
        salvar();
        telaPergunta();
      });
    }

    function telaPergunta() {
      const p = dados.perguntas[estado.atual];
      const r = estado.respostas[p.grupo] || {};
      const pct = Math.round((Object.keys(estado.respostas).filter((g) => estado.respostas[g].mais && estado.respostas[g].menos).length / total) * 100);
      raiz.innerHTML = `
        <div class="progresso"><div class="progresso-barra" style="width:${pct}%"></div></div>
        <div class="etapa" style="text-align:center;margin:8px 0 14px;">Grupo ${estado.atual + 1} de ${total}</div>
        <div class="cartao">
          <div class="disc-cabeca"><span></span><span class="tag-mais">MAIS</span><span class="tag-menos">MENOS</span></div>
          ${p.opcoes
            .map(
              (o) => `<div class="disc-linha">
                <div class="disc-palavra">${esc(o.texto)}</div>
                <button type="button" class="disc-btn mais ${r.mais === o.id ? "on" : ""}" data-tipo="mais" data-id="${o.id}" aria-label="Mais: ${esc(o.texto)}">👍</button>
                <button type="button" class="disc-btn menos ${r.menos === o.id ? "on" : ""}" data-tipo="menos" data-id="${o.id}" aria-label="Menos: ${esc(o.texto)}">👎</button>
              </div>`
            )
            .join("")}
          <div class="dica" style="text-align:center;margin-top:10px;">Marque 1 palavra em MAIS e 1 palavra diferente em MENOS.</div>
        </div>
        <div class="disc-nav">
          <button type="button" class="botao secundario" id="voltar" ${estado.atual === 0 ? "disabled" : ""}>← Voltar</button>
          <button type="button" class="botao" id="avancar" ${r.mais && r.menos ? "" : "disabled"}>${estado.atual === total - 1 ? "Concluir" : "Próximo →"}</button>
        </div>
        <div id="erro" class="erro hidden"></div>`;

      raiz.querySelectorAll(".disc-btn").forEach((b) =>
        b.addEventListener("click", () => {
          const resp = (estado.respostas[p.grupo] = { ...(estado.respostas[p.grupo] || {}) });
          const outro = b.dataset.tipo === "mais" ? "menos" : "mais";
          resp[b.dataset.tipo] = b.dataset.id;
          if (resp[outro] === b.dataset.id) delete resp[outro]; // mesma palavra não pode ser MAIS e MENOS
          salvar();
          const completo = resp.mais && resp.menos;
          telaPergunta();
          if (completo && estado.atual < total - 1) setTimeout(() => avancar(), 350);
        })
      );
      document.getElementById("voltar").addEventListener("click", () => {
        estado.atual = Math.max(0, estado.atual - 1);
        salvar();
        telaPergunta();
      });
      document.getElementById("avancar").addEventListener("click", avancar);
    }

    let avancando = false;
    async function avancar() {
      if (avancando) return;
      const p = dados.perguntas[estado.atual];
      const r = estado.respostas[p.grupo] || {};
      if (!r.mais || !r.menos) return;
      if (estado.atual < total - 1) {
        estado.atual++;
        salvar();
        telaPergunta();
        window.scrollTo(0, 0);
        return;
      }
      avancando = true;
      const botao = document.getElementById("avancar");
      botao.disabled = true;
      botao.textContent = "Enviando...";
      try {
        const resp = await api(`/api/publico/disc/${encodeURIComponent(token)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            iniciadoEm: estado.iniciadoEm,
            respostas: dados.perguntas.map((q) => ({ grupo: q.grupo, ...estado.respostas[q.grupo] })),
          }),
        });
        try {
          localStorage.removeItem(CHAVE);
        } catch (e) {
          /* ignora */
        }
        telaFinal(dados.primeiroNome, resp.resumo, false);
      } catch (err) {
        avancando = false;
        const e = document.getElementById("erro");
        e.textContent = err.message;
        e.classList.remove("hidden");
        botao.disabled = false;
        botao.textContent = "Concluir";
      }
    }

    telaInicio();
  }

  function telaFinal(nome, resumo, jaFeito) {
    raiz.innerHTML = `
      <div class="cartao sucesso">
        <div class="icone">🌟</div>
        <h1>${jaFeito ? "Teste já concluído" : "Teste concluído!"}</h1>
        <p>Obrigado, ${esc(nome)}! ${jaFeito ? "Já recebemos suas respostas." : "Suas respostas foram enviadas para a equipe da Evoé."}</p>
        ${
          resumo
            ? `<div class="proxima"><div class="etapa">Seu perfil predominante</div><h2 style="margin:4px 0 6px;">${esc(resumo.titulo)}</h2><p style="margin:0;">${esc(resumo.texto)}</p></div>`
            : ""
        }
        <p class="dica">Se o seu perfil seguir no processo, nossa equipe entra em contato.</p>
        <a class="botao" href="/vagas">Ver vagas abertas</a>
      </div>`;
    window.scrollTo(0, 0);
  }
})();
