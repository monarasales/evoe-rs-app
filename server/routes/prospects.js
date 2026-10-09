// CRM — Prospects: todo mundo que entra em contato querendo cotar um serviço
// (seleção, implantação de RH, implantação de cultura, pesquisa de clima), ainda sem
// ser cliente. Serve para a Evoé fazer follow-up e entender quem indicou / por que
// eventualmente não fechou.
//
// Atualização sempre por MERGE (campos antigos ou desconhecidos continuam no registro).
// Interações (ligação, WhatsApp, reunião...) ficam em "interacoes" e nunca são apagadas.

const express = require("express");
const db = require("../db");
const { requireAuth, requireGestor } = require("../middleware/auth");
const { SERVICOS_PROSPECT, ETAPAS_PROSPECT, ORIGENS_PROSPECT, TEMPERATURAS_PROSPECT, MOTIVOS_PERDA_PROSPECT } = require("../utils/constants");
const { dataIso } = require("../utils/validacao");

const router = express.Router();
// Área Comercial: exclusiva do perfil Gestor.
router.use(requireAuth, requireGestor);

/** Telefone comparável: só dígitos, sem 0 inicial nem +55 (para achar duplicados). */
function chaveTelefone(tel) {
  let d = String(tel || "").replace(/\D/g, "").replace(/^0+/, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  return d.length >= 10 ? d : "";
}
const acharPorTelefone = (tel, ignorarId = null) => {
  const k = chaveTelefone(tel);
  return k ? db.readCollection("prospects").find((p) => p.id !== ignorarId && chaveTelefone(p.telefone) === k) : null;
};

router.get("/", (req, res) => {
  const prospects = db.readCollection("prospects").sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  res.json(prospects);
});

router.get("/opcoes", (req, res) => {
  res.json({
    servicos: SERVICOS_PROSPECT,
    etapas: ETAPAS_PROSPECT,
    origens: ORIGENS_PROSPECT,
    temperaturas: TEMPERATURAS_PROSPECT,
    motivosPerda: MOTIVOS_PERDA_PROSPECT,
  });
});

router.get("/:id", (req, res) => {
  const prospect = db.findById("prospects", req.params.id);
  if (!prospect) return res.status(404).json({ erro: "Prospect não encontrado." });
  res.json(prospect);
});

const texto = (v, max = 500) => String(v == null ? "" : v).trim().slice(0, max);
/** "R$ 1.500,00", "1500", "1.500" → 1500. */
function numero(v) {
  let t = String(v == null ? "" : v).replace(/[^\d,.]/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}
const dataOuNull = (v) => (v ? dataIso(v) : null);

function extrairCampos(body) {
  const b = body || {};
  return {
    nome: texto(b.nome, 150),
    empresa: texto(b.empresa, 150),
    telefone: texto(b.telefone, 30),
    email: texto(b.email, 160).toLowerCase(),
    origem: ORIGENS_PROSPECT.includes(b.origem) ? b.origem : "",
    servicoDesejado: SERVICOS_PROSPECT.includes(b.servicoDesejado) ? b.servicoDesejado : SERVICOS_PROSPECT[0],
    servicoOutro: texto(b.servicoOutro, 150),
    cargos: texto(b.cargos, 300),
    qtdVagas: Math.max(0, Math.min(999, parseInt(b.qtdVagas, 10) || 0)),
    valorProposta: numero(b.valorProposta),
    temperatura: TEMPERATURAS_PROSPECT.includes(b.temperatura) ? b.temperatura : "",
    quemIndicou: texto(b.quemIndicou, 150),
    motivoPerda: MOTIVOS_PERDA_PROSPECT.includes(b.motivoPerda) ? b.motivoPerda : "",
    motivoNaoFechou: texto(b.motivoNaoFechou, 500),
    etapa: ETAPAS_PROSPECT.includes(b.etapa) ? b.etapa : ETAPAS_PROSPECT[0],
    dataContato: dataOuNull(b.dataContato) || new Date().toISOString().slice(0, 10),
    proximoFollowUp: dataOuNull(b.proximoFollowUp),
    observacoes: texto(b.observacoes, 4000),
  };
}

/** Registra no histórico a mudança de etapa (com quem e quando). */
function historicoEtapa(anterior, nova, req) {
  if (!anterior || anterior.etapa === nova) return {};
  return {
    historicoEtapas: [...(anterior.historicoEtapas || []), { de: anterior.etapa, para: nova, em: new Date().toISOString(), por: req.consultor.nome }],
    ...(["Fechado", "Perdido"].includes(nova) ? { encerradoEm: new Date().toISOString().slice(0, 10) } : {}),
  };
}

router.post("/", (req, res) => {
  const campos = extrairCampos(req.body);
  if (!campos.nome) return res.status(400).json({ erro: "Nome da pessoa de contato é obrigatório." });
  const dup = acharPorTelefone(campos.telefone);
  if (dup && !(req.body || {}).ignorarDuplicado) {
    return res.status(409).json({ erro: `Já existe um prospect com esse telefone: ${dup.nome}${dup.empresa ? ` (${dup.empresa})` : ""}.`, existenteId: dup.id });
  }
  const prospect = db.insert("prospects", { ...campos, interacoes: [], historicoEtapas: [], criadoPorId: req.consultor.id, criadoPor: req.consultor.nome });
  res.status(201).json(prospect);
});

// Importação em lote (ex.: contatos levantados no WhatsApp). Não duplica telefone já
// cadastrado: nesses casos só preenche campos vazios e guarda o resumo como interação.
router.post("/importar", (req, res) => {
  const linhas = Array.isArray((req.body || {}).prospects) ? req.body.prospects.slice(0, 500) : [];
  if (!linhas.length) return res.status(400).json({ erro: "Nenhum contato para importar." });
  const resultado = { criados: 0, atualizados: 0, ignorados: 0 };
  const agora = new Date().toISOString();
  for (const l of linhas) {
    const campos = extrairCampos({ origem: "WhatsApp", ...l });
    if (!campos.nome && !campos.telefone) {
      resultado.ignorados++;
      continue;
    }
    if (!campos.nome) campos.nome = campos.telefone;
    const nota = texto(l.resumo, 2000);
    const interacao = nota ? { id: db.newId(), em: agora, por: req.consultor.nome, canal: campos.origem || "WhatsApp", texto: nota } : null;
    const existente = acharPorTelefone(campos.telefone);
    if (existente) {
      const vazios = Object.fromEntries(Object.entries(campos).filter(([k, v]) => v && !existente[k] && !["etapa", "dataContato", "servicoDesejado"].includes(k)));
      db.update("prospects", existente.id, { ...vazios, ...(interacao ? { interacoes: [...(existente.interacoes || []), interacao] } : {}) });
      resultado.atualizados++;
      continue;
    }
    db.insert("prospects", {
      ...campos,
      interacoes: interacao ? [interacao] : [],
      historicoEtapas: [],
      importadoEm: agora,
      criadoPorId: req.consultor.id,
      criadoPor: req.consultor.nome,
    });
    resultado.criados++;
  }
  res.json(resultado);
});

router.patch("/:id", (req, res) => {
  const prospect = db.findById("prospects", req.params.id);
  if (!prospect) return res.status(404).json({ erro: "Prospect não encontrado." });
  const campos = extrairCampos({ ...prospect, ...req.body });
  if (!campos.nome) return res.status(400).json({ erro: "Nome da pessoa de contato é obrigatório." });
  const dup = acharPorTelefone(campos.telefone, prospect.id);
  if (dup && chaveTelefone(campos.telefone) !== chaveTelefone(prospect.telefone)) {
    return res.status(409).json({ erro: `Já existe um prospect com esse telefone: ${dup.nome}.`, existenteId: dup.id });
  }
  res.json(db.update("prospects", prospect.id, { ...campos, ...historicoEtapa(prospect, campos.etapa, req) }));
});

// Interação (ligação, WhatsApp, reunião, e-mail): opcionalmente já agenda o próximo follow-up.
router.post("/:id/interacoes", (req, res) => {
  const prospect = db.findById("prospects", req.params.id);
  if (!prospect) return res.status(404).json({ erro: "Prospect não encontrado." });
  const b = req.body || {};
  const t = texto(b.texto, 2000);
  if (!t) return res.status(400).json({ erro: "Descreva a interação." });
  const dados = {
    interacoes: [...(prospect.interacoes || []), { id: db.newId(), em: new Date().toISOString(), por: req.consultor.nome, canal: texto(b.canal, 30) || "Anotação", texto: t }],
  };
  if (b.proximoFollowUp !== undefined) dados.proximoFollowUp = dataOuNull(b.proximoFollowUp);
  if (prospect.etapa === "Novo") Object.assign(dados, { etapa: "Em Contato", ...historicoEtapa(prospect, "Em Contato", req) });
  res.json(db.update("prospects", prospect.id, dados));
});

// Fechou: cria a empresa em Clientes (ou usa a que já tem o mesmo nome) e liga ao prospect.
router.post("/:id/converter", (req, res) => {
  const prospect = db.findById("prospects", req.params.id);
  if (!prospect) return res.status(404).json({ erro: "Prospect não encontrado." });
  const ja = prospect.empresaId && db.findById("empresas", prospect.empresaId);
  if (ja) return res.json({ prospect, empresa: ja });
  const nomeEmpresa = prospect.empresa || prospect.nome;
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  let empresa = db.readCollection("empresas").find((e) => norm(e.nome) === norm(nomeEmpresa));
  if (!empresa) {
    empresa = db.insert("empresas", {
      nome: nomeEmpresa,
      cnpj: "",
      endereco: "",
      segmento: "",
      contatoResponsavel: prospect.nome,
      emailContato: prospect.email || "",
      whatsappContato: prospect.telefone || "",
      representanteLegalNome: "",
      representanteLegalCpf: "",
      origemProspectId: prospect.id,
    });
  }
  const atualizado = db.update("prospects", prospect.id, {
    empresaId: empresa.id,
    convertidoEm: new Date().toISOString(),
    etapa: "Fechado",
    ...historicoEtapa(prospect, "Fechado", req),
  });
  res.json({ prospect: atualizado, empresa });
});

router.delete("/:id", (req, res) => {
  const ok = db.remove("prospects", req.params.id);
  if (!ok) return res.status(404).json({ erro: "Prospect não encontrado." });
  res.json({ ok: true });
});

module.exports = router;
