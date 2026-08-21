const express = require("express");
const fs = require("fs");
const path = require("path");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { notify } = require("../utils/notify");
const { ETAPAS_CANDIDATO, MOTIVOS_LISTA_NEGRA } = require("../utils/constants");
const { uploadCurriculo, UPLOADS_DIR } = require("../utils/uploads");
const { hojeStr } = require("../utils/vagaCompute");

const router = express.Router();

function removerArquivoCurriculo(candidato) {
  if (!candidato || !candidato.curriculoArquivo) return;
  const filePath = path.join(UPLOADS_DIR, candidato.curriculoArquivo);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

function removerArquivoParecerPorNome(nomeArquivo) {
  if (!nomeArquivo) return;
  const filePath = path.join(UPLOADS_DIR, nomeArquivo);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

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

router.get("/motivos-lista-negra", (req, res) => {
  res.json(MOTIVOS_LISTA_NEGRA);
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
    // Três momentos distintos do sub-funil, para não misturar "conversamos com o
    // candidato" (RH/Evoé) com "o cliente entrevistou" (empresa) e "o cliente decidiu"
    // (retorno): dataEntrevista = entrevista com a RH/Evoé; dataEntrevistaEmpresa =
    // entrevista com a empresa cliente; dataRetornoCliente = retorno/decisão da empresa.
    dataEntrevista: null,
    dataEntrevistaEmpresa: null,
    jusbrasilOk: false,
    obsReferencia: "",
    parecerComportamental: "",
    pareceres: [], // array de {arquivo, nomeOriginal, tamanho, uploadedAt}
    dataRetornoCliente: null,
    // Lista Negra: candidato não recomendado para futuras vagas — independe da etapa,
    // pode ser marcado a qualquer momento (ver rota PATCH).
    listaNegra: false,
    motivoListaNegra: "",
    obsListaNegra: "",
    dataListaNegra: null,
  });
  res.status(201).json(candidato);
});

router.patch("/:id", requireAuth, (req, res) => {
  const candidato = db.findById("candidatos", req.params.id);
  if (!candidato) return res.status(404).json({ erro: "Candidato não encontrado." });
  const vaga = db.findById("vagas", candidato.vagaId);
  if (!podeEditar(req, vaga)) return res.status(403).json({ erro: "Você só pode editar candidatos de vagas atribuídas a você." });

  const {
    nome, email, telefone, etapaCandidato, dataEntrevista, dataEntrevistaEmpresa,
    jusbrasilOk, obsReferencia, parecerComportamental, dataRetornoCliente,
    listaNegra, motivoListaNegra, obsListaNegra,
  } = req.body || {};
  if (etapaCandidato && !ETAPAS_CANDIDATO.includes(etapaCandidato)) {
    return res.status(400).json({ erro: "Etapa de candidato inválida." });
  }
  if (listaNegra && !MOTIVOS_LISTA_NEGRA.includes(motivoListaNegra)) {
    return res.status(400).json({ erro: "Selecione o motivo da Lista Negra." });
  }

  // Data da marcação: registra automaticamente na primeira vez que entra na Lista
  // Negra; some quando o candidato é retirado de lá (motivo/observação também).
  const entrandoAgora = listaNegra === true && !candidato.listaNegra;
  const patchListaNegra =
    listaNegra === undefined
      ? {}
      : listaNegra
      ? { listaNegra: true, motivoListaNegra, obsListaNegra: obsListaNegra || "", dataListaNegra: entrandoAgora ? hojeStr() : candidato.dataListaNegra }
      : { listaNegra: false, motivoListaNegra: "", obsListaNegra: "", dataListaNegra: null };

  const atualizado = db.update("candidatos", candidato.id, {
    nome, email, telefone, etapaCandidato, dataEntrevista, dataEntrevistaEmpresa, jusbrasilOk, obsReferencia, parecerComportamental, dataRetornoCliente,
    ...patchListaNegra,
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
  removerArquivoCurriculo(candidato);
  db.remove("candidatos", req.params.id);
  res.json({ ok: true });
});

// --- Currículo (PDF/DOC/DOCX) -------------------------------------------------------
// Guardado em disco (DATA_DIR/uploads/curriculos), fora do Git — só o nome do arquivo
// e o nome original enviado pela usuária ficam no registro do candidato.
router.post("/:id/curriculo", requireAuth, (req, res, next) => {
  uploadCurriculo.single("arquivo")(req, res, (err) => {
    if (err) return res.status(400).json({ erro: err.message || "Falha ao enviar o arquivo." });

    const candidato = db.findById("candidatos", req.params.id);
    if (!candidato) return res.status(404).json({ erro: "Candidato não encontrado." });
    const vaga = db.findById("vagas", candidato.vagaId);
    if (!podeEditar(req, vaga)) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(403).json({ erro: "Você só pode anexar currículos em candidatos de vagas atribuídas a você." });
    }
    if (!req.file) return res.status(400).json({ erro: "Nenhum arquivo enviado." });

    // Substitui o currículo anterior, se houver, para não acumular arquivos órfãos.
    removerArquivoCurriculo(candidato);

    const atualizado = db.update("candidatos", candidato.id, {
      curriculoArquivo: req.file.filename,
      curriculoNomeOriginal: req.file.originalname,
      curriculoTamanho: req.file.size,
      curriculoUploadedAt: db.nowIso(),
    });
    res.json(atualizado);
  });
});

router.get("/:id/curriculo", requireAuth, (req, res) => {
  const candidato = db.findById("candidatos", req.params.id);
  if (!candidato || !candidato.curriculoArquivo) {
    return res.status(404).json({ erro: "Este candidato ainda não tem currículo anexado." });
  }
  const filePath = path.join(UPLOADS_DIR, candidato.curriculoArquivo);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ erro: "O arquivo não foi encontrado no servidor." });
  }
  res.download(filePath, candidato.curriculoNomeOriginal || "curriculo.pdf");
});

