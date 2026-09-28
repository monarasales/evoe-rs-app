const express = require("express");
const db = require("../db");
const { requireGestor } = require("../middleware/auth");
const { buscarCep, geocodificarEndereco, limparCep } = require("../utils/cep");

const router = express.Router();

// ============= UTILITÁRIOS =============

// Função para calcular distância entre dois pontos (Haversine)
function calcularDistancia(lat1, lon1, lat2, lon2) {
  const R = 6371; // Raio da Terra em km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 1000; // Retorna em metros
}

// Mantido para compatibilidade com quem importa router.validateLocalizacao.
async function obterLocalizacaoPorCEP(cep) {
  const end = await buscarCep(cep);
  if (!end) return null;
  const coords = await geocodificarEndereco(end);
  return {
    cep: end.cep,
    endereco: [end.logradouro, end.bairro].filter(Boolean).join(", "),
    cidade: end.cidade,
    estado: end.estado,
    lat: coords ? coords.lat : null,
    long: coords ? coords.long : null,
  };
}

/** Confere os dígitos verificadores do CPF. */
function cpfValido(cpf) {
  const n = String(cpf).replace(/\D/g, "");
  if (n.length !== 11 || /^(\d)\1{10}$/.test(n)) return false;
  for (const tam of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < tam; i++) soma += Number(n[i]) * (tam + 1 - i);
    const digito = ((soma * 10) % 11) % 10;
    if (digito !== Number(n[tam])) return false;
  }
  return true;
}

/** Data AAAA-MM-DD válida, não futura e depois de 1900. */
function dataNascimentoValida(data) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const d = new Date(data + "T00:00:00");
  return !isNaN(d) && d.getFullYear() >= 1900 && d <= new Date();
}

const CAMPOS_TEXTO = [
  "nome",
  "cargo",
  "cpf",
  "dataNascimento",
  "dataInicioPonto",
  "email",
  "telefone",
  "cepResidencial",
  "enderecoResidencial", // logradouro (rua/avenida)
  "numeroResidencial",
  "complementoResidencial",
  "bairroResidencial",
  "cidadeResidencial",
  "estadoResidencial",
  "horarioInicio",
  "horarioFim",
];
const CAMPOS_ENDERECO = [
  "cepResidencial",
  "enderecoResidencial",
  "numeroResidencial",
  "bairroResidencial",
  "cidadeResidencial",
  "estadoResidencial",
];

/** Extrai e valida os campos do corpo da requisição. Retorna { dados } ou { erro }. */
function lerCampos(body) {
  const dados = {};
  for (const campo of CAMPOS_TEXTO) {
    if (body[campo] !== undefined) dados[campo] = String(body[campo] || "").trim();
  }
  if (dados.cepResidencial !== undefined) dados.cepResidencial = limparCep(dados.cepResidencial);
  if (dados.estadoResidencial) dados.estadoResidencial = dados.estadoResidencial.toUpperCase().slice(0, 2);
  if (body.diasHomeOffice !== undefined) {
    dados.diasHomeOffice = Array.isArray(body.diasHomeOffice) ? body.diasHomeOffice : [];
  }
  if (body.ativo !== undefined) dados.ativo = body.ativo !== false;
  if (body.consultorId !== undefined) dados.consultorId = body.consultorId || null;

  if (dados.nome !== undefined && !dados.nome) return { erro: "Nome é obrigatório." };
  if (dados.cepResidencial && dados.cepResidencial.length !== 8) {
    return { erro: "O CEP deve ter 8 dígitos (ou deixe em branco)." };
  }
  if (dados.cpf && !cpfValido(dados.cpf)) return { erro: "CPF inválido. Confira os números." };
  if (dados.dataNascimento && !dataNascimentoValida(dados.dataNascimento)) {
    return { erro: "Data de nascimento inválida." };
  }
  if (dados.dataInicioPonto && !/^\d{4}-\d{2}-\d{2}$/.test(dados.dataInicioPonto)) {
    return { erro: "Data de início do controle de ponto inválida." };
  }
  return { dados };
}

/** O login (consultor) só pode estar ligado a um colaborador. Retorna mensagem de erro ou null. */
function erroVinculoLogin(consultorId, colaboradorId) {
  if (!consultorId) return null;
  const consultor = db.findById("consultores", consultorId);
  if (!consultor) return "Login selecionado não existe mais. Atualize a página e tente de novo.";
  const outro = db
    .readCollection("colaboradores")
    .find((c) => c.consultorId === consultorId && c.id !== colaboradorId);
  if (outro) return `Esse login já está vinculado ao colaborador "${outro.nome}".`;
  return null;
}

