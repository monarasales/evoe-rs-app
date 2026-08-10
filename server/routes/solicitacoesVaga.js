// Solicitações de Vaga: pedido enviado pelo cliente através do link público
// (public/solicitar-vaga.html), sem precisar de login. Fica pendente até o Gestor
// revisar (e corrigir, se precisar) e aprovar — só então vira uma vaga de verdade
// no funil. Isso evita que um erro de digitação do cliente, ou uso indevido do
// link, crie uma vaga direto sem checagem nenhuma.
const express = require("express");
const db = require("../db");
const { requireAuth, requireGestor, requireGestorOuSupervisora } = require("../middleware/auth");
const { notify } = require("../utils/notify");
const { limitarTaxa } = require("../utils/rateLimitSimples");
const { hojeStr } = require("../utils/vagaCompute");
const { ETAPAS_VAGA, PRIORIDADES, STATUS_SOLICITACAO_VAGA } = require("../utils/constants");

const router = express.Router();

function ipDoPedido(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress || "desconhecido";
}

// Formulário público (sem login): qualquer empresa, cliente já cadastrada ou nova,
// pode pedir uma vaga por aqui. Validação mínima + honeypot + limite de tentativas
// por IP, já que é um endpoint de escrita aberto a qualquer visitante da internet.
router.post("/", (req, res) => {
  const limite = limitarTaxa({ chave: `solicitacao-vaga:${ipDoPedido(req)}`, maxTentativas: 8, janelaMs: 60 * 60 * 1000 });
  if (!limite.permitido) {
    return res.status(429).json({ erro: "Muitas tentativas em pouco tempo. Aguarde um pouco e tente novamente." });
  }

  const {
    nomeEmpresa,
    cnpj,
    contatoResponsavel,
    emailContato,
    whatsappContato,
    tituloVaga,
    perfilVaga,
    salario,
    prazoDesejado,
    observacoes,
    // Campo-armadilha: invisível pra gente, mas formulários automáticos (bots)
    // costumam preencher todo campo que encontram. Se vier preenchido, finge que
    // deu certo (não avisa o bot que foi barrado) mas não grava nada.
    website,
  } = req.body || {};

  if (website) {
    return res.status(201).json({ ok: true });
  }

  if (!nomeEmpresa || !nomeEmpresa.trim()) {
    return res.status(400).json({ erro: "Informe o nome da empresa." });
  }
  if (!tituloVaga || !tituloVaga.trim()) {
    return res.status(400).json({ erro: "Informe o título da vaga." });
  }
  if (!emailContato?.trim() && !whatsappContato?.trim()) {
    return res.status(400).json({ erro: "Informe pelo menos um contato: e-mail ou WhatsApp." });
  }

  const solicitacao = db.insert("solicitacoesVaga", {
    status: "Pendente",
    nomeEmpresa: nomeEmpresa.trim(),
    cnpj: (cnpj || "").trim(),
    contatoResponsavel: (contatoResponsavel || "").trim(),
    emailContato: (emailContato || "").trim(),
    whatsappContato: (whatsappContato || "").trim(),
    tituloVaga: tituloVaga.trim(),
    perfilVaga: (perfilVaga || "").trim(),
    salario: Number(salario) || 0,
    prazoDesejado: prazoDesejado || "",
    observacoes: (observacoes || "").trim(),
    empresaIdVinculada: null,
    vagaCriadaId: null,
    aprovadoPorId: null,
    aprovadoEm: null,
    rejeitadoPorId: null,
    rejeitadoEm: null,
    motivoRejeicao: "",
  });

  // Avisa todo Gestor ativo — só ele aprova/rejeita (mesma regra de outras áreas
  // sensíveis do sistema, como o CRM e a correção de ponto).
  const gestoresAtivos = db.readCollection("consultores").filter((c) => c.perfil === "Gestor" && c.ativo);
  gestoresAtivos.forEach((g) => {
    notify({
      tipo: "Nova Solicitação de Vaga",
      destinatarioId: g.id,
      assunto: `Nova solicitação de vaga: ${solicitacao.tituloVaga}`,
      mensagem: `${solicitacao.nomeEmpresa} pediu uma vaga pelo link público: "${solicitacao.tituloVaga}". Revise em Solicitações de Vaga.`,
    });
  });

  res.status(201).json({ ok: true });
});

// Listagem (Gestor/Supervisora) — quem gerencia o funil já deve saber que tem
// solicitação chegando, mesmo que só o Gestor possa aprovar/rejeitar.
router.get("/", requireAuth, requireGestorOuSupervisora, (req, res) => {
  let solicitacoes = db.readCollection("solicitacoesVaga");
  const { status } = req.query;
  if (status && STATUS_SOLICITACAO_VAGA.includes(status)) {
    solicitacoes = solicitacoes.filter((s) => s.status === status);
  }
  solicitacoes = solicitacoes.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  res.json(solicitacoes);
});

