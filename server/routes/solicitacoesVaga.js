// Perfis de vaga enviados pelos clientes (área do Gestor): gerar link para o cliente,
// revisar, pedir ajuste, validar (cria empresa + vaga já com a página de divulgação) e
// avisar o cliente por e-mail/WhatsApp. Nada é apagado: "arquivar" só muda o status.

const express = require("express");
const db = require("../db");
const { requireAuth, requireGestor } = require("../middleware/auth");
const { notifyMudancaVaga } = require("../utils/notify");
const { enviarEmail, emailConfigurado } = require("../utils/mailer");
const { ETAPAS_VAGA, PRIORIDADES } = require("../utils/constants");
const { hojeStr } = require("../utils/vagaCompute");
const { normalizarPerfil, montarVaga, mensagemValidacao, novoToken, resumoJornada } = require("../utils/perfilVaga");

const router = express.Router();
router.use(requireAuth, requireGestor);

const COL = "solicitacoesVaga";
const baseUrl = (req) => `${req.protocol}://${req.get("host")}`;
const soDigitos = (v) => String(v || "").replace(/\D/g, "");
const telWhats = (t) => {
  let d = soDigitos(t).replace(/^0+/, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  return d.length >= 10 ? `55${d}` : "";
};
const linkWhats = (tel, texto) => `https://wa.me/${telWhats(tel)}?text=${encodeURIComponent(texto)}`;
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Empresa já cadastrada que parece ser a do perfil (mesmo CNPJ ou mesmo nome). */
function empresaParecida(dados) {
  const cnpj = soDigitos(dados.empresa.cnpj);
  return db.readCollection("empresas").find((e) => (cnpj.length === 14 && soDigitos(e.cnpj) === cnpj) || (dados.empresa.nome && norm(e.nome) === norm(dados.empresa.nome))) || null;
}

const comExtras = (req, s) => ({
  ...s,
  link: `${baseUrl(req)}/perfil-vaga/${s.token}`,
  empresaSugerida: s.dados && s.dados.empresa ? empresaParecida(s.dados) : null,
  jornadaResumo: s.dados && s.dados.jornada ? resumoJornada(s.dados.jornada) : null,
});

router.get("/", (req, res) => {
  const lista = db.readCollection(COL).sort((a, b) => String(b.enviadoEm || b.createdAt).localeCompare(String(a.enviadoEm || a.createdAt)));
  res.json({ lista: lista.map((s) => comExtras(req, s)), linkGeral: `${baseUrl(req)}/perfil-vaga` });
});

router.get("/contagem", (req, res) => {
  res.json({ aguardando: db.readCollection(COL).filter((s) => s.status === "Aguardando validação").length });
});

// Link personalizado: já vai com a empresa e o contato preenchidos (o cliente confere e completa).
router.post("/convite", (req, res) => {
  const b = req.body || {};
  const empresa = b.empresaId ? db.findById("empresas", b.empresaId) : null;
  const contato = { nome: String(b.contatoNome || (empresa && empresa.contatoResponsavel) || "").trim(), email: String(b.email || (empresa && empresa.emailContato) || "").trim(), whatsapp: String(b.whatsapp || (empresa && empresa.whatsappContato) || "").trim() };
  if (!empresa && !String(b.empresaNome || "").trim()) return res.status(400).json({ erro: "Escolha a empresa ou digite o nome do cliente." });
  if (!contato.email && soDigitos(contato.whatsapp).length < 10) return res.status(400).json({ erro: "Informe o e-mail ou o WhatsApp do contato (o cadastro fica ligado a ele)." });
  const dados = normalizarPerfil({
    empresa: empresa ? { nome: empresa.nome, cnpj: empresa.cnpj, segmento: empresa.segmento, endereco: empresa.endereco } : { nome: b.empresaNome },
    contato,
    vaga: { cargo: b.cargo },
  });
  const s = db.insert(COL, {
    token: novoToken(),
    status: "Link enviado",
    origem: "Link personalizado",
    empresaId: empresa ? empresa.id : null,
    dados,
    criadoPor: req.consultor.nome,
    historico: [{ em: new Date().toISOString(), acao: "Link criado", por: req.consultor.nome }],
  });
  const link = `${baseUrl(req)}/perfil-vaga/${s.token}`;
  const texto =
    `Olá${contato.nome ? `, ${contato.nome.split(" ")[0]}` : ""}! Tudo bem? 😊\n\nAqui é a Monara, da Evoé Gestão & RH. Para iniciarmos o processo seletivo com toda a qualidade, preparei um formulário rápido para você nos contar sobre a empresa e o perfil da vaga:\n\n${link}\n\n` +
    "Você pode salvar e voltar depois pelo mesmo link. Assim que recebermos, validamos e te confirmamos por aqui. 💜";
  res.status(201).json({ ...comExtras(req, s), linkWhatsapp: linkWhats(contato.whatsapp, texto), textoConvite: texto });
});

async function avisarCliente(s, assunto, mensagem) {
  const c = s.dados.contato;
  if (!c.email) return { ok: false, erro: "Cliente sem e-mail." };
  if (!emailConfigurado()) return { ok: false, erro: "Envio de e-mail não configurado no servidor." };
  try {
    await enviarEmail({ para: c.email, assunto, texto: mensagem.replace(/\*/g, "") });
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

// Validar: cria (ou usa) a empresa, cria a vaga com o perfil e a página pública e avisa o cliente.
router.post("/:id/validar", async (req, res) => {
  const s = db.findById(COL, req.params.id);
  if (!s) return res.status(404).json({ erro: "Perfil não encontrado." });
  if (s.status === "Validado") return res.status(409).json({ erro: "Este perfil já foi validado." });
  if (s.status === "Link enviado") return res.status(400).json({ erro: "O cliente ainda não preencheu o perfil." });
  const b = req.body || {};
  const consultor = db.findById("consultores", b.consultorId);
  if (!consultor) return res.status(400).json({ erro: "Escolha o consultor responsável pela vaga." });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.prazoFechamento || ""))) return res.status(400).json({ erro: "Informe o prazo de fechamento combinado." });

  const d = s.dados;
  let empresa = b.empresaId ? db.findById("empresas", b.empresaId) : null;
  if (!empresa) {
    empresa = db.insert("empresas", {
      nome: d.empresa.nome,
      cnpj: d.empresa.cnpj,
      endereco: [d.empresa.endereco, d.empresa.bairro, d.empresa.cidade].filter(Boolean).join(", "),
      segmento: d.empresa.segmento,
      contatoResponsavel: d.contato.nome,
      emailContato: d.contato.email,
      whatsappContato: d.contato.whatsapp,
      representanteLegalNome: "",
      representanteLegalCpf: "",
      origemPerfilVagaId: s.id,
    });
  } else {
    // Só completa o que estiver vazio no cadastro da empresa (nada é sobrescrito).
    const completar = { cnpj: d.empresa.cnpj, segmento: d.empresa.segmento, contatoResponsavel: d.contato.nome, emailContato: d.contato.email, whatsappContato: d.contato.whatsapp };
    const vazios = Object.fromEntries(Object.entries(completar).filter(([k, v]) => v && !empresa[k]));
    if (Object.keys(vazios).length) empresa = db.update("empresas", empresa.id, vazios);
  }

  const m = montarVaga(d);
  const agora = new Date().toISOString();
  const vaga = db.insert("vagas", {
    titulo: m.titulo,
    perfilVaga: m.perfilVaga,
    empresaId: empresa.id,
    consultorId: consultor.id,
    dataAbertura: hojeStr(),
    prazoFechamento: b.prazoFechamento,
    prioridade: PRIORIDADES.includes(b.prioridade) ? b.prioridade : "Média",
    salario: m.salario,
    etapaAtual: ETAPAS_VAGA[0],
    dataEntradaEtapa: hojeStr(),
    dataFechamento: null,
    observacoes: d.vaga.quantidade > 1 ? `${d.vaga.quantidade} vagas para este cargo (perfil enviado pelo cliente).` : "Perfil enviado pelo cliente pelo link.",
    alertaPrazoEnviado: false,
    alertaAtrasoEnviado: false,
    alertaSlaProximoEnviado: false,
    alertaSlaEstouradoEnviado: false,
    emStandBy: false,
    dataInicioStandBy: null,
    diasStandByAcumulados: 0,
    motivoStandBy: "",
    pagina: m.pagina,
    paginaAtualizadaEm: agora,
    paginaAtualizadaPor: `${d.contato.nome} (cliente) / validado por ${req.consultor.nome}`,
    perfilClienteId: s.id,
  });
  db.insert("historico", { vagaId: vaga.id, consultorId: vaga.consultorId, etapa: vaga.etapaAtual, dataEntrada: hojeStr(), dataSaida: null });
  notifyMudancaVaga({
    vaga,
    atorId: req.consultor.id,
    tipo: "Nova Vaga Atribuída",
    assunto: `Nova vaga atribuída: ${vaga.titulo}`,
    mensagem: `O perfil enviado por ${empresa.nome} foi validado e a vaga "${vaga.titulo}" foi atribuída a você. Prazo combinado: ${vaga.prazoFechamento}. O perfil completo e a página de divulgação já estão preenchidos.`,
  });

  const mensagem = String(b.mensagem || "").trim() || mensagemValidacao(s);
  const email = await avisarCliente(s, `Perfil da vaga de ${d.vaga.cargo} validado — Evoé Gestão & RH`, mensagem);
  const atualizado = db.update(COL, s.id, {
    status: "Validado",
    validadoEm: agora,
    validadoPor: req.consultor.nome,
    empresaId: empresa.id,
    vagaId: vaga.id,
    mensagemCliente: mensagem,
    historico: [...(s.historico || []), { em: agora, acao: "Validado e vaga criada", por: req.consultor.nome }, { em: agora, acao: email.ok ? "Confirmação enviada por e-mail" : `E-mail não enviado: ${email.erro}` }],
  });
  res.json({ solicitacao: comExtras(req, atualizado), vaga, email, linkWhatsapp: linkWhats(d.contato.whatsapp, mensagem) });
});

