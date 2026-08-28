// Faturamento das vagas em aberto: quanto já foi recebido (1ª parcela, recebida ao
// abrir a vaga/gerar o contrato) e quanto está previsto para os próximos 30 dias
// (2ª parcela, na data de vencimento cadastrada no contrato). Só o Gestor tem acesso,
// por ser informação financeira.

const express = require("express");
const db = require("../db");
const { requireAuth, requireGestor } = require("../middleware/auth");
const { calcularParcelas, formatarListaCargos } = require("../utils/financeiro");
const { ETAPAS_ENCERRADAS } = require("../utils/constants");
const { hojeStr, computarReposicaoInfo } = require("../utils/vagaCompute");

const router = express.Router();

function diasAte(dataStr) {
  if (!dataStr) return null;
  const hoje = new Date(hojeStr() + "T00:00:00");
  const alvo = new Date(dataStr + "T00:00:00");
  return Math.round((alvo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
}

router.get("/", requireAuth, requireGestor, (req, res) => {
  const vagas = db.readCollection("vagas");
  const contratos = db.readCollection("contratos");
  const empresas = db.readCollection("empresas");
  const consultores = db.readCollection("consultores");

  const vagasAbertas = vagas.filter((v) => !ETAPAS_ENCERRADAS.includes(v.etapaAtual));
  const vagasAbertasIds = new Set(vagasAbertas.map((v) => v.id));

  // Um contrato pode agrupar mais de uma vaga do mesmo cliente (vagasAdicionaisIds) —
  // continua contando como "em aberto" aqui enquanto QUALQUER uma das vagas dele ainda
  // não tiver fechado, já que o contrato como um todo segue relevante.
  const linhas = contratos
    .filter((c) => vagasAbertasIds.has(c.vagaId) || (c.vagasAdicionaisIds || []).some((id) => vagasAbertasIds.has(id)))
    .map((c) => {
      const vaga = db.findById("vagas", c.vagaId);
      const vagasAdicionais = (c.vagasAdicionaisIds || []).map((id) => db.findById("vagas", id)).filter(Boolean);
      const todasVagasDoContrato = [vaga, ...vagasAdicionais].filter(Boolean);
      const empresa = empresas.find((e) => e.id === c.empresaId);
      const consultor = consultores.find((cs) => cs.id === c.consultorId);
      const { valorTotal, valorParcela1, valorParcela2, valorParcela3, numParcelas, salarioFaltando, ehPermuta } = calcularParcelas(c, vaga, vagasAdicionais);
      const diasParcela2 = diasAte(c.dataVencimentoParcela2);
      const diasParcela3 = diasAte(c.dataVencimentoParcela3);

      let reposicaoInfo = null;
      if (vaga && vaga.tipoVaga === "Reposição" && vaga.vagaOrigemId) {
        const vagaOrigem = db.findById("vagas", vaga.vagaOrigemId);
        const contratoOrigem = vagaOrigem ? contratos.find((co) => co.vagaId === vagaOrigem.id) : null;
        reposicaoInfo = computarReposicaoInfo(vaga, vagaOrigem, contratoOrigem);
      }

      return {
        contratoId: c.id,
        numero: c.numero,
        vagaId: c.vagaId,
        vagaTitulo: formatarListaCargos(todasVagasDoContrato.map((v) => v.titulo)) || "—",
        vagaSalario: todasVagasDoContrato.reduce((soma, v) => soma + (Number(v.salario) || 0), 0),
        // Lista detalhada (título + salário de cada vaga do contrato) — usada pra editar
        // vaga por vaga quando o contrato agrupa mais de uma do mesmo cliente.
        vagasDoContrato: todasVagasDoContrato.map((v) => ({ id: v.id, titulo: v.titulo, salario: v.salario || 0 })),
        empresaNome: empresa ? empresa.nome : "—",
        consultorNome: consultor ? consultor.nome : "—",
        tipoCobranca: c.tipoCobranca,
        valorTotal,
        valorParcela1,
        valorParcela2,
        valorParcela3: valorParcela3 || 0,
        numParcelas: numParcelas || 2,
        dataVencimentoParcela1: c.dataVencimentoParcela1 || null,
        dataVencimentoParcela2: c.dataVencimentoParcela2 || null,
        dataVencimentoParcela3: c.dataVencimentoParcela3 || null,
        diasParcela2,
        diasParcela3,
        salarioFaltando,
        ehPermuta,
        ehAjusteManual: c.valorManualOverride !== null && c.valorManualOverride !== undefined,
        reposicaoInfo,
      };
    })
    .sort((a, b) => (a.dataVencimentoParcela2 || "9999-99-99") < (b.dataVencimentoParcela2 || "9999-99-99") ? -1 : 1);

  const vagasComContrato = new Set();
  contratos.forEach((c) => {
    vagasComContrato.add(c.vagaId);
    (c.vagasAdicionaisIds || []).forEach((id) => vagasComContrato.add(id));
  });
  const vagasAbertasSemContrato = vagasAbertas.filter((v) => !vagasComContrato.has(v.id)).length;

  // Contratos em Permuta não são recebimento em dinheiro: ficam de fora do fluxo de
  // caixa (recebido/previsto/vencido), mas entram no valor total contratado (book) à
  // parte, para não subestimar nem confundir com receita em espécie.
  const linhasCash = linhas.filter((l) => !l.ehPermuta);
  const linhasPermuta = linhas.filter((l) => l.ehPermuta);

  const recebido = linhasCash.reduce((soma, l) => soma + l.valorParcela1, 0);
  const totalContratadoCash = linhasCash.reduce((soma, l) => soma + l.valorTotal, 0);
  const totalPermuta = linhasPermuta.reduce((soma, l) => soma + l.valorTotal, 0);
  const previsto30dias = linhasCash
    .filter((l) => l.diasParcela2 !== null && l.diasParcela2 >= 0 && l.diasParcela2 <= 30)
    .reduce((soma, l) => soma + l.valorParcela2, 0);
  const vencidoNaoRecebido = linhasCash
    .filter((l) => l.diasParcela2 !== null && l.diasParcela2 < 0)
    .reduce((soma, l) => soma + l.valorParcela2, 0);
  const qtdSemSalario = linhas.filter((l) => l.salarioFaltando).length;
  const qtdReposicaoDentroGarantia = linhas.filter((l) => l.reposicaoInfo && l.reposicaoInfo.dentroGarantia).length;

  res.json({
    linhas,
    resumo: {
      recebido: Math.round(recebido * 100) / 100,
      previsto30dias: Math.round(previsto30dias * 100) / 100,
      vencidoNaoRecebido: Math.round(vencidoNaoRecebido * 100) / 100,
      totalContratado: Math.round((totalContratadoCash + totalPermuta) * 100) / 100,
      totalPermuta: Math.round(totalPermuta * 100) / 100,
      qtdPermuta: linhasPermuta.length,
      aReceberTotal: Math.round((totalContratadoCash - recebido) * 100) / 100,
      qtdSemSalario,
      vagasAbertasSemContrato,
      qtdReposicaoDentroGarantia,
    },
  });
});

module.exports = router;
