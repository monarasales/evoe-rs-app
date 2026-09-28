// Ocorrências de jornada: explicam uma ausência (o registro de marcações sabe SE
// bateu, nunca POR QUÊ). O tipo é só catálogo; o que vale é o EFEITO — criar um tipo
// novo é acrescentar uma linha aqui, sem mexer no motor.
// Sem dado de saúde: não existe campo de CID/diagnóstico (LGPD art. 11); o campo
// "documento" guarda só uma referência ("atestado entregue em 05/08").

const db = require("../../db");
const { somarDias } = require("./tempo");

const COL_OCORRENCIAS = "pontoOcorrencias";

const F = (abonaFalta, abonaAtraso, contaTrabalhado, descontaBanco) => ({ abonaFalta, abonaAtraso, contaTrabalhado, descontaBanco });

// grupo, id, nome, efeitos, observação para a tela
const CATALOGO = [
  ["Saúde", "atestado_medico", "Atestado médico", F(true, true, false, false), "Sem CID nem diagnóstico — só a referência do documento."],
  ["Saúde", "acompanhamento_familiar", "Acompanhamento familiar", F(true, true, false, false), "Com comprovante."],
  ["Saúde", "afastamento_inss", "Afastamento pelo INSS", F(true, false, false, false), "Afastamento previdenciário."],
  ["Faltas e atrasos", "falta_justificada", "Falta justificada", F(true, false, false, false), "Aceita pela gestão, sem atestado."],
  ["Faltas e atrasos", "falta_injustificada", "Falta injustificada", F(false, false, false, false), "Registra a falta (não apaga): o caso sai da fila de pendências."],
  ["Faltas e atrasos", "atraso_justificado", "Atraso justificado", F(false, true, false, false), "Abona só o atraso do dia."],
  ["Férias e folgas", "ferias", "Férias / recesso de estágio", F(true, false, false, false), "Sai do denominador da presença."],
  ["Férias e folgas", "folga_compensatoria", "Folga compensatória", F(true, false, false, true), "As horas saem do banco de horas."],
  ["Férias e folgas", "recesso_concedido", "Recesso concedido", F(true, false, false, false), "Recesso dado pela empresa."],
  ["Trabalho fora", "home_office", "Home office", F(true, true, true, false), "Jornada creditada mesmo sem marcação."],
  ["Trabalho fora", "trabalho_externo", "Trabalho externo", F(true, true, true, false), "Jornada creditada mesmo sem marcação."],
  ["Trabalho fora", "curso_treinamento", "Curso / treinamento", F(true, true, true, false), "Atividade da empresa fora do escritório."],
  ["Estágio", "dia_prova", "Dia de prova (estágio)", F(true, true, false, false), "Lei do Estágio: carga reduzida em período de provas."],
  ["Licenças legais", "licenca_maternidade", "Licença-maternidade", F(true, false, false, false), ""],
  ["Licenças legais", "licenca_paternidade", "Licença-paternidade", F(true, false, false, false), ""],
  ["Licenças legais", "licenca_casamento", "Licença casamento (gala)", F(true, false, false, false), ""],
  ["Licenças legais", "licenca_obito", "Licença óbito (nojo)", F(true, false, false, false), ""],
  ["Licenças legais", "doacao_sangue", "Doação de sangue", F(true, true, false, false), ""],
  ["Licenças legais", "convocacao_legal", "Convocação legal (justiça, eleição)", F(true, true, false, false), ""],
  ["Banco de horas", "ajuste_saldo", "Ajuste de saldo de banco", F(false, false, false, false), "Não afeta dia nenhum: só lança horas (+ ou −) no banco."],
].map(([grupo, id, nome, efeitos, obs]) => ({ grupo, id, nome, ...efeitos, obs }));

const TIPOS = new Map(CATALOGO.map((t) => [t.id, t]));
const AFETA_DIA = (tipoId) => tipoId !== "ajuste_saldo";

function listarOcorrencias() {
  return db.readCollection(COL_OCORRENCIAS);
}

/**
 * Mapa "colaboradorId|data" -> efeitos da ocorrência daquele dia (para o motor).
 * Se o catálogo falhar, o ponto segue funcionando sem explicações (degrada com aviso).
 */
