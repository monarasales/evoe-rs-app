const express = require("express");
const db = require("../db");
const { requireGestor } = require("../middleware/auth");

const router = express.Router();

// ============= UTILITÁRIOS PARA GEOLOCALIZAÇÃO =============
// Função para converter CEP em coordenadas via ViaCEP (API gratuita brasileira)
async function obterLocalizacaoPorCEP(cep) {
  try {
    const cepLimpo = cep.replace(/\D/g, "");
    if (cepLimpo.length !== 8) {
      throw new Error("CEP inválido");
    }

    const response = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
    const dados = await response.json();

    if (dados.erro) {
      throw new Error("CEP não encontrado");
    }

    // Retorna endereço formatado e coordenadas (ViaCEP não retorna lat/long diretamente)
    // Por isso usamos um aproximado baseado na cidade/bairro
    return {
      cep: cepLimpo,
      endereco: `${dados.logradouro}, ${dados.bairro}`,
      cidade: dados.localidade,
      estado: dados.uf,
      lat: parseFloat(dados.latitude) || null, // ViaCEP não fornece, mas alguns endpoints retornam
      long: parseFloat(dados.longitude) || null,
      // IMPORTANTE: Para produção, usar Google Geocoding ou Nominatim para lat/long precisas
    };
  } catch (err) {
    console.error("Erro ao buscar CEP:", err);
    return null;
  }
}

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

// ============= ROTAS =============

// Listar todos os colaboradores
router.get("/", (req, res) => {
  const colaboradores = db.readCollection("colaboradores") || [];
  res.json(colaboradores);
});

// Obter colaborador por ID
router.get("/:id", (req, res) => {
  const colaborador = db.findById("colaboradores", req.params.id);
  if (!colaborador) return res.status(404).json({ erro: "Colaborador não encontrado." });
  res.json(colaborador);
});

// Geocodificar CEP (pública, para autocomplete no frontend)
router.post("/geocodificar/cep", async (req, res) => {
  const { cep } = req.body || {};
  if (!cep) {
    return res.status(400).json({ erro: "CEP é obrigatório." });
  }

  const localizacao = await obterLocalizacaoPorCEP(cep);
  if (!localizacao) {
    return res.status(404).json({ erro: "CEP não encontrado ou inválido." });
  }

  res.json(localizacao);
});

// Criar novo colaborador (apenas Gestor)
router.post("/", requireGestor, async (req, res) => {
  const {
    nome,
    cargo,
    cpf,
    email,
    telefone,
    cepResidencial,
    horarioInicio,
    horarioFim,
    diasHomeOffice,
    ativo,
  } = req.body || {};

  if (!nome) {
    return res.status(400).json({ erro: "Nome é obrigatório." });
  }

  // Geocodificar CEP residencial
  let localizacaoResidencial = null;
  if (cepResidencial) {
    localizacaoResidencial = await obterLocalizacaoPorCEP(cepResidencial);
    if (!localizacaoResidencial) {
      return res.status(400).json({ erro: "CEP residencial inválido ou não encontrado." });
    }
  }

  const colaborador = db.insert("colaboradores", {
    nome,
    cargo: cargo || "",
    cpf: cpf || "",
    email: email || "",
    telefone: telefone || "",
    cepResidencial: cepResidencial || "",
    enderecoResidencial: localizacaoResidencial?.endereco || "",
    cidadeResidencial: localizacaoResidencial?.cidade || "",
    estadoResidencial: localizacaoResidencial?.estado || "",
    localizacaoResidencial: localizacaoResidencial
      ? { lat: localizacaoResidencial.lat, long: localizacaoResidencial.long }
      : null,
    horarioInicio: horarioInicio || "08:00",
    horarioFim: horarioFim || "18:00",
    diasHomeOffice: diasHomeOffice || ["sexta"], // Array com dias em lowercase: ["segunda", "sexta", etc]
    raioTolerancia: 500, // metros
    ativo: ativo !== false,
    criadoEm: new Date().toISOString(),
  });

  res.status(201).json(colaborador);
});

// Editar colaborador (apenas Gestor)
router.patch("/:id", requireGestor, async (req, res) => {
  const {
    nome,
    cargo,
    cpf,
    email,
    telefone,
    cepResidencial,
    horarioInicio,
    horarioFim,
    diasHomeOffice,
    ativo,
  } = req.body || {};

  const colaborador = db.findById("colaboradores", req.params.id);
  if (!colaborador) return res.status(404).json({ erro: "Colaborador não encontrado." });

  // Se CEP foi alterado, geocodificar novamente
  let localizacaoResidencial = colaborador.localizacaoResidencial;
  let enderecoResidencial = colaborador.enderecoResidencial;
  let cidadeResidencial = colaborador.cidadeResidencial;
  let estadoResidencial = colaborador.estadoResidencial;

  if (cepResidencial && cepResidencial !== colaborador.cepResidencial) {
    const novaLocalizacao = await obterLocalizacaoPorCEP(cepResidencial);
    if (!novaLocalizacao) {
      return res.status(400).json({ erro: "CEP residencial inválido ou não encontrado." });
    }
    localizacaoResidencial = { lat: novaLocalizacao.lat, long: novaLocalizacao.long };
    enderecoResidencial = novaLocalizacao.endereco;
    cidadeResidencial = novaLocalizacao.cidade;
    estadoResidencial = novaLocalizacao.estado;
  }

  const atualizado = db.update("colaboradores", req.params.id, {
    nome: nome !== undefined ? nome : colaborador.nome,
    cargo: cargo !== undefined ? cargo : colaborador.cargo,
    cpf: cpf !== undefined ? cpf : colaborador.cpf,
    email: email !== undefined ? email : colaborador.email,
    telefone: telefone !== undefined ? telefone : colaborador.telefone,
    cepResidencial: cepResidencial !== undefined ? cepResidencial : colaborador.cepResidencial,
    enderecoResidencial,
    cidadeResidencial,
    estadoResidencial,
    localizacaoResidencial,
    horarioInicio: horarioInicio !== undefined ? horarioInicio : colaborador.horarioInicio,
    horarioFim: horarioFim !== undefined ? horarioFim : colaborador.horarioFim,
    diasHomeOffice: diasHomeOffice !== undefined ? diasHomeOffice : colaborador.diasHomeOffice,
    ativo: ativo !== undefined ? ativo : colaborador.ativo,
  });

  res.json(atualizado);
});

// Excluir colaborador (apenas Gestor)
router.delete("/:id", requireGestor, (req, res) => {
  const deletado = db.delete("colaboradores", req.params.id);
  if (!deletado) return res.status(404).json({ erro: "Colaborador não encontrado." });
  res.json({ sucesso: true });
});

// Função exportada para validação de localização (usada por ponto.js)
router.validateLocalizacao = { calcularDistancia, obterLocalizacaoPorCEP };

module.exports = router;
