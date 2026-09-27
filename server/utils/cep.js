// Busca de endereço por CEP e de coordenadas (lat/long) por endereço.
//
// - buscarCep: tenta ViaCEP e, se falhar/não achar, BrasilAPI. Nunca lança erro —
//   devolve null quando não encontra, para o cadastro seguir com o endereço digitado.
// - geocodificarEndereco: converte endereço em coordenadas via OpenStreetMap
//   (Nominatim), usadas para validar o ponto em dia de home office. Também nunca
//   lança erro: sem coordenadas o ponto apenas não valida a distância de casa.

const TIMEOUT_MS = 6000;

function limparCep(cep) {
  return String(cep || "").replace(/\D/g, "");
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function viaCep(cep) {
  const d = await getJson(`https://viacep.com.br/ws/${cep}/json/`);
  if (d.erro) return null;
  return { logradouro: d.logradouro || "", bairro: d.bairro || "", cidade: d.localidade || "", estado: d.uf || "" };
}

async function brasilApi(cep) {
  const d = await getJson(`https://brasilapi.com.br/api/cep/v2/${cep}`);
  const coords = d.location && d.location.coordinates;
  return {
    logradouro: d.street || "",
    bairro: d.neighborhood || "",
    cidade: d.city || "",
    estado: d.state || "",
    lat: coords && coords.latitude ? Number(coords.latitude) : null,
    long: coords && coords.longitude ? Number(coords.longitude) : null,
  };
}

/** Retorna { cep, logradouro, bairro, cidade, estado } ou null se não encontrar. */
async function buscarCep(cep) {
  const limpo = limparCep(cep);
  if (limpo.length !== 8) return null;
  for (const fonte of [viaCep, brasilApi]) {
    try {
      const r = await fonte(limpo);
      if (r && r.cidade) return { cep: limpo, ...r };
    } catch (err) {
      console.warn(`[cep] ${fonte.name} falhou para ${limpo}: ${err.message}`);
    }
  }
  return null;
}

/** Retorna { lat, long } ou null. */
async function geocodificarEndereco({ logradouro, numero, cidade, estado, cep }) {
  if (!cidade) return null;
  const tentativas = [
    { street: [numero, logradouro].filter(Boolean).join(" "), city: cidade, state: estado },
    { city: cidade, state: estado, postalcode: limparCep(cep) },
  ];
  for (const t of tentativas) {
    const params = new URLSearchParams({ format: "json", limit: "1", countrycodes: "br" });
    Object.entries(t).forEach(([k, v]) => v && params.set(k, v));
    try {
      const r = await getJson(`https://nominatim.openstreetmap.org/search?${params}`, {
        "User-Agent": "evoe-rs-app/1.0 (sistema interno Evoé Gestão e RH)",
      });
      if (r[0]) return { lat: Number(r[0].lat), long: Number(r[0].lon) };
    } catch (err) {
      console.warn(`[cep] geocodificação falhou: ${err.message}`);
    }
  }
  return null;
}

module.exports = { buscarCep, geocodificarEndereco, limparCep };
