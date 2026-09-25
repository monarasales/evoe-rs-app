const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { computeVagaFields, hojeStr } = require("../utils/vagaCompute");
const {
  ETAPAS_VAGA,
  ETAPAS_ENCERRADAS,
  ETAPAS_CANDIDATO,
  META_VAGAS_FECHADAS_MES,
  SLA_DIAS_IDEAL,
  SLA_DIAS_LIMITE,
} = require("../utils/constants");

const router = express.Router();

function contarPorChave(lista, chave) {
  const contagem = {};
  lista.forEach((item) => {
    const valor = item[chave] || "(sem valor)";
    contagem[valor] = (contagem[valor] || 0) + 1;
  });
  return contagem;
}

// Dashboard geral (visão do Gestor). Também aceita ?consultorId= para o
// Recrutador ver só os próprios números.
router.get("/dashboard", requireAuth, (req, res) => {
  const consultores = db.readCollection("consultores");
  const empresas = db.readCollection("empresas");
  const candidatosTodos = db.readCollection("candidatos");
  let vagas = db.readCollection("vagas");

  const { consultorId } = req.query;
  const podeVerTudo = req.consultor.perfil === "Gestor" || req.consultor.perfil === "Supervisora";
  const scopeConsultorId = podeVerTudo ? consultorId : req.consultor.id;
  if (scopeConsultorId) vagas = vagas.filter((v) => v.consultorId === scopeConsultorId);

  const vagasComCampos = vagas.map((v) =>
    computeVagaFields(v, candidatosTodos.filter((c) => c.vagaId === v.id))
  );

  const totalVagas = vagasComCampos.length;
  const diasEmAbertoValidos = vagasComCampos.map((v) => v.diasEmAberto).filter((d) => Number.isFinite(d));
  const tempoMedioEmAberto = diasEmAbertoValidos.length
    ? Math.round((diasEmAbertoValidos.reduce((a, b) => a + b, 0) / diasEmAbertoValidos.length) * 10) / 10
    : 0;

  const vagasPorConsultor = {};
  vagasComCampos.forEach((v) => {
    const consultor = consultores.find((c) => c.id === v.consultorId);
    const nome = consultor ? consultor.nome : "(sem consultor)";
    vagasPorConsultor[nome] = (vagasPorConsultor[nome] || 0) + 1;
  });

  const vagasPorEtapa = {};
  ETAPAS_VAGA.forEach((e) => (vagasPorEtapa[e] = 0));
  vagasComCampos.forEach((v) => (vagasPorEtapa[v.etapaAtual] = (vagasPorEtapa[v.etapaAtual] || 0) + 1));

  const vagasPorStatusPrazo = contarPorChave(vagasComCampos, "statusPrazo");

  // --- Resumo operacional (visão rápida de saúde do funil) --------------------------
  // Aberto = tudo que ainda não foi encerrado (nem Aprovado, nem Cancelado/Encerrado).
  // Stand By = aberto e pausado (aguardando cliente/candidato) — não conta como
  // Backlog nem Andamento, pois ninguém está atuando ativamente nela agora.
  // Backlog = aberto, fora de Stand By, ainda não começou a ser trabalhado (etapa 1).
  // Andamento = aberto, fora de Stand By e fora do Backlog (alguém está atuando).
  // Atraso = aberto, fora de Stand By, e já passou do prazo combinado com o cliente.
  const vagasAbertas = vagasComCampos.filter((v) => !ETAPAS_ENCERRADAS.includes(v.etapaAtual));
  const vagasEmStandBy = vagasAbertas.filter((v) => v.emStandBy);
  const vagasAtivas = vagasAbertas.filter((v) => !v.emStandBy);
  const vagasNoBacklog = vagasAtivas.filter((v) => v.etapaAtual === ETAPAS_VAGA[0]);
  const vagasEmAndamento = vagasAtivas.filter((v) => v.etapaAtual !== ETAPAS_VAGA[0]);
  const vagasEmAtraso = vagasAtivas.filter((v) => v.statusPrazo === "Atrasada");
  const resumoOperacional = {
    vagasEmAberto: vagasAbertas.length,
    vagasNoBacklog: vagasNoBacklog.length,
    vagasEmAndamento: vagasEmAndamento.length,
    vagasEmAtraso: vagasEmAtraso.length,
    vagasEmStandBy: vagasEmStandBy.length,
  };

  const vagaIds = new Set(vagas.map((v) => v.id));
  const candidatosEscopo = scopeConsultorId
    ? candidatosTodos.filter((c) => vagaIds.has(c.vagaId))
    : candidatosTodos;
  const candidatosPorEtapa = {};
  ETAPAS_CANDIDATO.forEach((e) => (candidatosPorEtapa[e] = 0));
  candidatosEscopo.forEach((c) => (candidatosPorEtapa[c.etapaCandidato] = (candidatosPorEtapa[c.etapaCandidato] || 0) + 1));

  // --- Vagas fechadas por consultor -------------------------------------------------
  const vagasFechadas = vagasComCampos.filter((v) => v.etapaAtual === "11. Aprovado");
  const vagasFechadasPorConsultor = {};
  vagasFechadas.forEach((v) => {
    const consultor = consultores.find((c) => c.id === v.consultorId);
    const nome = consultor ? consultor.nome : "(sem consultor)";
    vagasFechadasPorConsultor[nome] = (vagasFechadasPorConsultor[nome] || 0) + 1;
  });

  // Consultores considerados nos quadros "por consultor": se a visão já está
  // restrita a um único consultor (recrutador logado, ou filtro do gestor),
  // usa só ele; senão, todos os recrutadores ativos da equipe.
  const consultoresRelevantes = scopeConsultorId
    ? consultores.filter((c) => c.id === scopeConsultorId)
    : consultores.filter((c) => c.perfil === "Recrutador");

  // --- SLA de fechamento (10 / 15 dias, com peso 2 / 1 / 0) --------------------------
  const anoMesAtual = hojeStr().slice(0, 7);
  const slaPorConsultor = consultoresRelevantes.map((c) => {
    const fechadasDoConsultor = vagasFechadas.filter((v) => v.consultorId === c.id);
    const ideal = fechadasDoConsultor.filter((v) => v.slaFechamento && v.slaFechamento.nivel === "ideal").length;
    const dentro = fechadasDoConsultor.filter((v) => v.slaFechamento && v.slaFechamento.nivel === "dentro").length;
    const fora = fechadasDoConsultor.filter((v) => v.slaFechamento && v.slaFechamento.nivel === "fora").length;
    const pontuacaoTotal = fechadasDoConsultor.reduce((soma, v) => soma + (v.slaFechamento ? v.slaFechamento.peso : 0), 0);
    const diasFechamento = fechadasDoConsultor.map((v) => v.slaFechamento && v.slaFechamento.dias).filter((d) => Number.isFinite(d));
    const tempoMedioFechamentoDias = diasFechamento.length
      ? Math.round((diasFechamento.reduce((a, b) => a + b, 0) / diasFechamento.length) * 10) / 10
      : 0;

    const fechadasNoMes = fechadasDoConsultor.filter((v) => (v.dataFechamento || "").slice(0, 7) === anoMesAtual).length;

    // --- Taxa de conversão do funil: dos candidatos inscritos nas vagas deste
    // consultor, quantos chegaram a "Aprovado pelo Cliente" (o desfecho de sucesso).
    // Indicador de qualidade de triagem/condução do processo, não só de volume.
    const vagasDoConsultor = vagasComCampos.filter((v) => v.consultorId === c.id);
    const vagaIdsDoConsultor = new Set(vagasDoConsultor.map((v) => v.id));
    const candidatosDoConsultor = candidatosTodos.filter((cd) => vagaIdsDoConsultor.has(cd.vagaId));
    const candidatosAprovados = candidatosDoConsultor.filter((cd) => cd.etapaCandidato === "Aprovado pelo Cliente").length;
    const taxaConversaoPct = candidatosDoConsultor.length
      ? Math.round((candidatosAprovados / candidatosDoConsultor.length) * 1000) / 10
      : 0;

    return {
      consultorId: c.id,
      nome: c.nome,
      totalFechadas: fechadasDoConsultor.length,
      fechadasSlaIdeal: ideal,
      fechadasSlaDentro: dentro,
      fechadasSlaFora: fora,
      pontuacaoSla: pontuacaoTotal,
      tempoMedioFechamentoDias,
      metaMensal: {
        fechadasNoMes,
        meta: META_VAGAS_FECHADAS_MES,
        percentual: Math.min(100, Math.round((fechadasNoMes / META_VAGAS_FECHADAS_MES) * 100)),
      },
      conversao: {
        candidatosInscritos: candidatosDoConsultor.length,
        candidatosAprovados,
        taxaConversaoPct,
      },
    };
  });

  // --- Ranking de consultores: combina os indicadores acima num único placar,
  // ordenado por pontuação SLA (prioriza fechar rápido e dentro do combinado),
  // com fechamentos no mês como critério de desempate. Só faz sentido com mais
  // de um consultor no escopo (visão do Gestor sem filtro por pessoa).
  const rankingConsultores = [...slaPorConsultor]
    .sort((a, b) => b.pontuacaoSla - a.pontuacaoSla || b.metaMensal.fechadasNoMes - a.metaMensal.fechadasNoMes)
    .map((s, i) => ({ posicao: i + 1, ...s }));

  // --- Tempo médio por etapa do funil: usa o histórico de passagens (dataEntrada/
  // dataSaida) para identificar gargalos — em quais etapas as vagas demoram mais.
  // Considera só passagens já encerradas (dataSaida preenchida); a etapa atual
  // (em andamento) não entra na média para não subestimar etapas recém-iniciadas.
  let historico = db.readCollection("historico").filter((h) => h.dataSaida);
  if (scopeConsultorId) historico = historico.filter((h) => h.consultorId === scopeConsultorId);
  const tempoMedioPorEtapa = ETAPAS_VAGA.map((etapa) => {
    const passagens = historico.filter((h) => h.etapa === etapa);
    const dias = passagens.map((h) => {
      const inicio = new Date(h.dataEntrada + "T00:00:00");
      const fim = new Date(h.dataSaida + "T00:00:00");
      return Math.round((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24));
    });
    const tempoMedioDias = dias.length ? Math.round((dias.reduce((a, b) => a + b, 0) / dias.length) * 10) / 10 : 0;
    return { etapa, tempoMedioDias, qtdPassagens: passagens.length };
  });

  // --- Pareceres comportamentais enviados por vaga -----------------------------------
  const pareceresPorVaga = vagasComCampos
    .map((v) => ({
      vagaId: v.id,
      titulo: v.titulo,
      qtdPareceresEnviados: v.qtdPareceresEnviados,
      qtdCandidatos: v.qtdCandidatos,
    }))
    .filter((v) => v.qtdCandidatos > 0)
    .sort((a, b) => b.qtdPareceresEnviados - a.qtdPareceresEnviados);

  const totalPareceresEnviados = vagasComCampos.reduce((soma, v) => soma + v.qtdPareceresEnviados, 0);

  // --- Tempo médio de fechamento GERAL (todas as vagas fechadas no escopo), para o
  // card de indicador em destaque, comparado com o SLA de ${SLA_DIAS_LIMITE} dias.
  const diasFechamentoGeral = vagasFechadas
    .map((v) => v.slaFechamento && v.slaFechamento.dias)
    .filter((d) => Number.isFinite(d));
  const tempoMedioFechamentoGeral = diasFechamentoGeral.length
    ? Math.round((diasFechamentoGeral.reduce((a, b) => a + b, 0) / diasFechamentoGeral.length) * 10) / 10
    : 0;

  res.json({
    totalVagas,
    resumoOperacional,
    totalEmpresas: empresas.length,
    totalCandidatos: candidatosEscopo.length,
    tempoMedioEmAbertoDias: tempoMedioEmAberto,
    vagasPorConsultor,
    vagasPorEtapa,
    vagasPorStatusPrazo,
    candidatosPorEtapa,
    totalVagasFechadas: vagasFechadas.length,
    totalPareceresEnviados,
    tempoMedioFechamentoDias: tempoMedioFechamentoGeral,
    vagasFechadasPorConsultor,
    slaPorConsultor,
    rankingConsultores,
    tempoMedioPorEtapa,
    pareceresPorVaga,
    slaConfig: { diasIdeal: SLA_DIAS_IDEAL, diasLimite: SLA_DIAS_LIMITE, metaMensal: META_VAGAS_FECHADAS_MES },
  });
});

router.get("/mensais", requireAuth, (req, res) => {
  res.json(db.readCollection("indicadoresMensais"));
});

module.exports = router;
