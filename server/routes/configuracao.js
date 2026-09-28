const express = require("express");
const db = require("../db");
const { requireGestor } = require("../middleware/auth");
const { buscarCep, geocodificarEndereco, limparCep } = require("../utils/cep");

const router = express.Router();

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

// Atualizar endereço do escritório (apenas Gestor) — usado para validar o ponto
// nos dias presenciais. As coordenadas vêm do endereço completo (com número) ou,
// se o Gestor estiver no escritório, direto do GPS do aparelho (mais preciso).
router.patch("/empresa", requireGestor, async (req, res) => {
  const b = req.body || {};
  const texto = (v) => String(v || "").trim();
  const dados = {
    cepEmpresa: limparCep(b.cepEmpresa),
    logradouroEmpresa: texto(b.logradouroEmpresa),
    numeroEmpresa: texto(b.numeroEmpresa),
    bairroEmpresa: texto(b.bairroEmpresa),
    cidadeEmpresa: texto(b.cidadeEmpresa),
    estadoEmpresa: texto(b.estadoEmpresa).toUpperCase().slice(0, 2),
  };
  if (dados.cepEmpresa && dados.cepEmpresa.length !== 8) {
    return res.status(400).json({ erro: "O CEP deve ter 8 dígitos." });
  }
  if (!dados.logradouroEmpresa || !dados.cidadeEmpresa) {
    return res.status(400).json({ erro: "Informe pelo menos a rua e a cidade do escritório." });
  }
  const raio = Number(b.raioTolerancia);
  if (b.raioTolerancia !== undefined && (!Number.isFinite(raio) || raio < 50 || raio > 5000)) {
    return res.status(400).json({ erro: "O raio deve ficar entre 50 e 5000 metros." });
  }

  dados.enderecoEmpresa =
    [dados.logradouroEmpresa, dados.numeroEmpresa].filter(Boolean).join(", ") +
    (dados.bairroEmpresa ? ` - ${dados.bairroEmpresa}` : "");

  const lat = Number(b.lat);
  const long = Number(b.long);
  if (b.lat != null && b.long != null && Number.isFinite(lat) && Number.isFinite(long)) {
    dados.localizacaoEmpresa = { lat, long, origem: "gps" };
  } else {
    const coords = await geocodificarEndereco({
      logradouro: dados.logradouroEmpresa,
      numero: dados.numeroEmpresa,
      cidade: dados.cidadeEmpresa,
      estado: dados.estadoEmpresa,
      cep: dados.cepEmpresa,
    });
    dados.localizacaoEmpresa = coords ? { ...coords, origem: "endereco" } : null;
  }

  const existente = (db.readCollection("configuracao") || []).find((c) => c.tipo === "empresa");
  const empresa = existente
    ? db.update("configuracao", existente.id, {
        ...dados,
        raioTolerancia: b.raioTolerancia !== undefined ? raio : existente.raioTolerancia || 500,
      })
    : db.insert("configuracao", {
        tipo: "empresa",
        nome: "Evoé Gestão e RH",
        ...dados,
        raioTolerancia: b.raioTolerancia !== undefined ? raio : 500,
      });

  res.json({
    ...empresa,
    aviso: empresa.localizacaoEmpresa
      ? null
      : "Endereço salvo, mas não foi possível localizá-lo no mapa. Use o botão \"Usar minha localização atual\" estando no escritório.",
  });
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
