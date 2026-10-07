// Relatório DISC em HTML pronto para imprimir / "Salvar como PDF" (uso interno).

const { PERFIS, FATORES, nomePerfil } = require("./disc");

const CORES = { D: "#d9534f", I: "#f0ad4e", S: "#3fb37f", C: "#3b7dd8" };

const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function relatorioDisc({ candidato, vaga, empresa }) {
  const d = candidato.disc;
  const r = d.resultado;
  const p = PERFIS[r.primario];
  const s = r.secundario ? PERFIS[r.secundario] : null;
  const data = new Date(d.concluidoEm).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", dateStyle: "short", timeStyle: "short" });
  const barras = FATORES.map(
    (f) => `<div class="barra">
      <div class="rotulo"><strong>${f}</strong> ${esc(PERFIS[f].nome)}</div>
      <div class="trilho"><div class="preenche" style="width:${r.intensidade[f]}%;background:${CORES[f]}"></div></div>
      <div class="valor">${r.intensidade[f]}</div>
    </div>`
  ).join("");
  const lista = (itens) => `<ul>${itens.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
  const bloco = (perfil, titulo) => `
    <h2>${titulo}: ${esc(perfil.nome)} — ${esc(perfil.titulo)}</h2>
    <p>${esc(perfil.resumo)}</p>
    <div class="duas">
      <div><h3>Pontos fortes</h3>${lista(perfil.fortes)}</div>
      <div><h3>Pontos de atenção</h3>${lista(perfil.atencao)}</div>
    </div>
    <p><strong>Como se comunicar:</strong> ${esc(perfil.comunicacao)}</p>
    <p><strong>Ambiente em que rende mais:</strong> ${esc(perfil.ambiente)}</p>`;

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>DISC — ${esc(candidato.nome)}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #1f2937; max-width: 820px; margin: 0 auto; padding: 28px 22px; }
  .topo { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #22c3b6; padding-bottom: 12px; margin-bottom: 18px; }
  .topo img { height: 42px; }
  h1 { color: #122454; font-size: 22px; margin: 0; }
  h2 { color: #122454; font-size: 17px; margin: 22px 0 6px; }
  h3 { font-size: 14px; margin: 8px 0 4px; color: #122454; }
  .meta { color: #6b7683; font-size: 13px; }
  .perfil { background: #f1ecff; border-radius: 10px; padding: 14px 16px; margin: 16px 0; font-size: 18px; font-weight: 700; color: #122454; }
  .barra { display: grid; grid-template-columns: 150px 1fr 40px; gap: 10px; align-items: center; margin: 8px 0; font-size: 14px; }
  .trilho { background: #eef1f4; border-radius: 6px; height: 18px; overflow: hidden; }
  .preenche { height: 100%; border-radius: 6px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .valor { text-align: right; font-weight: 700; }
  .duas { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  ul { margin: 4px 0; padding-left: 18px; font-size: 14px; } p { font-size: 14px; line-height: 1.55; }
  .aviso { margin-top: 26px; font-size: 11.5px; color: #6b7683; border-top: 1px solid #e3e7ec; padding-top: 10px; }
  .imprimir { position: fixed; right: 18px; bottom: 18px; background: linear-gradient(135deg,#22c3b6,#7c5cfa); color: white; border: none; border-radius: 10px; padding: 12px 18px; font-size: 15px; font-weight: 700; cursor: pointer; }
  @media print { .imprimir { display: none; } body { padding: 0; } }
  @media (max-width: 600px) { .duas { grid-template-columns: 1fr; } .barra { grid-template-columns: 110px 1fr 34px; } }
</style></head><body>
  <div class="topo"><div><h1>Perfil Comportamental DISC</h1><div class="meta">Evoé Gestão e RH · Recrutamento e Seleção</div></div><img src="/img/logo-evoe.svg" alt="" onerror="this.remove()" /></div>
  <div><strong>${esc(candidato.nome)}</strong></div>
  <div class="meta">${vaga ? `Vaga: ${esc(vaga.titulo)}${empresa ? ` · ${esc(empresa)}` : ""} · ` : ""}Respondido em ${esc(data)}${d.duracaoSegundos ? ` · ${Math.max(1, Math.round(d.duracaoSegundos / 60))} min` : ""}</div>
  <div class="perfil">Perfil ${esc(nomePerfil(r))}</div>
  <h2>Intensidade de cada fator (0 a 100)</h2>
  ${barras}
  ${bloco(p, "Fator predominante")}
  ${s ? bloco(s, "Fator secundário") : ""}
  <div class="aviso">
    Questionário próprio da Evoé baseado no modelo DISC de William M. Marston (1928), versão ${esc(d.versao)}.
    O DISC descreve tendências de comportamento e preferências; não mede competência, inteligência ou caráter e não é
    teste psicológico do SATEPSI/CFP. Use como informação complementar à entrevista, à checagem de referências e ao
    parecer comportamental — nunca como critério único de decisão. Documento com dados pessoais (LGPD): uso interno.
  </div>
  <button class="imprimir" onclick="window.print()">Salvar em PDF / Imprimir</button>
</body></html>`;
}

module.exports = { relatorioDisc };
