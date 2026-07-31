// Captura a localização do navegador (usada no Controle de Ponto) de forma segura:
// nunca trava a tela esperando o usuário decidir a permissão, e nunca lança erro se
// o navegador não suportar geolocalização ou o usuário negar — só resolve null,
// e quem chamou segue em frente sem checagem de localização.
export function obterLocalizacao() {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 60000 }
    );
  });
}

export function linkMapa(lat, lng) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}