/** Coordenadas da casa (para validar ponto em home office). Nunca bloqueia o cadastro. */
async function localizarResidencia(c) {
  const coords = await geocodificarEndereco({
    logradouro: c.enderecoResidencial,
    numero: c.numeroResidencial,
    cidade: c.cidadeResidencial,
    estado: c.estadoResidencial,
    cep: c.cepResidencial,
  });
  return coords;
}

// ============= ROTAS =============
// Todas exigem login (proteção central em server/index.js). Cadastro com CPF,
// endereço e nascimento é dado pessoal (LGPD): só o Gestor lê e altera. Cada pessoa
// vê o próprio cadastro pela tela de Ponto (/api/ponto/meu-cadastro).

// Listar todos os colaboradores
router.get("/", requireGestor, (req, res) => {
  const colaboradores = db.readCollection("colaboradores") || [];
  res.json(colaboradores);
});

// Obter colaborador por ID
router.get("/:id", requireGestor, (req, res) => {
  const colaborador = db.findById("colaboradores", req.params.id);
  if (!colaborador) return res.status(404).json({ erro: "Colaborador não encontrado." });
  res.json(colaborador);
});

// Buscar endereço pelo CEP (para preencher o formulário automaticamente)
router.post("/geocodificar/cep", async (req, res) => {
  const end = await buscarCep((req.body || {}).cep);
  if (!end) return res.status(404).json({ erro: "CEP não encontrado. Preencha o endereço manualmente." });
  res.json(end);
});

// Criar novo colaborador (apenas Gestor)
router.post("/", requireGestor, async (req, res) => {
  const { dados, erro } = lerCampos(req.body || {});
  if (erro) return res.status(400).json({ erro });
  if (!dados.nome) return res.status(400).json({ erro: "Nome é obrigatório." });
  const erroLogin = erroVinculoLogin(dados.consultorId, null);
  if (erroLogin) return res.status(400).json({ erro: erroLogin });

  const novo = {
    cargo: "",
    cpf: "",
    dataNascimento: "",
    email: "",
    telefone: "",
    cepResidencial: "",
    enderecoResidencial: "",
    numeroResidencial: "",
    complementoResidencial: "",
    bairroResidencial: "",
    cidadeResidencial: "",
    estadoResidencial: "",
    horarioInicio: "08:00",
    horarioFim: "18:00",
    diasHomeOffice: ["sexta"], // dias em minúsculas: ["segunda", "sexta", ...]
    raioTolerancia: 500, // metros
    ativo: true,
    consultorId: null, // login do sistema ligado a este colaborador (para bater ponto)
    ...dados,
    criadoEm: new Date().toISOString(),
  };
  novo.localizacaoResidencial = await localizarResidencia(novo);

  res.status(201).json(db.insert("colaboradores", novo));
});

// Editar colaborador (apenas Gestor)
router.patch("/:id", requireGestor, async (req, res) => {
  const colaborador = db.findById("colaboradores", req.params.id);
  if (!colaborador) return res.status(404).json({ erro: "Colaborador não encontrado." });

  const { dados, erro } = lerCampos(req.body || {});
  if (erro) return res.status(400).json({ erro });
  const erroLogin = erroVinculoLogin(dados.consultorId, colaborador.id);
  if (erroLogin) return res.status(400).json({ erro: erroLogin });

  const atualizado = { ...colaborador, ...dados };
  const enderecoMudou = CAMPOS_ENDERECO.some((c) => (atualizado[c] || "") !== (colaborador[c] || ""));
  if (enderecoMudou || !colaborador.localizacaoResidencial || colaborador.localizacaoResidencial.lat == null) {
    dados.localizacaoResidencial = await localizarResidencia(atualizado);
  }

  res.json(db.update("colaboradores", req.params.id, dados));
});

// Excluir colaborador (apenas Gestor)
router.delete("/:id", requireGestor, (req, res) => {
  const deletado = db.remove("colaboradores", req.params.id);
  if (!deletado) return res.status(404).json({ erro: "Colaborador não encontrado." });
  res.json({ sucesso: true });
});

// Função exportada para validação de localização (usada por ponto.js)
router.validateLocalizacao = { calcularDistancia, obterLocalizacaoPorCEP };

module.exports = router;
