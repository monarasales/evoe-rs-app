const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { notify, notifyMudancaVaga } = require("../utils/notify");
const { computeVagaFields, hojeStr } = require("../utils/vagaCompute");
const { ETAPAS_VAGA, PRIORIDADES } = require("../utils/constants");
const { criarParaVaga: criarPesquisaNps } = require("../utils/npsPesquisas");
const { normalizarPagina, TIPOS_CONTRATACAO, MODELOS_TRABALHO, FREQUENCIAS, gerarTokenVaga: gerarToken } = require("../utils/vagaPagina");

const router = express.Router();

// Comissão paga ao consultor é dado do Financeiro: não sai nas respostas para quem não é Gestor.
const CAMPOS_FINANCEIROS = ["comissaoPaga", "comissaoPagaEm", "comissaoPagaPorId"];
const semFinanceiro = (v) => {
  if (!v || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(semFinanceiro);
  const copia = { ...v };
  CAMPOS_FINANCEIROS.forEach((k) => delete copia[k]);
  return copia;
};
router.use((req, res, next) => {
  if (req.consultor && req.consultor.perfil !== "Gestor") {
    const json = res.json.bind(res);
    res.json = (corpo) => json(semFinanceiro(corpo));
  }
  next();
});

// Todos os consultores editam as vagas (fazem o alinhamento de perfil com o cliente e
// atualizam a divulgação). Só a gestão ou o responsável pela vaga podem EXCLUÍ-LA, e só a
// gestão troca o consultor responsável. Toda edição fica em vaga.historicoEdicoes.
function podeEditar(req) {
  return !!req.consultor;
}
function podeGerir(req, vaga) {
  return ["Gestor", "Supervisora"].includes(req.consultor.perfil) || vaga.consultorId === req.consultor.id;
}
const ehGestao = (req) => ["Gestor", "Supervisora"].includes(req.consultor.perfil);

const NOMES_CAMPOS = {
  titulo: "título",
  perfilVaga: "perfil da vaga",
  empresaId: "empresa",
  consultorId: "consultor responsável",
  dataAbertura: "data de abertura",
  prazoFechamento: "prazo",
  prioridade: "prioridade",
  observacoes: "observações",
  salario: "salário",
};
/** Acrescenta uma entrada ao histórico de edições (quem, quando, o quê). */
function registrarEdicao(vaga, req, oQue) {
  if (!oQue) return {};
  return { historicoEdicoes: [...(vaga.historicoEdicoes || []), { em: new Date().toISOString(), por: req.consultor.nome, porId: req.consultor.id, oQue }].slice(-200) };
}

/** Avisa o consultor responsável quando outra pessoa altera a vaga dele. */
function avisarResponsavel(vaga, req, oQue) {
  if (!vaga.consultorId || vaga.consultorId === req.consultor.id) return;
  notify({
    tipo: "Vaga editada",
    vagaId: vaga.id,
    destinatarioId: vaga.consultorId,
    assunto: `${req.consultor.nome} editou a vaga ${vaga.titulo}`,
    mensagem: `${req.consultor.nome} alterou: ${oQue}.`,
  });
}

function comCampos(vaga) {
  const candidatosDaVaga = db.readCollection("candidatos").filter((c) => c.vagaId === vaga.id);
  return computeVagaFields(vaga, candidatosDaVaga);
}

router.get("/", (req, res) => {
  let vagas = db.readCollection("vagas");
  const { consultorId, etapa } = req.query;
  if (consultorId) vagas = vagas.filter((v) => v.consultorId === consultorId);
  if (etapa) vagas = vagas.filter((v) => v.etapaAtual === etapa);
  res.json(vagas.map(comCampos));
});

router.get("/etapas", (req, res) => {
  res.json(ETAPAS_VAGA);
});

router.get("/:id", (req, res) => {
  const vaga = db.findById("vagas", req.params.id);
  if (!vaga) return res.status(404).json({ erro: "Vaga não encontrada." });
  res.json(comCampos(vaga));
});

router.post("/", requireAuth, (req, res) => {
  const { titulo, perfilVaga, empresaId, consultorId, dataAbertura, prazoFechamento, prioridade, observacoes, salario } = req.body || {};

  if (!titulo || !empresaId || !consultorId || !dataAbertura || !prazoFechamento) {
    return res.status(400).json({ erro: "Título, empresa, consultor, data de abertura e prazo de fechamento são obrigatórios." });
  }
  if (!db.findById("empresas", empresaId)) return res.status(400).json({ erro: "Empresa inválida." });
  if (!db.findById("consultores", consultorId)) return res.status(400).json({ erro: "Consultor inválido." });
  if (prioridade && !PRIORIDADES.includes(prioridade)) return res.status(400).json({ erro: "Prioridade inválida." });

  const vaga = db.insert("vagas", {
    titulo,
    perfilVaga: perfilVaga || "",
    empresaId,
    consultorId,
    dataAbertura,
    prazoFechamento,
    prioridade: prioridade || "Média",
    salario: Number(salario) || 0,
    etapaAtual: ETAPAS_VAGA[0],
    dataEntradaEtapa: hojeStr(),
    dataFechamento: null,
    observacoes: observacoes || "",
    alertaPrazoEnviado: false,
    alertaAtrasoEnviado: false,
    alertaSlaProximoEnviado: false,
    alertaSlaEstouradoEnviado: false,
    emStandBy: false,
    dataInicioStandBy: null,
    diasStandByAcumulados: 0,
    motivoStandBy: "",
  });

  db.insert("historico", {
    vagaId: vaga.id,
    consultorId: vaga.consultorId,
    etapa: vaga.etapaAtual,
    dataEntrada: hojeStr(),
    dataSaida: null,
  });

  notifyMudancaVaga({
    vaga,
    atorId: req.consultor.id,
    tipo: "Nova Vaga Atribuída",
    assunto: `Nova vaga atribuída: ${vaga.titulo}`,
    mensagem: `Uma nova vaga foi colocada no Backlog e atribuída a você: "${vaga.titulo}" (${db.findById("empresas", vaga.empresaId)?.nome || ""}). Prazo combinado: ${vaga.prazoFechamento}.`,
  });

  res.status(201).json(comCampos(vaga));
});

router.patch("/:id", requireAuth, (req, res) => {
  const vaga = db.findById("vagas", req.params.id);
  if (!vaga) return res.status(404).json({ erro: "Vaga não encontrada." });
  if (!podeEditar(req)) {
    return res.status(403).json({ erro: "Você só pode editar vagas atribuídas a você." });
  }
  const { titulo, perfilVaga, empresaId, consultorId, dataAbertura, prazoFechamento, prioridade, observacoes, salario } = req.body || {};
  if (prioridade && !PRIORIDADES.includes(prioridade)) return res.status(400).json({ erro: "Prioridade inválida." });
  if (consultorId && consultorId !== vaga.consultorId && !ehGestao(req)) {
    return res.status(403).json({ erro: "Só a gestão pode trocar o consultor responsável pela vaga." });
  }
  const mudou = Object.keys(NOMES_CAMPOS).filter((k) => {
    const novo = k === "salario" ? (salario !== undefined ? Number(salario) || 0 : undefined) : (req.body || {})[k];
    return novo !== undefined && String(novo ?? "") !== String(vaga[k] ?? "");
  });

  const atualizado = db.update("vagas", vaga.id, {
    titulo,
    perfilVaga,
    empresaId,
    consultorId,
    dataAbertura,
    prazoFechamento,
    prioridade,
    observacoes,
    salario: salario !== undefined ? Number(salario) || 0 : undefined,
    // se o prazo mudou, os alertas de prazo/atraso podem disparar de novo
    ...(prazoFechamento && prazoFechamento !== vaga.prazoFechamento
      ? { alertaPrazoEnviado: false, alertaAtrasoEnviado: false }
      : {}),
    // se a data de abertura mudou, os alertas de SLA de fechamento também podem disparar de novo
    ...(dataAbertura && dataAbertura !== vaga.dataAbertura
      ? { alertaSlaProximoEnviado: false, alertaSlaEstouradoEnviado: false }
      : {}),
    ...registrarEdicao(vaga, req, mudou.map((k) => NOMES_CAMPOS[k]).join(", ")),
  });

  notifyMudancaVaga({
    vaga: atualizado,
    atorId: req.consultor.id,
    tipo: "Vaga Atualizada",
    assunto: `Vaga atualizada: ${atualizado.titulo}`,
    mensagem: `${req.consultor.nome} atualizou os dados da vaga "${atualizado.titulo}".`,
  });

  res.json(comCampos(atualizado));
});

// Endpoint dedicado à mudança de etapa (usado pelo drag-and-drop do Kanban):
// fecha o registro de histórico da etapa anterior e abre um novo.
router.patch("/:id/etapa", requireAuth, (req, res) => {
  const vaga = db.findById("vagas", req.params.id);
  if (!vaga) return res.status(404).json({ erro: "Vaga não encontrada." });
  if (!podeEditar(req)) {
    return res.status(403).json({ erro: "Você só pode mover vagas atribuídas a você." });
  }
  const { etapa } = req.body || {};
  if (!ETAPAS_VAGA.includes(etapa)) return res.status(400).json({ erro: "Etapa inválida." });
  if (etapa === vaga.etapaAtual) return res.json(comCampos(vaga));

  const hoje = hojeStr();

  const historicoAberto = db
    .readCollection("historico")
    .find((h) => h.vagaId === vaga.id && !h.dataSaida);
  if (historicoAberto) {
    db.update("historico", historicoAberto.id, { dataSaida: hoje });
  }
  db.insert("historico", {
    vagaId: vaga.id,
    consultorId: vaga.consultorId,
    etapa,
    dataEntrada: hoje,
    dataSaida: null,
  });

  const patch = { etapaAtual: etapa, dataEntradaEtapa: hoje };
  if (etapa === "11. Aprovado" || etapa === "12. Cancelada/Encerrada") {
    patch.dataFechamento = hoje;
  }
  const atualizado = db.update("vagas", vaga.id, patch);

  const ehAprovacao = etapa === "11. Aprovado";
  notifyMudancaVaga({
    vaga: atualizado,
    atorId: req.consultor.id,
    tipo: ehAprovacao ? "Candidato Aprovado" : "Mudança de Etapa",
    assunto: ehAprovacao ? `Vaga fechada: ${vaga.titulo}` : `Vaga "${vaga.titulo}" avançou para: ${etapa}`,
    mensagem: ehAprovacao
      ? `${req.consultor.nome} marcou a vaga "${vaga.titulo}" como Aprovada. Vaga fechada.`
      : `${req.consultor.nome} moveu a vaga "${vaga.titulo}" para a etapa "${etapa}".`,
  });

  // Vaga fechada (11. Aprovado): cria e envia a pesquisa de satisfação (NPS) ao cliente.
  // Roda em segundo plano — o envio de e-mail não atrasa a resposta da tela.
  if (etapa === "11. Aprovado") {
    criarPesquisaNps(db.findById("vagas", vaga.id), { por: req.consultor.nome, base: `${req.protocol}://${req.get("host")}` }).catch((err) =>
      console.error("[nps] Falha ao criar pesquisa:", err.message)
    );
  }
  res.json(comCampos(atualizado));
});

// Alterna o Stand By de uma vaga: pausa (ou retoma) a contagem de dias em aberto e o
// relógio do prazo/SLA de fechamento. Ao retomar, os dias parados são somados em
// diasStandByAcumulados (descontados do cálculo em vagaCompute.js) e os alertas de
// prazo/SLA são reabertos, já que a "janela" efetiva de fechamento se estendeu.
router.patch("/:id/standby", requireAuth, (req, res) => {
  const vaga = db.findById("vagas", req.params.id);
  if (!vaga) return res.status(404).json({ erro: "Vaga não encontrada." });
  if (!podeEditar(req)) {
    return res.status(403).json({ erro: "Você só pode alterar o Stand By de vagas atribuídas a você." });
  }
  if (["11. Aprovado", "12. Cancelada/Encerrada"].includes(vaga.etapaAtual)) {
    return res.status(400).json({ erro: "Não é possível colocar em Stand By uma vaga já encerrada." });
  }

  const { standBy, motivo } = req.body || {};
  const hoje = hojeStr();
  let atualizado;

  if (standBy && !vaga.emStandBy) {
    atualizado = db.update("vagas", vaga.id, {
      emStandBy: true,
      dataInicioStandBy: hoje,
      motivoStandBy: motivo || "",
    });
    notifyMudancaVaga({
      vaga: atualizado,
      atorId: req.consultor.id,
      tipo: "Vaga em Stand By",
      assunto: `Vaga em Stand By: ${atualizado.titulo}`,
      mensagem: `${req.consultor.nome} colocou a vaga "${atualizado.titulo}" em Stand By${motivo ? ` — motivo: ${motivo}` : ""}. A contagem de prazo e SLA fica pausada até a retomada.`,
    });
  } else if (!standBy && vaga.emStandBy) {
    const { diasEntre } = require("../utils/vagaCompute");
    const diasPausados = diasEntre(vaga.dataInicioStandBy, hoje);
    atualizado = db.update("vagas", vaga.id, {
      emStandBy: false,
      dataInicioStandBy: null,
      diasStandByAcumulados: (vaga.diasStandByAcumulados || 0) + Math.max(0, diasPausados),
      motivoStandBy: "",
      // reabre os alertas: a janela efetiva de prazo/SLA "andou" com a pausa
      alertaPrazoEnviado: false,
      alertaAtrasoEnviado: false,
      alertaSlaProximoEnviado: false,
      alertaSlaEstouradoEnviado: false,
    });
    notifyMudancaVaga({
      vaga: atualizado,
      atorId: req.consultor.id,
      tipo: "Vaga Retomada",
      assunto: `Vaga retomada: ${atualizado.titulo}`,
      mensagem: `${req.consultor.nome} retomou a vaga "${atualizado.titulo}" (estava ${diasPausados} dia(s) em Stand By).`,
    });
  } else {
    atualizado = vaga;
  }

  res.json(comCampos(atualizado));
});

// ---------- Link público de inscrição ----------
// O endereço usa um código aleatório (não o id interno) e pode ser ativado/desativado.
// "descricaoPublica" é o ÚNICO texto que o candidato vê — o "perfil da vaga" interno
// nunca vai para a página pública. Empresa fica confidencial por padrão.

router.patch("/:id/link", requireAuth, (req, res) => {
  const vaga = db.findById("vagas", req.params.id);
  if (!vaga) return res.status(404).json({ erro: "Vaga não encontrada." });
  if (!podeEditar(req)) return res.status(403).json({ erro: "Você só pode configurar o link de vagas atribuídas a você." });
  const b = req.body || {};
  const dados = {};
  if (!vaga.linkToken) {
    dados.linkToken = gerarToken(vaga.titulo);
    dados.linkCriadoEm = new Date().toISOString();
    dados.linkCriadoPor = req.consultor.nome;
  }
  if (b.inscricoesAbertas !== undefined) dados.inscricoesAbertas = !!b.inscricoesAbertas;
  if (b.mostrarEmpresa !== undefined) dados.mostrarEmpresa = !!b.mostrarEmpresa;
  if (b.exigirDisc !== undefined) dados.exigirDisc = !!b.exigirDisc;
  if (b.descricaoPublica !== undefined) dados.descricaoPublica = String(b.descricaoPublica || "").slice(0, 8000);
  if (b.mensagemConvite !== undefined) {
    const msg = String(b.mensagemConvite || "").trim().slice(0, 3000);
    if (msg && !/\{LINK\}|\/vaga\//i.test(msg)) return res.status(400).json({ erro: "A mensagem precisa ter o link da vaga (use {LINK} ou o próprio link)." });
    dados.mensagemConvite = msg; // vazio = volta a usar o modelo padrão
  }
  const oQue = b.mensagemConvite !== undefined ? "mensagem de convite" : "configurações do link";
  Object.assign(dados, registrarEdicao(vaga, req, oQue));
  avisarResponsavel(vaga, req, oQue);
  res.json(comCampos(db.update("vagas", vaga.id, dados)));
});

// Conteúdo estruturado da página pública da vaga (missão, objetivos, responsabilidades...).
router.get("/pagina/opcoes", (req, res) => res.json({ tiposContratacao: TIPOS_CONTRATACAO, modelosTrabalho: MODELOS_TRABALHO, frequencias: FREQUENCIAS }));

router.put("/:id/pagina", requireAuth, (req, res) => {
  const vaga = db.findById("vagas", req.params.id);
  if (!vaga) return res.status(404).json({ erro: "Vaga não encontrada." });
  if (!podeEditar(req)) return res.status(403).json({ erro: "Você só pode editar a página de vagas atribuídas a você." });
  // Merge com o que já existia: campos desconhecidos/antigos dentro de "pagina" são preservados.
  const pagina = { ...(vaga.pagina || {}), ...normalizarPagina(req.body || {}) };
  avisarResponsavel(vaga, req, "página da vaga (divulgação)");
  res.json(comCampos(db.update("vagas", vaga.id, { pagina, paginaAtualizadaEm: new Date().toISOString(), paginaAtualizadaPor: req.consultor.nome, ...registrarEdicao(vaga, req, "página da vaga (divulgação)") })));
});

router.delete("/:id", requireAuth, (req, res) => {
  const vaga = db.findById("vagas", req.params.id);
  if (!vaga) return res.status(404).json({ erro: "Vaga não encontrada." });
  if (!podeGerir(req, vaga)) {
    return res.status(403).json({ erro: "Só a gestão ou o consultor responsável podem excluir esta vaga." });
  }
  db.remove("vagas", req.params.id);
  res.json({ ok: true });
});

module.exports = router;
