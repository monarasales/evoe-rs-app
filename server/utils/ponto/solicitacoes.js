// Solicitações de ajuste do ponto: o COLABORADOR explica o que aconteceu (esqueceu de
// bater, bateu errado, saiu mais cedo, chegou atrasado, faltou) e a GESTÃO aprova ou recusa.
// Nada é apagado: batida corrigida fica "invalidada" (guardada) e a nova entra como ajuste;
// a aprovação cria a ocorrência do catálogo (atestado, atraso justificado...) quando cabe.
// Coleção "pontoSolicitacoes". Status: Pendente → Aprovada | Recusada | Cancelada.

const db = require("../../db");
const { COL_MARCACOES } = require("./apuracao");
const { COL_OCORRENCIAS, TIPOS, validarOcorrencia } = require("./ocorrencias");
const { hhmmParaMin, minParaHhmm, dataLocal } = require("./tempo");

const COL = "pontoSolicitacoes";

const TIPOS_SOLICITACAO = {
  esqueci: { nome: "Esqueci de bater o ponto", icone: "⏰" },
  corrigir: { nome: "Bati o ponto no horário errado", icone: "✏️" },
  saida_antecipada: { nome: "Saí mais cedo", icone: "🚪" },
  atraso: { nome: "Cheguei atrasado(a)", icone: "🕘" },
  falta: { nome: "Faltei / me ausentei", icone: "📅" },
};
const ROTULOS_BATIDA = ["Entrada", "Saída para almoço", "Volta do almoço", "Saída"];
// Na aprovação de uma falta, a gestão escolhe como ela entra no ponto.
const OCORRENCIAS_FALTA = ["atestado_medico", "acompanhamento_familiar", "falta_justificada", "folga_compensatoria", "falta_injustificada", "home_office", "trabalho_externo", "curso_treinamento", "dia_prova", "doacao_sangue", "convocacao_legal"];

const re = /^\d{4}-\d{2}-\d{2}$/;
const t = (v, max = 500) => String(v == null ? "" : v).trim().slice(0, max);
const hora = (v) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || "")) ? String(v) : "");

/** Valida o pedido do colaborador. Retorna { dados } ou { erro }. */
function validarSolicitacao(b, colaborador, hoje = dataLocal()) {
  const tipo = TIPOS_SOLICITACAO[b.tipo] ? b.tipo : null;
  if (!tipo) return { erro: "Escolha o que aconteceu." };
  const data = String(b.data || "");
  if (!re.test(data)) return { erro: "Informe o dia (dd/mm/aaaa)." };
  if (data > hoje && tipo !== "falta") return { erro: "Só dá para ajustar dias que já aconteceram." };
  const motivo = t(b.motivo, 1000);
  if (motivo.length < 5) return { erro: "Explique o motivo (é ele que a gestão vai analisar)." };
  const dados = { tipo, colaboradorId: colaborador.id, consultorId: colaborador.consultorId || null, data, motivo };

  if (tipo === "esqueci") {
    const batidas = (Array.isArray(b.batidas) ? b.batidas : [])
      .map((x) => ({ rotulo: ROTULOS_BATIDA.includes(x && x.rotulo) ? x.rotulo : "Batida", hora: hora(x && x.hora) }))
      .filter((x) => x.hora)
      .slice(0, 4);
    if (!batidas.length) return { erro: "Informe o horário da(s) batida(s) que faltou(aram)." };
    dados.batidas = batidas;
  }
  if (tipo === "corrigir") {
    const mk = db.findById(COL_MARCACOES, b.marcacaoId);
    if (!mk || mk.colaboradorId !== colaborador.id || mk.data !== data || mk.invalidada) return { erro: "Escolha a batida que está errada." };
    const correta = hora(b.horaCorreta);
    if (!correta) return { erro: "Informe o horário correto." };
    dados.marcacaoId = mk.id;
    dados.horaRegistrada = minParaHhmm(mk.horaMin);
    dados.horaCorreta = correta;
  }
  if (tipo === "saida_antecipada") {
    const saida = hora(b.horaSaida);
    if (!saida) return { erro: "Informe o horário em que você saiu." };
    dados.horaSaida = saida;
    dados.incluirBatida = !!b.incluirBatida; // não bateu a saída: incluir na aprovação
  }
  if (tipo === "atraso") dados.horaChegada = hora(b.horaChegada);
  if (tipo === "falta") {
    const dataFim = re.test(String(b.dataFim || "")) ? b.dataFim : data;
    if (dataFim < data) return { erro: "A data final deve ser igual ou depois da inicial." };
    dados.dataFim = dataFim;
  }
  // Pedido igual ainda pendente para o mesmo dia: não duplica.
  const dup = db.readCollection(COL).find((s) => s.colaboradorId === colaborador.id && s.data === data && s.tipo === tipo && s.status === "Pendente");
  if (dup) return { erro: "Você já tem um pedido igual para este dia aguardando a gestão." };
  return { dados };
}

