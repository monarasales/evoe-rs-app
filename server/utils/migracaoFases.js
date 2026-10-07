// Migração única: dá a cada candidato antigo o campo "fase" (funil novo) a partir da
// etapa antiga. Idempotente e só ACRESCENTA campos — "etapaCandidato" original fica
// intacto, e "faseMigradaDe" registra de onde veio.

const db = require("../db");
const { FASE_DA_ETAPA_ANTIGA } = require("./constants");

function migrarFasesCandidatos() {
  const candidatos = db.readCollection("candidatos");
  let alterados = 0;
  for (const c of candidatos) {
    if (c.fase) continue;
    c.fase = FASE_DA_ETAPA_ANTIGA[c.etapaCandidato] || "Recrutamento";
    c.faseMigradaDe = c.etapaCandidato || null;
    if (c.fase === "Reprovado" && !c.reprovacao) {
      c.reprovacao = {
        fase: c.etapaCandidato === "Reprovado pelo Cliente" ? "Seleção com gestor" : "Seleção com RH",
        motivo: c.etapaCandidato === "Reprovado pelo Cliente" ? "Reprovado pelo cliente" : "Outro",
        observacao: `Convertido da etapa antiga "${c.etapaCandidato}".`,
        em: c.updatedAt || null,
        por: "Migração automática",
      };
    }
    c.historicoFases = c.historicoFases || [{ fase: c.fase, em: new Date().toISOString(), por: "Migração automática", obs: `Etapa antiga: ${c.etapaCandidato || "—"}` }];
    alterados++;
  }
  if (alterados) {
    db.writeCollection("candidatos", candidatos);
    console.log(`[candidatos] ${alterados} candidato(s) convertido(s) para o funil novo (etapa antiga preservada).`);
  }
}

module.exports = { migrarFasesCandidatos };
