// Converte os registros do ponto antigo (um registro por dia com entrada/pausa/saída)
// em marcações individuais do novo módulo. Roda na subida do servidor e é idempotente:
// cada marcação importada guarda `legadoId`, então nada é importado duas vezes.
// A coleção antiga "ponto" NÃO é alterada nem apagada (serve de prova/backup).

const db = require("../../db");
const { dataLocal, horaMinLocal, timestampLocal } = require("./tempo");
const { COL_MARCACOES } = require("./apuracao");

const CAMPOS = ["entrada", "pausaEntrada", "pausaSaida", "saida"];

function migrarPontoLegado() {
  const antigos = db.readCollection("ponto");
  if (!antigos.length) return;

  const marcacoes = db.readCollection(COL_MARCACOES);
  const jaImportados = new Set(marcacoes.map((mk) => mk.legadoId).filter(Boolean));
  const colaboradores = db.readCollection("colaboradores");
  const users = db.readCollection("users");

  const acharColaborador = (reg) => {
    const porId = colaboradores.find((c) => c.id === reg.colaboradorId);
    if (porId) return porId;
    const consultorId =
      (users.find((u) => u.id === reg.usuarioId) || {}).consultorId || reg.colaboradorId;
    return colaboradores.find((c) => c.consultorId && c.consultorId === consultorId) || null;
  };

  let importadas = 0;
  let semVinculo = 0;
  for (const reg of antigos) {
    const colaborador = acharColaborador(reg);
    for (const campo of CAMPOS) {
      if (!reg[campo]) continue;
      const legadoId = `${reg.id}:${campo}`;
      if (jaImportados.has(legadoId)) continue;
      if (!colaborador) {
        semVinculo++;
        continue;
      }
      const quando = new Date(reg[campo]);
      if (isNaN(quando)) continue;
      marcacoes.push({
        id: db.newId(),
        colaboradorId: colaborador.id,
        consultorId: colaborador.consultorId || null,
        data: dataLocal(quando),
        horaMin: horaMinLocal(quando),
        timestamp: timestampLocal(quando),
        origem: "importacao",
        ajuste: false,
        motivoAjuste: "",
        registradoPor: reg.usuarioId || null,
        legadoId,
        criadoEm: new Date().toISOString(),
      });
      importadas++;
    }
  }
  if (importadas) db.writeCollection(COL_MARCACOES, marcacoes);
  if (importadas || semVinculo) {
    console.log(`[ponto] Migração do ponto antigo: ${importadas} marcação(ões) importada(s); ${semVinculo} sem colaborador vinculado.`);
  }
}

module.exports = { migrarPontoLegado };