function novaMarcacao(s, horaHHMM, gestor, extra = {}) {
  return db.insert(COL_MARCACOES, {
    colaboradorId: s.colaboradorId,
    consultorId: s.consultorId,
    data: s.data,
    horaMin: hhmmParaMin(horaHHMM),
    timestamp: `${s.data}T${horaHHMM}:00`,
    origem: "ajuste",
    ajuste: true,
    motivoAjuste: s.motivo,
    solicitacaoId: s.id,
    registradoPor: gestor.id,
    aprovadoPor: gestor.nome,
    localizacao: null,
    localEsperado: null,
    distanciaMetros: null,
    dentroZona: null,
    criadoEm: new Date().toISOString(),
    ...extra,
  });
}

function criarOcorrencia(s, tipoId, gestor, dataFim) {
  const { dados, erro } = validarOcorrencia({ tipo: tipoId, colaboradorId: s.colaboradorId, dataInicio: s.data, dataFim: dataFim || s.data, observacao: `Solicitação do colaborador: ${s.motivo}`.slice(0, 500), documento: s.anexo ? `anexo: ${s.anexo.nomeOriginal}` : "" }, dataLocal());
  if (erro) throw new Error(erro);
  return db.insert(COL_OCORRENCIAS, { ...dados, lancadoPor: gestor.id, solicitacaoId: s.id });
}

/**
 * Aplica a aprovação. opcoes: { abonar (atraso/saída), tipoOcorrencia (falta), comentario }.
 * Retorna os efeitos gravados. Lança Error (mensagem amigável) se algo impedir.
 */
function aprovar(s, gestor, opcoes = {}) {
  const efeitos = { marcacoes: [], ocorrenciaId: null, invalidada: null };
  const doDia = db.readCollection(COL_MARCACOES).filter((mk) => mk.colaboradorId === s.colaboradorId && mk.data === s.data && !mk.invalidada);
  const existe = (h) => doDia.some((mk) => mk.horaMin === hhmmParaMin(h));

  if (s.tipo === "esqueci") {
    for (const b of s.batidas) if (!existe(b.hora)) efeitos.marcacoes.push(novaMarcacao(s, b.hora, gestor, { rotuloAjuste: b.rotulo }).id);
  } else if (s.tipo === "corrigir") {
    const mk = db.findById(COL_MARCACOES, s.marcacaoId);
    if (!mk || mk.invalidada) throw new Error("A batida original já foi alterada — recuse e peça um novo pedido.");
    db.update(COL_MARCACOES, mk.id, { invalidada: true, invalidadaEm: new Date().toISOString(), invalidadaPor: gestor.nome, solicitacaoId: s.id });
    efeitos.invalidada = mk.id;
    efeitos.marcacoes.push(novaMarcacao(s, s.horaCorreta, gestor, { substituiMarcacaoId: mk.id }).id);
  } else if (s.tipo === "saida_antecipada") {
    if (s.incluirBatida && !existe(s.horaSaida)) efeitos.marcacoes.push(novaMarcacao(s, s.horaSaida, gestor, { rotuloAjuste: "Saída" }).id);
    // com abono: dia fecha sem desconto · sem abono: dia fecha e as horas a menos saem do banco
    const tipoId = opcoes.abonar ? "saida_antecipada_justificada" : "saida_antecipada_confirmada";
    efeitos.ocorrenciaId = criarOcorrencia(s, tipoId, gestor).id;
    efeitos.tipoOcorrencia = tipoId;
  } else if (s.tipo === "atraso") {
    if (opcoes.abonar) efeitos.ocorrenciaId = criarOcorrencia(s, "atraso_justificado", gestor).id;
  } else if (s.tipo === "falta") {
    const tipoId = OCORRENCIAS_FALTA.includes(opcoes.tipoOcorrencia) ? opcoes.tipoOcorrencia : "falta_justificada";
    efeitos.ocorrenciaId = criarOcorrencia(s, tipoId, gestor, s.dataFim).id;
    efeitos.tipoOcorrencia = tipoId;
  }
  return efeitos;
}

const nomeTipo = (id) => (TIPOS_SOLICITACAO[id] || {}).nome || id;
const nomeOcorrencia = (id) => (TIPOS.get(id) || {}).nome || id;

module.exports = { COL, TIPOS_SOLICITACAO, ROTULOS_BATIDA, OCORRENCIAS_FALTA, validarSolicitacao, aprovar, nomeTipo, nomeOcorrencia };
