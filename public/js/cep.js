// Busca de endereço por CEP via ViaCEP (gratuito, sem chave). Chamado direto do
// navegador (fetch), não passa pelo nosso backend — é uma consulta pública simples,
// sem dado sensível envolvido.
export async function buscarCep(cep) {
  const digits = String(cep || "").replace(/\D/g, "");
  if (digits.length !== 8) return null;
  try {
    const resp = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    if (!resp.ok) return null;
    const dados = await resp.json();
    if (dados.erro) return null;
    return {
      logradouro: dados.logradouro || "",
      bairro: dados.bairro || "",
      cidade: dados.localidade || "",
      uf: dados.uf || "",
    };
  } catch (err) {
    return null;
  }
}
