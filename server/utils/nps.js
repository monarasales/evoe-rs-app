// Pesquisa de satisfação (NPS) enviada ao cliente quando a vaga é fechada.
//
// NPS (Net Promoter Score) segue a regra de mercado: pergunta "de 0 a 10, quanto você
// recomendaria a Evoé?"; 9–10 = promotores, 7–8 = neutros, 0–6 = detratores;
// NPS = % promotores − % detratores (vai de −100 a +100).
// Os critérios (atendimento, qualidade, prazo, atualização, consultor) são notas de 1 a 5.
// Funções de cálculo PURAS — testes em test/nps.test.js.

const CRITERIOS = [
  { id: "atendimento", nome: "Atendimento" },
  { id: "qualidade", nome: "Qualidade da seleção" },
  { id: "prazo", nome: "Prazo" },
  { id: "atualizacao", nome: "Atualização do processo" },
  { id: "consultor", nome: "Consultor(a)" },
];

const categoria = (nota) => (nota >= 9 ? "promotor" : nota >= 7 ? "neutro" : "detrator");

/** Valida as respostas do cliente. Lança Error com mensagem amigável. */
function validarRespostas(b = {}) {
  const r = { criterios: {} };
  for (const c of CRITERIOS) {
    const n = Number(b.criterios && b.criterios[c.id]);
    if (!Number.isInteger(n) || n < 1 || n > 5) throw new Error(`Dê uma nota de 1 a 5 para "${c.nome}".`);
    r.criterios[c.id] = n;
  }
  const nps = Number(b.nps);
  if (!Number.isInteger(nps) || nps < 0 || nps > 10) throw new Error("Responda de 0 a 10 o quanto recomendaria a Evoé.");
  r.nps = nps;
  r.feedback = String(b.feedback || "").trim().slice(0, 3000);
  r.respondente = String(b.respondente || "").trim().slice(0, 120);
  return r;
}

/** Resumo de um conjunto de respostas: NPS, distribuição e médias por critério. */
function resumir(respostas) {
  const n = respostas.length;
  const cont = { promotor: 0, neutro: 0, detrator: 0 };
  const somas = Object.fromEntries(CRITERIOS.map((c) => [c.id, 0]));
  for (const r of respostas) {
    cont[categoria(r.nps)]++;
    for (const c of CRITERIOS) somas[c.id] += r.criterios[c.id];
  }
  const pct = (x) => (n ? Math.round((x / n) * 1000) / 10 : 0);
  return {
    respostas: n,
    nps: n ? Math.round(((cont.promotor - cont.detrator) / n) * 100) : null,
    promotores: cont.promotor,
    neutros: cont.neutro,
    detratores: cont.detrator,
    pctPromotores: pct(cont.promotor),
    pctNeutros: pct(cont.neutro),
    pctDetratores: pct(cont.detrator),
    medias: Object.fromEntries(CRITERIOS.map((c) => [c.id, n ? Math.round((somas[c.id] / n) * 10) / 10 : null])),
    mediaGeral: n ? Math.round((CRITERIOS.reduce((t, c) => t + somas[c.id], 0) / (n * CRITERIOS.length)) * 10) / 10 : null,
  };
}

/** Zona do NPS (faixas usadas no mercado). */
function zona(nps) {
  if (nps == null) return null;
  if (nps >= 75) return "Excelência";
  if (nps >= 50) return "Qualidade";
  if (nps >= 0) return "Aperfeiçoamento";
  return "Crítica";
}

module.exports = { CRITERIOS, categoria, validarRespostas, resumir, zona };
