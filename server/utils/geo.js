// Geocodificação de endereço (texto -> latitude/longitude) via Nominatim (OpenStreetMap),
// serviço gratuito e sem necessidade de chave de API. Só é chamado quando um endereço é
// cadastrado ou alterado (o resultado fica cacheado no próprio consultor) — nunca a cada
// batida de ponto. Falha graciosa: se o serviço estiver fora do ar, sem internet, ou o
// endereço não for encontrado, retorna null e o cadastro/ponto continuam funcionando
// normalmente, só sem a checagem automática de distância para aquele endereço.
async function geocodificarEndereco(endereco) {
  if (!endereco || !endereco.trim()) return null;
  try {
    // countrycodes=br restringe a busca ao Brasil — sem isso, um nome de rua comum
    // (ex: "Rua das Flores") pode "casar" com um resultado em outro país e o pino
    // sair a milhares de km do endereço real, fazendo o Controle de Ponto marcar
    // toda batida como "fora do local" mesmo com a pessoa no lugar certo.
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(endereco.trim())}`;
    const resposta = await fetch(url, {
      headers: {
        // Exigido pela política de uso do Nominatim: identifica o app fazendo a chamada.
        "User-Agent": "EvoeGestaoRH/1.0 (sistema interno de RH - contato: administrativo@evoegestaorh.com.br)",
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!resposta.ok) return null;
    const dados = await resposta.json();
    if (!Array.isArray(dados) || dados.length === 0) return null;
    const lat = Number(dados[0].lat);
    const lng = Number(dados[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch (err) {
    return null;
  }
}

// Distância em metros entre duas coordenadas (fórmula de Haversine) — usada para
// comparar onde o ponto foi batido com o endereço de referência cadastrado.
function distanciaMetros(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

module.exports = { geocodificarEndereco, distanciaMetros };
