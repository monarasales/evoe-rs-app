const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { requireGestor } = require("../middleware/auth");
const { PERFIS_ACESSO, TIPOS_VINCULO, MODALIDADES_TRABALHO, DIAS_SEMANA } = require("../utils/constants");
const { geocodificarEndereco } = require("../utils/geo");

const router = express.Router();

// Valida a estrutura do horário esperado (usado no Controle de Ponto dos estagiários):
// { dias: ["Segunda", ...], entrada: "08:00", saida: "14:00" }. Aceita null/undefined
// (funcionário sem horário cadastrado ainda) — só valida quando algo foi enviado.
function horarioValido(horario) {
  if (horario == null) return true;
  if (typeof horario !== "object") return false;
  const { dias, entrada, saida } = horario;
  if (!Array.isArray(dias) || dias.some((d) => !DIAS_SEMANA.includes(d))) return false;
  const horaRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (!horaRegex.test(entrada || "") || !horaRegex.test(saida || "")) return false;
  const [he, me] = entrada.split(":").map(Number);
  const [hs, ms] = saida.split(":").map(Number);
  return hs * 60 + ms > he * 60 + me;
}

// Geocodifica endereço residencial e/ou de trabalho quando mudam (só para quem usa
// Controle de Ponto — tipoVinculo "Estágio" — para não gastar chamadas à toa). Nunca
// derruba o cadastro se a geocodificação falhar: só fica sem a checagem de distância.
async function geocodificarSeNecessario(tipoVinculo, enderecoAntigo, enderecoNovo, enderecoTrabalhoAntigo, enderecoTrabalhoNovo) {
  const resultado = {};
  if (tipoVinculo !== "Estágio") return resultado;

  if (enderecoNovo !== undefined && enderecoNovo !== enderecoAntigo) {
    const geo = await geocodificarEndereco(enderecoNovo);
    resultado.enderecoLat = geo ? geo.lat : null;
    resultado.enderecoLng = geo ? geo.lng : null;
  }
  if (enderecoTrabalhoNovo !== undefined && enderecoTrabalhoNovo !== enderecoTrabalhoAntigo) {
    const geo = await geocodificarEndereco(enderecoTrabalhoNovo);
    resultado.enderecoTrabalhoLat = geo ? geo.lat : null;
    resultado.enderecoTrabalhoLng = geo ? geo.lng : null;
  }
  return resultado;
}

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
router.post("/", requireGestor, async (req, res) => {
  const {
    nome, email, whatsapp, perfil, ativo, username, senha,
    dataAdmissao, tipoVinculo, valorRemuneracao, beneficios, cpf, dataNascimento, endereco,
    enderecoTrabalho, modalidadeTrabalho, horarioEsperado,
  } = req.body || {};
  if (!nome || !email || !perfil || !PERFIS_ACESSO.includes(perfil)) {
    return res.status(400).json({ erro: "Nome, e-mail e perfil (Gestor/Recrutador) são obrigatórios." });
  }
  if (tipoVinculo && !TIPOS_VINCULO.includes(tipoVinculo)) {
    return res.status(400).json({ erro: "Tipo de vínculo inválido." });
  }
  if (modalidadeTrabalho && !MODALIDADES_TRABALHO.includes(modalidadeTrabalho)) {
    return res.status(400).json({ erro: "Modalidade de trabalho inválida." });
  }
  if (!horarioValido(horarioEsperado)) {
    return res.status(400).json({ erro: "Horário esperado inválido — confira os dias e o horário de entrada/saída." });
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

  const geo = await geocodificarSeNecessario(tipoVinculo, undefined, endereco || "", undefined, enderecoTrabalho || "");

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
    enderecoLat: geo.enderecoLat ?? null,
    enderecoLng: geo.enderecoLng ?? null,
    // Controle de Ponto (estagiários): endereço de trabalho, modalidade e horário
    // esperado. Ficam vazios/null para quem não usa ponto (CLT/PJ/Outro).
    enderecoTrabalho: enderecoTrabalho || "",
    enderecoTrabalhoLat: geo.enderecoTrabalhoLat ?? null,
    enderecoTrabalhoLng: geo.enderecoTrabalhoLng ?? null,
    modalidadeTrabalho: modalidadeTrabalho || "Presencial",
    horarioEsperado: horarioEsperado || null,
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

router.patch("/:id", requireGestor, async (req, res) => {
  const consultorAtual = db.findById("consultores", req.params.id);
  if (!consultorAtual) return res.status(404).json({ erro: "Consultor não encontrado." });

  const {
    nome, email, whatsapp, perfil, ativo,
    dataAdmissao, dataDesligamento, tipoVinculo, valorRemuneracao, beneficios, cpf, dataNascimento, endereco,
    enderecoTrabalho, modalidadeTrabalho, horarioEsperado,
  } = req.body || {};
  if (perfil && !PERFIS_ACESSO.includes(perfil)) {
    return res.status(400).json({ erro: "Perfil inválido." });
  }
  if (tipoVinculo && !TIPOS_VINCULO.includes(tipoVinculo)) {
    return res.status(400).json({ erro: "Tipo de vínculo inválido." });
  }
  if (modalidadeTrabalho && !MODALIDADES_TRABALHO.includes(modalidadeTrabalho)) {
    return res.status(400).json({ erro: "Modalidade de trabalho inválida." });
  }
  if (!horarioValido(horarioEsperado)) {
    return res.status(400).json({ erro: "Horário esperado inválido — confira os dias e o horário de entrada/saída." });
  }

  const geo = await geocodificarSeNecessario(
    tipoVinculo || consultorAtual.tipoVinculo,
    consultorAtual.endereco,
    endereco,
    consultorAtual.enderecoTrabalho,
    enderecoTrabalho
  );

  const atualizado = db.update("consultores", req.params.id, {
    nome, email, whatsapp, perfil, ativo,
    dataAdmissao, dataDesligamento, tipoVinculo,
    valorRemuneracao: valorRemuneracao !== undefined ? Number(valorRemuneracao) || 0 : undefined,
    beneficios, cpf, dataNascimento, endereco,
    enderecoTrabalho, modalidadeTrabalho, horarioEsperado,
    ...geo,
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
