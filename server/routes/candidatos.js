const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { notify } = require("../utils/notify");
const { ETAPAS_CANDIDATO } = require("../utils/constants");

const router = express.Router();

function podeEditar(req, vaga) {
  if (!vaga) return true;
  return (
    req.consultor.perfil === "Gestor" ||
    req.consultor.perfil === "Supervisora" ||
    vaga.consultorId === req.consultor.id
  );
}

router.get("/", (req, res) => {
  let candidatos = db.readCollection("candidatos");
  const { vagaId } = req.query;
  if (vagaId) candidatos = candidatos.filter((c) => c.vagaId === vagaId);
  res.json(candidatos);
});

router.get("/etapas", (req, res) => {
  res.json(ETAPAS_CANDIDATO);
});

router.get("/:id", (req, res) => {
  const candidato = db.findById("candidatos", req.params.id);
  if (!candidato) return res.status(404).json({ erro: "Candidato não encontrado." });
  res.json(candidato);
});

router.post("/", requireAuth, (req, res) => {
  const { nome, email, telefone, vagaId, etapaCandidato } = req.body || {};
  if (!nome || !vagaId) return res.status(400).json({ erro: "Nome e vaga são obrigatórios." });
  const vaga = db.findById("vagas", vagaId);
  if (!vaga) return res.status(400).json({ erro: "Vaga inválida." });
  if (!podeEditar(req, vaga)) return res.status(403).json({ erro: "Você só pode adicionar candidatos em vagas atribuídas a você." });

  const candidato = db.insert("candidatos", {
    nome,
    email: email || "",
    telefone: telefone || "",
    vagaId,
    etapaCandidato: etapaCandidato && ETAPAS_CANDIDATO.includes(etapaCandidato) ? etapaCandidato : "Inscrito",
    dataEntrevista: null,
    jusbrasilOk: false,
    obsReferencia: "",
    parecerComportamental: "",
    dataRetornoCliente: null,
  });
  res.status(201).json(candidato);
});

router.patch("/:id", requireAuth, (req, res) => {
  const candidato = db.findById("candidatos", req.params.id);
  if (!candidato) return res.status(404).json({ erro: "Candidato não encontrado." });
  const vaga = db.findById("vagas", candidato.vagaId);
  if (!podeEditar(req, vaga)) return res.status(403).json({ erro: "Você só pode editar candidatos de vagas atribuídas a você." });

  const { nome, email, telefone, etapaCandidato, dataEntrevista, jusbrasilOk, obsReferencia, parecerComportamental, dataRetornoCliente } = req.body || {};
  if (etapaCandidato && !ETAPAS_CANDIDATO.includes(etapaCandidato)) {
    return res.status(400).json({ erro: "Etapa de candidato inválida." });
  }

  const atualizado = db.update("candidatos", candidato.id, {
    nome, email, telefone, etapaCandidato, dataEntrevista, jusbrasilOk, obsReferencia, parecerComportamental, dataRetornoCliente,
  });

  if (etapaCandidato === "Aprovado pelo Cliente" && candidato.etapaCandidato !== "Aprovado pelo Cliente" && vaga) {
    notify({
      tipo: "Candidato Aprovado",
      vagaId: vaga.id,
      destinatarioId: vaga.consultorId,
      assunto: `Candidato aprovado: ${atualizado.nome}`,
      mensagem: `O candidato ${atualizado.nome} foi aprovado pelo cliente para a vaga "${vaga.titulo}".`,
    });
    db.readCollection("consultores")
      .filter((c) => c.perfil === "Gestor" || c.perfil === "Supervisora")
      .forEach((g) =>
        notify({
          tipo: "Candidato Aprovado",
          vagaId: vaga.id,
          destinatarioId: g.id,
          assunto: `Candidato aprovado: ${atualizado.nome}`,
          mensagem: `O candidato ${atualizado.nome} foi aprovado pelo cliente para a vaga "${vaga.titulo}".`,
        })
      );
  }

  res.json(atualizado);
});

router.delete("/:id", requireAuth, (req, res) => {
  const candidato = db.findById("candidatos", req.params.id);
  if (!candidato) return res.status(404).json({ erro: "Candidato não encontrado." });
  const vaga = db.findById("vagas", candidato.vagaId);
  if (!podeEditar(req, vaga)) return res.status(403).json({ erro: "Você só pode excluir candidatos de vagas atribuídas a você." });
  db.remove("candidatos", req.params.id);
  res.json({ ok: true });
});

module.exports = router;
