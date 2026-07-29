const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { requireGestor } = require("../middleware/auth");
const { PERFIS_ACESSO, TIPOS_VINCULO } = require("../utils/constants");

const router = express.Router();

// Qualquer usuário autenticado pode listar consultores (precisa para os seletores de formulário).
router.get("/", (req, res) => {
  const users = db.readCollection("users");
  const consultores = db.readCollection("consultores").map((c) => {
    const user = users.find((u) => u.consultorId === c.id);
    return { ...c, username: user ? user.username : null };
  });
  res.json(consultores);
});

router.get("/:id", (req, res) => {
  const consultor = db.findById("consultores", req.params.id);
  if (!consultor) return res.status(404).json({ erro: "Consultor não encontrado." });
  res.json(consultor);
});

// Apenas Gestor pode criar/editar consultores (gestão de equipe).
router.post("/", requireGestor, (req, res) => {
  const {
    nome, email, whatsapp, perfil, ativo, username, senha,
    dataAdmissao, tipoVinculo, valorRemuneracao, beneficios, cpf, dataNascimento, endereco,
  } = req.body || {};
  if (!nome || !email || !perfil || !PERFIS_ACESSO.includes(perfil)) {
    return res.status(400).json({ erro: "Nome, e-mail e perfil (Gestor/Recrutador) são obrigatórios." });
  }
  if (tipoVinculo && !TIPOS_VINCULO.includes(tipoVinculo)) {
    return res.status(400).json({ erro: "Tipo de vínculo inválido." });
  }

  // Valida o usuário de login ANTES de criar o consultor, para nunca deixar um
  // consultor "órfão" (criado, mas sem conseguir fazer login) sem avisar o Gestor.
  let usernameNormalizado = null;
  if (username && senha) {
    usernameNormalizado = String(username).trim().toLowerCase();
    const jaExiste = db.readCollection("users").some((u) => u.username === usernameNormalizado);
    if (jaExiste) {
      return res
        .status(400)
        .json({ erro: `O usuário "${usernameNormalizado}" já está em uso por outro consultor. Escolha outro nome de usuário.` });
    }
  }

  const consultor = db.insert("consultores", {
    nome,
    email,
    whatsapp: whatsapp || "",
    perfil,
    ativo: ativo !== false,
    dataAdmissao: dataAdmissao || "",
    dataDesligamento: null,
    tipoVinculo: tipoVinculo || "CLT",
    valorRemuneracao: Number(valorRemuneracao) || 0,
    beneficios: beneficios || "",
    cpf: cpf || "",
    dataNascimento: dataNascimento || "",
    endereco: endereco || "",
  });

  if (usernameNormalizado) {
    db.insert("users", {
      consultorId: consultor.id,
      username: usernameNormalizado,
      passwordHash: bcrypt.hashSync(senha, 10),
    });
  }

  res.status(201).json(consultor);
});

router.patch("/:id", requireGestor, (req, res) => {
  const {
    nome, email, whatsapp, perfil, ativo,
    dataAdmissao, dataDesligamento, tipoVinculo, valorRemuneracao, beneficios, cpf, dataNascimento, endereco,
  } = req.body || {};
  if (perfil && !PERFIS_ACESSO.includes(perfil)) {
    return res.status(400).json({ erro: "Perfil inválido." });
  }
  if (tipoVinculo && !TIPOS_VINCULO.includes(tipoVinculo)) {
    return res.status(400).json({ erro: "Tipo de vínculo inválido." });
  }
  const atualizado = db.update("consultores", req.params.id, {
    nome, email, whatsapp, perfil, ativo,
    dataAdmissao, dataDesligamento, tipoVinculo,
    valorRemuneracao: valorRemuneracao !== undefined ? Number(valorRemuneracao) || 0 : undefined,
    beneficios, cpf, dataNascimento, endereco,
  });
  if (!atualizado) return res.status(404).json({ erro: "Consultor não encontrado." });
  res.json(atualizado);
});

// Redefinir usuário/senha de login de um consultor já existente (só Gestor).
router.patch("/:id/credenciais", requireGestor, (req, res) => {
  const consultor = db.findById("consultores", req.params.id);
  if (!consultor) return res.status(404).json({ erro: "Consultor não encontrado." });

  const { username, senha } = req.body || {};
  if (!username || !senha) {
    return res.status(400).json({ erro: "Usuário e senha são obrigatórios." });
  }

  const usernameNormalizado = String(username).trim().toLowerCase();
  const users = db.readCollection("users");
  const emUsoPorOutro = users.some(
    (u) => u.username === usernameNormalizado && u.consultorId !== consultor.id
  );
  if (emUsoPorOutro) {
    return res.status(400).json({ erro: "Esse nome de usuário já está em uso por outro consultor." });
  }

  const existente = users.find((u) => u.consultorId === consultor.id);
  const passwordHash = bcrypt.hashSync(senha, 10);
  if (existente) {
    db.update("users", existente.id, { username: usernameNormalizado, passwordHash });
  } else {
    db.insert("users", { consultorId: consultor.id, username: usernameNormalizado, passwordHash });
  }

  res.json({ username: usernameNormalizado });
});

// Excluir consultor (e o login associado, se existir). Só Gestor, e não pode excluir a si mesmo.
router.delete("/:id", requireGestor, (req, res) => {
  const consultor = db.findById("consultores", req.params.id);
  if (!consultor) return res.status(404).json({ erro: "Consultor não encontrado." });
  if (req.consultor && req.consultor.id === consultor.id) {
    return res.status(400).json({ erro: "Você não pode excluir o consultor com o qual está logada agora." });
  }
  const userDoConsultor = db.readCollection("users").find((u) => u.consultorId === consultor.id);
  if (userDoConsultor) db.remove("users", userDoConsultor.id);
  db.remove("consultores", consultor.id);
  res.json({ ok: true });
});

module.exports = router;