// Pedir ajuste: o cliente vê a mensagem no mesmo link e pode corrigir e reenviar.
router.post("/:id/ajuste", async (req, res) => {
  const s = db.findById(COL, req.params.id);
  if (!s) return res.status(404).json({ erro: "Perfil não encontrado." });
  if (s.status === "Validado") return res.status(409).json({ erro: "Este perfil já foi validado." });
  const pedido = String((req.body || {}).mensagem || "").trim().slice(0, 2000);
  if (!pedido) return res.status(400).json({ erro: "Escreva o que o cliente precisa ajustar." });
  const link = `${baseUrl(req)}/perfil-vaga/${s.token}`;
  const nome = String(s.dados.contato.nome || "").split(" ")[0];
  const mensagem = `Olá${nome ? `, ${nome}` : ""}! Aqui é a Monara, da Evoé Gestão & RH. Revisamos o perfil da vaga de *${s.dados.vaga.cargo}* e precisamos de um pequeno ajuste:\n\n${pedido}\n\nÉ só abrir o mesmo link, ajustar e enviar de novo: ${link}\n\nObrigada! 💜`;
  const email = await avisarCliente(s, `Ajuste no perfil da vaga de ${s.dados.vaga.cargo} — Evoé Gestão & RH`, mensagem);
  const agora = new Date().toISOString();
  const atualizado = db.update(COL, s.id, {
    status: "Ajuste solicitado",
    mensagemCliente: pedido,
    historico: [...(s.historico || []), { em: agora, acao: `Ajuste solicitado: ${pedido}`, por: req.consultor.nome }, { em: agora, acao: email.ok ? "Pedido enviado por e-mail" : `E-mail não enviado: ${email.erro}` }],
  });
  res.json({ solicitacao: comExtras(req, atualizado), email, linkWhatsapp: linkWhats(s.dados.contato.whatsapp, mensagem) });
});

router.post("/:id/arquivar", (req, res) => {
  const s = db.findById(COL, req.params.id);
  if (!s) return res.status(404).json({ erro: "Perfil não encontrado." });
  const arquivar = (req.body || {}).desarquivar ? false : true;
  const status = arquivar ? "Arquivado" : s.statusAntesDeArquivar || "Aguardando validação";
  const atualizado = db.update(COL, s.id, {
    status,
    ...(arquivar ? { statusAntesDeArquivar: s.status } : {}),
    historico: [...(s.historico || []), { em: new Date().toISOString(), acao: arquivar ? "Arquivado" : "Desarquivado", por: req.consultor.nome }],
  });
  res.json(comExtras(req, atualizado));
});

module.exports = router;
