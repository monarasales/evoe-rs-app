// Comissão por vaga fechada: R$ fixos (VALOR_COMISSAO_FECHAMENTO) para o consultor
// responsável quando a vaga fecha (11. Aprovado) dentro do SLA ideal (SLA_DIAS_IDEAL
// dias). Vagas de Reposição nunca geram comissão. A elegibilidade e o valor são sempre
// recalculados a partir da vaga (server/utils/vagaCompute.js); só o status de pagamento
// fica gravado. Área só do Gestor, por envolver pagamento à equipe.

const express = require("express");
const db = require("../db");
const { requireAuth, requireGestor } = require("../middleware/auth");
const { computeVagaFields, hojeStr } = require("../utils/vagaCompute");

const router = express.Router();

function montarLinhas() {
  const vagas = db.readCollection("vagas");
  const consultores = db.readCollection("consultores");
  const empresas = db.readCollection("empresas");

  return vagas
    .filter((v) => v.etapaAtual === "11. Aprovado")
    .map((v) => {
      const campos = computeVagaFields(v);
      const consultor = consultores.find((c) => c.id === v.consultorId);
      const empresa = empresas.find((e) => e.id === v.empresaId);
      return {
        vagaId: v.id,
        vagaTitulo: v.titulo,
        empresaNome: empresa ? empresa.nome : "—",
        consultorId: v.consultorId,
        consultorNome: consultor ? consultor.nome : "(sem consultor)",
        tipoVaga: v.tipoVaga || "Nova",
        dataFechamento: v.dataFechamento,
        diasFechamento: campos.slaFechamento ? campos.slaFechamento.dias : null,
        comissao: campos.comissao,
      };
    })
    .filter((l) => l.comissao.elegivel || l.comissao.paga)
    .sort((a, b) => (b.dataFechamento || "").localeCompare(a.dataFechamento || ""));
}

router.get("/", requireAuth, requireGestor, (req, res) => {
  const linhas = montarLinhas();

  const pendentes = linhas.filter((l) => !l.comissao.paga);
  const pagas = linhas.filter((l) => l.comissao.paga);
  const anoMesAtual = hojeStr().slice(0, 7);
  const pagasNoMes = pagas.filter((l) => (l.comissao.pagaEm || "").slice(0, 7) === anoMesAtual);

  res.json({
    linhas,
    resumoGeral: {
      qtdPendente: pendentes.length,
      valorPendente: pendentes.reduce((soma, l) => soma + l.comissao.valor, 0),
      qtdPagaMes: pagasNoMes.length,
      valorPagaMes: pagasNoMes.reduce((soma, l) => soma + l.comissao.valor, 0),
      qtdPagaTotal: pagas.length,
      valorPagaTotal: pagas.reduce((soma, l) => soma + l.comissao.valor, 0),
    },
  });
});

router.patch("/:vagaId/marcar-paga", requireAuth, requireGestor, (req, res) => {
  const vaga = db.findById("vagas", req.params.vagaId);
  if (!vaga) return res.status(404).json({ erro: "Vaga não encontrada." });

  const campos = computeVagaFields(vaga);
  if (!campos.comissao.elegivel && req.body.paga) {
    return res.status(400).json({ erro: "Esta vaga não é elegível para comissão (fora do SLA ideal ou é uma vaga de Reposição)." });
  }

  const paga = !!req.body.paga;
  const atualizado = db.update("vagas", vaga.id, {
    comissaoPaga: paga,
    comissaoPagaEm: paga ? hojeStr() : null,
    comissaoPagaPorId: paga ? req.consultor.id : null,
  });

  res.json(computeVagaFields(atualizado));
});

module.exports = router;