router.delete("/:id/curriculo", requireAuth, (req, res) => {
  const candidato = db.findById("candidatos", req.params.id);
  if (!candidato) return res.status(404).json({ erro: "Candidato não encontrado." });
  const vaga = db.findById("vagas", candidato.vagaId);
  if (!podeEditar(req, vaga)) {
    return res.status(403).json({ erro: "Você só pode remover currículos de candidatos de vagas atribuídas a você." });
  }
  removerArquivoCurriculo(candidato);
  const atualizado = db.update("candidatos", candidato.id, {
    curriculoArquivo: null,
    curriculoNomeOriginal: null,
    curriculoTamanho: null,
    curriculoUploadedAt: null,
  });
  res.json(atualizado);
});

// --- Pareceres (múltiplos arquivos) -------------------------------------------------
// Consultores podem anexar vários arquivos de parecer (ex: parecer psicológico, técnico, etc).
// Cada parecer fica num objeto com {arquivo, nomeOriginal, tamanho, uploadedAt}.

router.post("/:id/pareceres", requireAuth, (req, res, next) => {
  uploadCurriculo.single("arquivo")(req, res, (err) => {
    if (err) return res.status(400).json({ erro: err.message || "Falha ao enviar o arquivo." });

    const candidato = db.findById("candidatos", req.params.id);
    if (!candidato) return res.status(404).json({ erro: "Candidato não encontrado." });
    const vaga = db.findById("vagas", candidato.vagaId);
    if (!podeEditar(req, vaga)) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(403).json({ erro: "Você só pode anexar pareceres em candidatos de vagas atribuídas a você." });
    }
    if (!req.file) return res.status(400).json({ erro: "Nenhum arquivo enviado." });

    // Adiciona um novo parecer ao array (sem substituir anteriores)
    const novoParecerObj = {
      arquivo: req.file.filename,
      nomeOriginal: req.file.originalname,
      tamanho: req.file.size,
      uploadedAt: db.nowIso(),
    };
    const pareceres = (candidato.pareceres || []).concat([novoParecerObj]);
    const atualizado = db.update("candidatos", candidato.id, { pareceres });
    res.json(atualizado);
  });
});

router.get("/:id/pareceres", requireAuth, (req, res) => {
  const candidato = db.findById("candidatos", req.params.id);
  if (!candidato) return res.status(404).json({ erro: "Candidato não encontrado." });
  res.json(candidato.pareceres || []);
});

router.get("/:id/pareceres/:parecerIdx", requireAuth, (req, res) => {
  const candidato = db.findById("candidatos", req.params.id);
  if (!candidato) return res.status(404).json({ erro: "Candidato não encontrado." });
  const idx = parseInt(req.params.parecerIdx, 10);
  if (!Number.isFinite(idx) || idx < 0 || idx >= (candidato.pareceres || []).length) {
    return res.status(404).json({ erro: "Parecer não encontrado." });
  }
  const parecer = candidato.pareceres[idx];
  const filePath = path.join(UPLOADS_DIR, parecer.arquivo);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ erro: "O arquivo não foi encontrado no servidor." });
  }
  res.download(filePath, parecer.nomeOriginal || "parecer.pdf");
});

router.delete("/:id/pareceres/:parecerIdx", requireAuth, (req, res) => {
  const candidato = db.findById("candidatos", req.params.id);
  if (!candidato) return res.status(404).json({ erro: "Candidato não encontrado." });
  const vaga = db.findById("vagas", candidato.vagaId);
  if (!podeEditar(req, vaga)) {
    return res.status(403).json({ erro: "Você só pode remover pareceres de candidatos de vagas atribuídas a você." });
  }
  const idx = parseInt(req.params.parecerIdx, 10);
  if (!Number.isFinite(idx) || idx < 0 || idx >= (candidato.pareceres || []).length) {
    return res.status(404).json({ erro: "Parecer não encontrado." });
  }
  const parecer = candidato.pareceres[idx];
  removerArquivoParecerPorNome(parecer.arquivo);
  const novoArrayPareceres = candidato.pareceres.filter((_, i) => i !== idx);
  const atualizado = db.update("candidatos", candidato.id, { pareceres: novoArrayPareceres });
  res.json(atualizado);
});

module.exports = router;