function mapaOcorrencias(ocorrencias = null) {
  const mapa = new Map();
  try {
    for (const oc of ocorrencias || listarOcorrencias()) {
      const tipo = TIPOS.get(oc.tipo);
      if (!tipo || !AFETA_DIA(oc.tipo)) continue;
      for (let d = oc.dataInicio; d <= oc.dataFim; d = somarDias(d, 1)) {
        mapa.set(`${oc.colaboradorId}|${d}`, { id: oc.id, tipo: tipo.id, nome: tipo.nome, abonaFalta: tipo.abonaFalta, abonaAtraso: tipo.abonaAtraso, contaTrabalhado: tipo.contaTrabalhado, descontaBanco: tipo.descontaBanco });
      }
    }
  } catch (err) {
    console.warn("[ponto] Ocorrências indisponíveis — calculando sem elas:", err.message);
  }
  return mapa;
}

/** Soma dos ajustes de saldo do colaborador entre duas datas (minutos, com sinal). */
function ajustesDeSaldo(colaboradorId, inicio, fim, ocorrencias = null) {
  return (ocorrencias || listarOcorrencias())
    .filter((oc) => oc.tipo === "ajuste_saldo" && oc.colaboradorId === colaboradorId && oc.dataInicio >= inicio && oc.dataInicio <= fim)
    .reduce((t, oc) => t + (Number(oc.minutos) || 0), 0);
}

const diasCorridos = (ini, fim) => Math.round((new Date(`${fim}T12:00:00Z`) - new Date(`${ini}T12:00:00Z`)) / 86400000) + 1;

/**
 * Valida um lançamento. Retorna { dados, avisos } ou { erro }.
 * Conflito (duas ocorrências no mesmo dia do mesmo colaborador) é ERRO, nomeando a existente.
 * Avisos de RH NÃO bloqueiam: são devolvidos depois de gravar.
 */
function validarOcorrencia(body, hoje, idIgnorar = null) {
  const tipo = TIPOS.get(body.tipo);
  if (!tipo) return { erro: "Escolha o tipo da ocorrência." };
  const colaborador = db.findById("colaboradores", body.colaboradorId);
  if (!colaborador) return { erro: "Escolha um colaborador válido." };
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const dataInicio = String(body.dataInicio || "");
  const dataFim = tipo.id === "ajuste_saldo" ? dataInicio : String(body.dataFim || dataInicio);
  if (!re.test(dataInicio) || !re.test(dataFim)) return { erro: "Informe as datas no formato dd/mm/aaaa." };
  if (dataFim < dataInicio) return { erro: "A data final deve ser igual ou posterior à inicial." };

  let minutos = null;
  if (tipo.id === "ajuste_saldo") {
    minutos = Number(body.minutos);
    if (!Number.isInteger(minutos) || minutos === 0) return { erro: "Informe as horas do ajuste (positivas ou negativas)." };
    if (!String(body.observacao || "").trim()) return { erro: "Informe o motivo do ajuste de saldo." };
  } else {
    const conflito = listarOcorrencias().find(
      (oc) =>
        oc.id !== idIgnorar &&
        oc.colaboradorId === colaborador.id &&
        AFETA_DIA(oc.tipo) &&
        oc.dataInicio <= dataFim &&
        oc.dataFim >= dataInicio
    );
    if (conflito) {
      const t = TIPOS.get(conflito.tipo);
      const fmt = (d) => d.split("-").reverse().join("/");
      return {
        erro: `${colaborador.nome} já tem "${t ? t.nome : conflito.tipo}" de ${fmt(conflito.dataInicio)} a ${fmt(conflito.dataFim)}. Um colaborador não pode ter duas ocorrências no mesmo dia — edite ou remova a existente.`,
      };
    }
  }

  const avisos = [];
  const dias = diasCorridos(dataInicio, dataFim);
  if (tipo.id === "atestado_medico" && dias > 15) avisos.push("Atestado acima de 15 dias corridos: a partir do 16º dia o benefício passa ao INSS.");
  if (tipo.id === "ferias" && dias < 5) avisos.push("Férias fracionadas abaixo de 5 dias.");
  if (dataInicio > hoje) avisos.push("Lançamento em data futura.");
  if (!colaborador.consultorId) avisos.push(`${colaborador.nome} não tem login vinculado — a ocorrência vale, mas a pessoa não consegue bater ponto.`);

  return {
    dados: {
      colaboradorId: colaborador.id,
      tipo: tipo.id,
      dataInicio,
      dataFim,
      minutos,
      documento: String(body.documento || "").trim().slice(0, 200),
      observacao: String(body.observacao || "").trim().slice(0, 500),
    },
    avisos,
  };
}

module.exports = { COL_OCORRENCIAS, CATALOGO, TIPOS, listarOcorrencias, mapaOcorrencias, ajustesDeSaldo, validarOcorrencia };
