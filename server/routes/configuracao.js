const express = require("express");
const db = require("../db");
const { requireGestor } = require("../middleware/auth");

const router = express.Router();

// Função para geocodificar CEP (mesmo de colaboradores.js)
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

    return {
      cep: cepLimpo,
      endereco: `${dados.logradouro}, ${dados.bairro}`,
      cidade: dados.localidade,
      estado: dados.uf,
      lat: parseFloat(dados.latitude) || null,
      long: parseFloat(dados.longitude) || null,
    };
  } catch (err) {
    console.error("Erro ao buscar CEP:", err);
    return null;
  }
}

// Obter configurações da empresa
router.get("/empresa", (req, res) => {
  let config = db.readCollection("configuracao") || [];
  let empresa = config.find((c) => c.tipo === "empresa");

  if (!empresa) {
    // Retornar configuração padrão se não existir
    empresa = {
      id: "empresa-default",
      tipo: "empresa",
      nome: "Evoé Gestão e RH",
      cepEmpresa: "",
      enderecoEmpresa: "",
      cidadeEmpresa: "",
      estadoEmpresa: "",
      localizacaoEmpresa: null,
      raioTolerancia: 500, // metros
    };
  }

  res.json(empresa);
});

// Atualizar configurações da empresa (apenas Gestor)
router.patch("/empresa", requireGestor, async (req, res) => {
  const { nome, cepEmpresa, raioTolerancia } = req.body || {};

  // Geocodificar CEP da empresa
  let localizacaoEmpresa = null;
  let enderecoEmpresa = "";
  let cidadeEmpresa = "";
  let estadoEmpresa = "";

  if (cepEmpresa) {
    const localizacao = await obterLocalizacaoPorCEP(cepEmpresa);
    if (!localizacao) {
      return res.status(400).json({ erro: "CEP da empresa inválido ou não encontrado." });
    }
    localizacaoEmpresa = { lat: localizacao.lat, long: localizacao.long };
    enderecoEmpresa = localizacao.endereco;
    cidadeEmpresa = localizacao.cidade;
    estadoEmpresa = localizacao.estado;
  }

  let config = db.readCollection("configuracao") || [];
  let empresa = config.find((c) => c.tipo === "empresa");

  if (!empresa) {
    // Criar nova configuração
    empresa = db.insert("configuracao", {
      tipo: "empresa",
      nome: nome || "Evoé Gestão e RH",
      cepEmpresa: cepEmpresa || "",
      enderecoEmpresa,
      cidadeEmpresa,
      estadoEmpresa,
      localizacaoEmpresa,
      raioTolerancia: raioTolerancia || 500,
      criadoEm: new Date().toISOString(),
    });
  } else {
    // Atualizar existente
    empresa = db.update("configuracao", empresa.id, {
      nome: nome || empresa.nome,
      cepEmpresa: cepEmpresa || empresa.cepEmpresa,
      enderecoEmpresa: cepEmpresa ? enderecoEmpresa : empresa.enderecoEmpresa,
      cidadeEmpresa: cepEmpresa ? cidadeEmpresa : empresa.cidadeEmpresa,
      estadoEmpresa: cepEmpresa ? estadoEmpresa : empresa.estadoEmpresa,
      localizacaoEmpresa: cepEmpresa ? localizacaoEmpresa : empresa.localizacaoEmpresa,
      raioTolerancia: raioTolerancia || empresa.raioTolerancia,
    });
  }

  res.json(empresa);
});

// Geocodificar CEP (pública, para autocomplete)
router.post("/geocodificar-cep", async (req, res) => {
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

module.exports = router;