// Aprova uma solicitação: cria (se precisar) a empresa e sempre cria a vaga, com os
// dados finais revisados pelo Gestor (pode ter corrigido algo que o cliente digitou
// errado). Só o Gestor — decisão explícita da usuária de manter controle sobre o
// que vira vaga oficial.
router.patch("/:id/aprovar", requireAuth, requireGestor, (req, res) => {
  const solicitacao = db.findById("solicitacoesVaga", req.params.id);
  if (!solicitacao) return res.status(404).json({ erro: "Solicitação não encontrada." });
  if (solicitacao.status !== "Pendente") {
    return res.status(400).json({ erro: `Esta solicitação já foi ${solicitacao.status === "Aprovada" ? "aprovada" : "rejeitada"}.` });
  }

  const { titulo, perfilVaga, consultorId, dataAbertura, prazoFechamento, prioridade, salario, observacoes, empresaId, novaEmpresa } =
    req.body || {};

  if (!titulo || !titulo.trim()) return res.status(400).json({ erro: "Informe o título da vaga." });
  if (!consultorId || !db.findById("consultores", consultorId)) {
    return res.status(400).json({ erro: "Selecione o consultor responsável." });
  }
  if (!prazoFechamento) return res.status(400).json({ erro: "Informe o prazo de fechamento." });
  if (prioridade && !PRIORIDADES.includes(prioridade)) return res.status(400).json({ erro: "Prioridade inválida." });

  let empresaFinalId = empresaId || null;
  if (!empresaFinalId) {
    if (!novaEmpresa || !novaEmpresa.nome || !novaEmpresa.nome.trim()) {
      return res.status(400).json({ erro: "Selecione uma empresa já cadastrada ou informe os dados da empresa nova." });
    }
    const empresaCriada = db.insert("empresas", {
      nome: novaEmpresa.nome.trim(),
      cnpj: (novaEmpresa.cnpj || "").trim(),
      endereco: "",
      segmento: "",
      contatoResponsavel: (novaEmpresa.contatoResponsavel || "").trim(),
      emailContato: (novaEmpresa.emailContato || "").trim(),
      whatsappContato: (novaEmpresa.whatsappContato || "").trim(),
      representanteLegalNome: "",
      representanteLegalCpf: "",
    });
    empresaFinalId = empresaCriada.id;
  } else if (!db.findById("empresas", empresaFinalId)) {
    return res.status(400).json({ erro: "Empresa selecionada inválida." });
  }

  const hoje = hojeStr();
  const vaga = db.insert("vagas", {
    titulo: titulo.trim(),
    perfilVaga: perfilVaga || "",
    empresaId: empresaFinalId,
    consultorId,
    dataAbertura: dataAbertura || hoje,
    prazoFechamento,
    prioridade: prioridade || "Média",
    salario: Number(salario) || 0,
    tipoVaga: "Nova",
    motivoReposicao: "",
    vagaOrigemId: null,
    etapaAtual: ETAPAS_VAGA[0],
    dataEntradaEtapa: hoje,
    dataFechamento: null,
    observacoes: observacoes || `Criada a partir de uma solicitação recebida pelo link público em ${hoje}.`,
    alertaPrazoEnviado: false,
    alertaAtrasoEnviado: false,
    alertaSlaProximoEnviado: false,
    alertaSlaEstouradoEnviado: false,
    emStandBy: false,
    dataInicioStandBy: null,
    diasStandByAcumulados: 0,
    motivoStandBy: "",
    comissaoPaga: false,
    comissaoPagaEm: null,
    comissaoPagaPorId: null,
  });

  db.insert("historico", {
    vagaId: vaga.id,
    consultorId: vaga.consultorId,
    etapa: vaga.etapaAtual,
    dataEntrada: hoje,
    dataSaida: null,
  });

  notify({
    tipo: "Nova Vaga Atribuída",
    destinatarioId: vaga.consultorId,
    assunto: `Nova vaga atribuída: ${vaga.titulo}`,
    mensagem: `Uma vaga aprovada a partir de uma solicitação recebida pelo link público foi atribuída a você: "${vaga.titulo}". Prazo combinado: ${vaga.prazoFechamento}.`,
  });

  const atualizada = db.update("solicitacoesVaga", solicitacao.id, {
    status: "Aprovada",
    empresaIdVinculada: empresaFinalId,
    vagaCriadaId: vaga.id,
    aprovadoPorId: req.consultor.id,
    aprovadoEm: db.nowIso(),
  });

  res.json(atualizada);
});

// Rejeita uma solicitação (ex: cliente desconhecido, dado insuficiente, pedido
// duplicado) — mantém o registro pra histórico, só não vira vaga. Só o Gestor.
router.patch("/:id/rejeitar", requireAuth, requireGestor, (req, res) => {
  const solicitacao = db.findById("solicitacoesVaga", req.params.id);
  if (!solicitacao) return res.status(404).json({ erro: "Solicitação não encontrada." });
  if (solicitacao.status !== "Pendente") {
    return res.status(400).json({ erro: `Esta solicitação já foi ${solicitacao.status === "Aprovada" ? "aprovada" : "rejeitada"}.` });
  }

  const { motivo } = req.body || {};
  const atualizada = db.update("solicitacoesVaga", solicitacao.id, {
    status: "Rejeitada",
    rejeitadoPorId: req.consultor.id,
    rejeitadoEm: db.nowIso(),
    motivoRejeicao: (motivo || "").trim(),
  });

  res.json(atualizada);
});

module.exports = router;
