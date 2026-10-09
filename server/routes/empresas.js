const express = require("express");
const db = require("../db");
const { requireGestor } = require("../middleware/auth");
const { notify } = require("../utils/notify");

const router = express.Router();

// Consultar empresas: todos com login (o Funil e os Candidatos precisam do nome da
// empresa de cada vaga). Criar, editar e excluir: só o Gestor (área Comercial/CRM).

// Consultores veem só o necessário para conduzir a vaga (nome e contato). CNPJ, endereço
// e representante legal são dados de contrato: só o Gestor recebe.
const CAMPOS_CONSULTOR = ["id", "nome", "segmento", "contatoResponsavel", "emailContato", "whatsappContato", "cadastroRapido"];
const paraPerfil = (req, e) =>
  req.consultor.perfil === "Gestor" ? e : Object.fromEntries(CAMPOS_CONSULTOR.filter((k) => e[k] !== undefined).map((k) => [k, e[k]]));

router.get("/", (req, res) => {
  res.json(db.readCollection("empresas").map((e) => paraPerfil(req, e)));
});

router.get("/:id", (req, res) => {
  const empresa = db.findById("empresas", req.params.id);
  if (!empresa) return res.status(404).json({ erro: "Empresa não encontrada." });
  res.json(paraPerfil(req, empresa));
});

// Cadastro rápido de cliente pelo consultor, direto na tela da vaga (o CRM continua só
// do Gestor). Só nome e contato — nada comercial. Nome já existente não duplica: devolve
// a empresa cadastrada. A gestão é avisada para completar os dados no CRM.
const normalizarNome = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(ltda|me|epp|eireli|s\/?a)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

router.post("/rapido", (req, res) => {
  const b = req.body || {};
  const t = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
  const nome = t(b.nome, 150);
  if (nome.length < 2) return res.status(400).json({ erro: "Informe o nome da empresa." });
  const existente = db.readCollection("empresas").find((e) => normalizarNome(e.nome) === normalizarNome(nome));
  if (existente) return res.json({ ...paraPerfil(req, existente), jaExistia: true });
  const empresa = db.insert("empresas", {
    nome,
    cnpj: "",
    endereco: "",
    segmento: "",
    contatoResponsavel: t(b.contatoResponsavel, 120),
    emailContato: t(b.emailContato, 160).toLowerCase(),
    whatsappContato: t(b.whatsappContato, 20),
    representanteLegalNome: "",
    representanteLegalCpf: "",
    cadastroRapido: { por: req.consultor.nome, porId: req.consultor.id, em: new Date().toISOString() },
  });
  db.readCollection("consultores")
    .filter((c) => c.perfil === "Gestor" && c.ativo !== false && c.id !== req.consultor.id)
    .forEach((g) =>
      notify({
        tipo: "Novo cliente",
        destinatarioId: g.id,
        assunto: `Novo cliente cadastrado: ${nome}`,
        mensagem: `${req.consultor.nome} cadastrou o cliente "${nome}" ao abrir uma vaga. Complete os dados comerciais (CNPJ, endereço, representante legal) no CRM.`,
      })
    );
  res.status(201).json(paraPerfil(req, empresa));
});

router.post("/", requireGestor, (req, res) => {
  const {
    nome,
    cnpj,
    endereco,
    segmento,
    contatoResponsavel,
    emailContato,
    whatsappContato,
    representanteLegalNome,
    representanteLegalCpf,
  } = req.body || {};
  if (!nome) return res.status(400).json({ erro: "Nome da empresa é obrigatório." });
  const empresa = db.insert("empresas", {
    nome,
    cnpj: cnpj || "",
    endereco: endereco || "",
    segmento: segmento || "",
    contatoResponsavel: contatoResponsavel || "",
    emailContato: emailContato || "",
    whatsappContato: whatsappContato || "",
    representanteLegalNome: representanteLegalNome || "",
    representanteLegalCpf: representanteLegalCpf || "",
  });
  res.status(201).json(empresa);
});

router.patch("/:id", requireGestor, (req, res) => {
  const atualizado = db.update("empresas", req.params.id, req.body || {});
  if (!atualizado) return res.status(404).json({ erro: "Empresa não encontrada." });
  res.json(atualizado);
});

router.delete("/:id", requireGestor, (req, res) => {
  const emUso = db.readCollection("vagas").some((v) => v.empresaId === req.params.id);
  if (emUso) {
    return res.status(409).json({ erro: "Esta empresa possui vagas vinculadas e não pode ser excluída." });
  }
  const ok = db.remove("empresas", req.params.id);
  if (!ok) return res.status(404).json({ erro: "Empresa não encontrada." });
  res.json({ ok: true });
});

module.exports = router;
