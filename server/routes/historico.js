const express = require("express");
const db = require("../db");
const { diasEntre, hojeStr } = require("../utils/vagaCompute");

const router = express.Router();

router.get("/", (req, res) => {
  let historico = db.readCollection("historico");
  const { vagaId } = req.query;
  if (vagaId) historico = historico.filter((h) => h.vagaId === vagaId);
  const comDias = historico.map((h) => ({
    ...h,
    diasNaEtapa: diasEntre(h.dataEntrada, h.dataSaida || hojeStr()),
  }));
  res.json(comDias);
});

module.exports = router;
