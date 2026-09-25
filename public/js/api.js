async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  const texto = await res.text();
  if (texto) {
    try {
      data = JSON.parse(texto);
    } catch (e) {
      data = null;
    }
  }

  if (!res.ok) {
    const msg = (data && data.erro) || `Erro ${res.status} ao chamar ${url}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  get: (url) => request("GET", url),
  post: (url, body) => request("POST", url, body || {}),
  patch: (url, body) => request("PATCH", url, body || {}),
  del: (url) => request("DELETE", url),
};
