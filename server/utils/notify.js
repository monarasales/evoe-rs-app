// Central de notificações interna do sistema.
// Nesta fase local, toda notificação é gravada em data/notificacoes.json e aparece
// no sininho da interface. Quando o app for para a internet, esta é a função a
// estender para também disparar e-mail/WhatsApp reais (ver README.md).

const db = require("./../db");

function notify({ tipo, vagaId = null, destinatarioId, assunto, mensagem }) {
  if (!destinatarioId) return null;
  return db.insert("notificacoes", {
    tipo,
    canal: "Sistema",
    vagaId,
    destinatarioId,
    assunto,
    mensagem,
    dataEnvio: new Date().toISOString().slice(0, 10),
    lida: false,
  });
}

/** Notifica tanto o consultor responsável pela vaga quanto todos os gestores
 * ativos, sempre que a vaga é criada, editada ou muda de etapa — exceto quem
 * acabou de fazer a própria alteração (essa pessoa já sabe, não precisa se
 * autonotificar). Usada em toda mudança de vaga (criação, edição, etapa). */
function notifyMudancaVaga({ vaga, atorId, tipo, assunto, mensagem }) {
  const consultores = db.readCollection("consultores");
  const gestoresAtivos = consultores.filter(
    (c) => (c.perfil === "Gestor" || c.perfil === "Supervisora") && c.ativo
  );

  const destinatarios = new Set();
  if (vaga.consultorId) destinatarios.add(vaga.consultorId);
  gestoresAtivos.forEach((g) => destinatarios.add(g.id));
  if (atorId) destinatarios.delete(atorId);

  destinatarios.forEach((destinatarioId) => {
    notify({ tipo, vagaId: vaga.id, destinatarioId, assunto, mensagem });
  });
}

module.exports = { notify, notifyMudancaVaga };
