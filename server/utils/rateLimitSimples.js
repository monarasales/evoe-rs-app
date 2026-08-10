// Limitador de taxa bem simples, em memória (sem dependência extra), pra reduzir o
// risco de abuso em rotas PÚBLICAS (sem login) como o formulário de solicitação de
// vaga. Não é à prova de ataque sério (reinicia a cada deploy, não distingue IPs
// atrás do mesmo proxy corporativo), mas cobre o caso comum de alguém apertando
// "enviar" várias vezes ou um bot simples martelando o endpoint.
const acessos = new Map();

function limitarTaxa({ chave, maxTentativas, janelaMs }) {
  const agora = Date.now();
  const registro = acessos.get(chave);

  if (!registro || agora > registro.resetaEm) {
    acessos.set(chave, { contagem: 1, resetaEm: agora + janelaMs });
    return { permitido: true };
  }

  if (registro.contagem >= maxTentativas) {
    return { permitido: false, tentarEmMs: registro.resetaEm - agora };
  }

  registro.contagem += 1;
  return { permitido: true };
}

// Limpeza periódica pra não crescer pra sempre (a cada 30 min, remove o que já expirou).
setInterval(() => {
  const agora = Date.now();
  for (const [chave, registro] of acessos.entries()) {
    if (agora > registro.resetaEm) acessos.delete(chave);
  }
}, 30 * 60 * 1000).unref();

module.exports = { limitarTaxa };
