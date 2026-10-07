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
        raiz.innerHTML = `
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
})();
