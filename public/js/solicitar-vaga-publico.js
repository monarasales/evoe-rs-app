// Página pública de solicitação de vaga — sem login, sem depender do resto da SPA
// (router.js, state.js etc.), por isso é um script simples e independente.
(function () {
  const form = document.getElementById("form-solicitar-vaga");
  const erroBox = document.getElementById("sv-erro");
  const btnEnviar = document.getElementById("sv-btn-enviar");

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    erroBox.classList.add("hidden");

    const payload = {
      nomeEmpresa: document.getElementById("sv-empresa").value.trim(),
      cnpj: document.getElementById("sv-cnpj").value.trim(),
      contatoResponsavel: document.getElementById("sv-contato").value.trim(),
      emailContato: document.getElementById("sv-email").value.trim(),
      whatsappContato: document.getElementById("sv-whatsapp").value.trim(),
      tituloVaga: document.getElementById("sv-titulo").value.trim(),
      perfilVaga: document.getElementById("sv-perfil").value.trim(),
      salario: document.getElementById("sv-salario").value,
      prazoDesejado: document.getElementById("sv-prazo").value.trim(),
      observacoes: document.getElementById("sv-obs").value.trim(),
      website: document.getElementById("sv-website").value, // honeypot
    };

    if (!payload.emailContato && !payload.whatsappContato) {
      erroBox.textContent = "Informe pelo menos um contato: e-mail ou WhatsApp.";
      erroBox.classList.remove("hidden");
      return;
    }

    btnEnviar.disabled = true;
    btnEnviar.textContent = "Enviando...";
    try {
      const resposta = await fetch("/api/solicitacoes-vaga", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        throw new Error(dados.erro || "Não foi possível enviar sua solicitação. Tente novamente.");
      }
      form.classList.add("hidden");
      document.getElementById("sv-sucesso").classList.remove("hidden");
    } catch (err) {
      erroBox.textContent = err.message;
      erroBox.classList.remove("hidden");
      btnEnviar.disabled = false;
      btnEnviar.textContent = "Enviar solicitação";
    }
  });
})();
