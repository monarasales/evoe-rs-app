const express = require("express");
const db = require("../db");
const { requireGestor } = require("../middleware/auth");
const { buscarCep, geocodificarEndereco, limparCep } = require("../utils/cep");

const router = express.Router();

// Endereço + coordenadas a partir do CEP (usado para localizar a empresa no ponto).
async function obterLocalizacaoPorCEP(cep) {
  const end = await buscarCep(cep);
  if (!end) return null;
  const coords = end.lat != null ? { lat: end.lat, long: end.long } : await geocodificarEndereco(end);
  return {
    cep: end.cep,
    endereco: [end.logradouro, end.bairro].filter(Boolean).join(", "),
    cidade: end.cidade,
    estado: end.estado,
    lat: coords ? coords.lat : null,
    long: coords ? coords.long : null,
  };
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

// Busca de endereço por CEP, para preencher formulários automaticamente.
// 404 quando não encontra — o formulário então deixa preencher à mão.
router.post("/geocodificar-cep", async (req, res) => {
  const { cep } = req.body || {};
  if (limparCep(cep).length !== 8) {
    return res.status(400).json({ erro: "O CEP deve ter 8 dígitos." });
  }
  const end = await buscarCep(cep);
  if (!end) {
    return res.status(404).json({ erro: "CEP não encontrado. Preencha o endereço manualmente." });
  }
  res.json(end);
});

module.exports = router;
