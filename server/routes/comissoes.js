// Comissão por vaga fechada: R$ fixos (VALOR_COMISSAO_FECHAMENTO) para o consultor
// responsável quando a vaga fecha (11. Aprovado) dentro do SLA ideal (SLA_DIAS_IDEAL
// dias). Vagas de Reposição nunca geram comissão. A elegibilidade e o valor são sempre
// recalculados a partir da vaga (server/utils/vagaCompute.js); só o status de pagamento
// fica gravado.
//
// Fluxo de aprovação: a Supervisora (ou o Gestor) solicita o pagamento de uma comissão
// elegível; todos os Gestores recebem notificação; o Gestor então aprova (marca como
// paga) ou recusa (a comissão volta a ficar elegível, liberando nova solicitação). Só
// o Gestor tem poder de aprovar/pagar — a Supervisora só solicita. Isso cria um único
// pedido em aberto por vez por vaga, evitando pagar a mesma comissão duas vezes.

const express = require("express");
const db = require("../db");
const { requireAuth, requireGestor, requireGestorOuSupervisora } = require("../middleware/auth");
const { computeVagaFields, hojeStr } = require("../utils/vagaCompute");
const { notify } = require("../utils/notify");

const router = express.Router();

function gestoresAtivos() {
  return db.readCollection("consultores").filter((c) => c.perfil === "Gestor" && c.ativo);
}

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

router.get("/", requireAuth, requireGestorOuSupervisora, (req, res) => {
  const linhas = montarLinhas();

  const pendentes = linhas.filter((l) => !l.comissao.paga);
  const aguardandoAprovacao = pendentes.filter((l) => l.comissao.solicitada);
  const pagas = linhas.filter((l) => l.comissao.paga);
  const anoMesAtual = hojeStr().slice(0, 7);
  const pagasNoMes = pagas.filter((l) => (l.comissao.pagaEm || "").slice(0, 7) === anoMesAtual);

  res.json({
    linhas,
    resumoGeral: {
      qtdPendente: pendentes.length,
      valorPendente: pendentes.reduce((soma, l) => soma + l.comissao.valor, 0),
      qtdAguardandoAprovacao: aguardandoAprovacao.length,
      valorAguardandoAprovacao: aguardandoAprovacao.reduce((soma, l) => soma + l.comissao.valor, 0),
      qtdPagaMes: pagasNoMes.length,
      valorPagaMes: pagasNoMes.reduce((soma, l) => soma + l.comissao.valor, 0),
      qtdPagaTotal: pagas.length,
      valorPagaTotal: pagas.reduce((soma, l) => soma + l.comissao.valor, 0),
    },
  });
});

// Supervisora (ou Gestor) solicita o pagamento de uma comissão elegível — cria um
// pedido em aberto e notifica todos os Gestores. Bloqueia solicitação repetida
// enquanto já houver um pedido em aberto ou já estiver paga.
router.patch("/:vagaId/solicitar", requireAuth, requireGestorOuSupervisora, (req, res) => {
  const vaga = db.findById("vagas", req.params.vagaId);
  if (!vaga) return res.status(404).json({ erro: "Vaga não encontrada." });

  const campos = computeVagaFields(vaga);
  if (!campos.comissao.elegivel) {
    return res.status(400).json({ erro: "Esta vaga não é elegível para comissão (fora do SLA ideal ou é uma vaga de Reposição)." });
  }
  if (campos.comissao.paga) {
    return res.status(400).json({ erro: "Essa comissão já foi paga." });
  }
  if (campos.comissao.solicitada) {
    return res.status(400).json({ erro: `Essa comissão já foi solicitada em ${campos.comissao.solicitadaEm} e está aguardando aprovação do Gestor.` });
  }

  const atualizado = db.update("vagas", vaga.id, {
    comissaoSolicitada: true,
    comissaoSolicitadaEm: hojeStr(),
    comissaoSolicitadaPorId: req.consultor.id,
  });

  gestoresAtivos()
    .filter((g) => g.id !== req.consultor.id)
    .forEach((g) =>
      notify({
        tipo: "Comissão Solicitada",
        vagaId: vaga.id,
        destinatarioId: g.id,
        assunto: `Comissão solicitada: ${vaga.titulo}`,
        mensagem: `${req.consultor.nome} solicitou o pagamento da comissão de ${vaga.consultorId ? (db.findById("consultores", vaga.consultorId) || {}).nome || "" : ""} pela vaga "${vaga.titulo}". Abra Comissões para aprovar ou recusar.`,
      })
    );

  res.json(computeVagaFields(atualizado));
});

// Gestor recusa uma solicitação de comissão — volta a ficar elegível (libera nova
// solicitação) e avisa quem pediu, com o motivo se informado.
router.patch("/:vagaId/recusar", requireAuth, requireGestor, (req, res) => {
  const vaga = db.findById("vagas", req.params.vagaId);
  if (!vaga) return res.status(404).json({ erro: "Vaga não encontrada." });

  const campos = computeVagaFields(vaga);
  if (!campos.comissao.solicitada) {
    return res.status(400).json({ erro: "Essa comissão não tem solicitação em aberto." });
  }

  const solicitantePorId = vaga.comissaoSolicitadaPorId;
  const motivo = (req.body && req.body.motivo) || "";

  const atualizado = db.update("vagas", vaga.id, {
    comissaoSolicitada: false,
    comissaoSolicitadaEm: null,
    comissaoSolicitadaPorId: null,
  });

  if (solicitantePorId) {
    notify({
      tipo: "Comissão Recusada",
      vagaId: vaga.id,
      destinatarioId: solicitantePorId,
      assunto: `Comissão recusada: ${vaga.titulo}`,
      mensagem: `${req.consultor.nome} recusou a solicitação de comissão da vaga "${vaga.titulo}"${motivo ? ` — motivo: ${motivo}` : ""}. Confira e solicite novamente se for o caso.`,
    });
  }

  res.json(computeVagaFields(atualizado));
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

  // Fecha o ciclo: se alguém solicitou esse pagamento, avisa que foi aprovado.
  if (paga && vaga.comissaoSolicitadaPorId && vaga.comissaoSolicitadaPorId !== req.consultor.id) {
    notify({
      tipo: "Comissão Aprovada",
      vagaId: vaga.id,
      destinatarioId: vaga.comissaoSolicitadaPorId,
      assunto: `Comissão aprovada: ${vaga.titulo}`,
      mensagem: `${req.consultor.nome} aprovou e marcou como paga a comissão da vaga "${vaga.titulo}".`,
    });
  }

  res.json(computeVagaFields(atualizado));
});

module.exports = router;
