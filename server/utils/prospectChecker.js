// Lembrete diário de follow-up do CRM: avisa o Gestor dos prospects em aberto com
// follow-up para hoje ou atrasado. Um aviso por dia (resumo), para não poluir.

const db = require("../db");
const { notify } = require("./notify");

const hojeLocal = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10); // Fortaleza (UTC-3)

function checarFollowUps() {
  const hoje = hojeLocal();
  const pendentes = db
    .readCollection("prospects")
    .filter((p) => p.proximoFollowUp && p.proximoFollowUp <= hoje && !["Fechado", "Perdido"].includes(p.etapa));
  if (!pendentes.length) return;
  const param = db.readCollection("parametros").find((p) => p.chave === "avisoFollowUp");
  if (param && param.ultimoDia === hoje) return;
  const atrasados = pendentes.filter((p) => p.proximoFollowUp < hoje).length;
  const nomes = pendentes.slice(0, 5).map((p) => p.empresa || p.nome).join(", ");
  db.readCollection("consultores")
    .filter((c) => c.perfil === "Gestor" && c.ativo !== false)
    .forEach((g) =>
      notify({
        tipo: "Follow-up CRM",
        destinatarioId: g.id,
        assunto: `${pendentes.length} follow-up(s) de prospects para hoje`,
        mensagem: `${pendentes.length} prospect(s) aguardando contato${atrasados ? ` (${atrasados} atrasado(s))` : ""}: ${nomes}${pendentes.length > 5 ? "..." : ""}. Veja em CRM › Prospects.`,
      })
    );
  if (param) db.update("parametros", param.id, { ultimoDia: hoje });
  else db.insert("parametros", { chave: "avisoFollowUp", ultimoDia: hoje });
}

function startProspectChecker(intervaloMin = 60) {
  setTimeout(() => {
    try {
      checarFollowUps();
    } catch (e) {
      console.error("[crm]", e.message);
    }
  }, 60 * 1000);
  setInterval(() => {
    try {
      checarFollowUps();
    } catch (e) {
      console.error("[crm]", e.message);
    }
  }, intervaloMin * 60 * 1000);
}

module.exports = { checarFollowUps, startProspectChecker };
