const express = require("express");
const fs = require("fs");
const path = require("path");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { notify } = require("../utils/notify");
const { ETAPAS_CANDIDATO } = require("../utils/constants");

const router = express.Router();

// Currículos ficam no disco de dados (no Render, o disco persistente /data), numa
// pasta por candidato. Arquivos NUNCA são apagados: ao substituir um currículo, o
// anterior continua guardado e listado em `curriculosAnteriores`.
const PASTA_CURRICULOS = path.join(db.DATA_DIR, "curriculos");
const TAMANHO_MAX = 8 * 1024 * 1024; // 8 MB
const TIPOS_CURRICULO = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".rtf": "application/rtf",
  ".txt": "text/plain",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

// Campos que a tela pode gravar. Atualização é sempre por MERGE: campos que não
// vierem na requisição continuam como estão (nada se perde).
const CAMPOS = [
  "nome",
  "email",
  "telefone",
  "cidade",
  "linkedin",
  "origem",
  "pretensaoSalarial",
  "etapaCandidato",
  "dataEntrevista",
  "jusbrasilOk",
  "obsReferencia",
  "parecerComportamental",
  "dataRetornoCliente",
];
const CAMPOS_TEXTO = ["nome", "email", "telefone", "cidade", "linkedin", "origem", "pretensaoSalarial"];

function podeEditar(req, vaga) {
  if (!vaga) return true;
  return (
    req.consultor.perfil === "Gestor" ||
    req.consultor.perfil === "Supervisora" ||
    vaga.consultorId === req.consultor.id
  );
}

function lerCampos(body) {
  const dados = {};
  for (const c of CAMPOS) if (body[c] !== undefined) dados[c] = body[c];
  for (const c of CAMPOS_TEXTO) if (dados[c] !== undefined) dados[c] = String(dados[c] || "").trim();
  if (dados.jusbrasilOk !== undefined) dados.jusbrasilOk = !!dados.jusbrasilOk;
  return dados;
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
  const body = req.body || {};
  const { vagaId } = body;
  const dados = lerCampos(body);
  if (!dados.nome || !vagaId) return res.status(400).json({ erro: "Nome e vaga são obrigatórios." });
  const vaga = db.findById("vagas", vagaId);
  if (!vaga) return res.status(400).json({ erro: "Vaga inválida." });
  if (!podeEditar(req, vaga)) return res.status(403).json({ erro: "Você só pode adicionar candidatos em vagas atribuídas a você." });
  if (dados.etapaCandidato && !ETAPAS_CANDIDATO.includes(dados.etapaCandidato)) delete dados.etapaCandidato;

  const candidato = db.insert("candidatos", {
    email: "",
    telefone: "",
    cidade: "",
    linkedin: "",
    origem: "",
    pretensaoSalarial: "",
    etapaCandidato: "Inscrito",
    dataEntrevista: null,
    jusbrasilOk: false,
    obsReferencia: "",
    parecerComportamental: "",
    dataRetornoCliente: null,
    pareceres: [],
    curriculo: null,
    ...dados,
    vagaId,
    criadoPor: req.consultor.id,
  });
  res.status(201).json(candidato);
});

router.patch("/:id", requireAuth, (req, res) => {
  const candidato = db.findById("candidatos", req.params.id);
  if (!candidato) return res.status(404).json({ erro: "Candidato não encontrado." });
  const vaga = db.findById("vagas", candidato.vagaId);
  if (!podeEditar(req, vaga)) return res.status(403).json({ erro: "Você só pode editar candidatos de vagas atribuídas a você." });

  const dados = lerCampos(req.body || {});
  const { etapaCandidato } = dados;
  if (etapaCandidato && !ETAPAS_CANDIDATO.includes(etapaCandidato)) {
    return res.status(400).json({ erro: "Etapa de candidato inválida." });
  }
  if (dados.nome !== undefined && !dados.nome) return res.status(400).json({ erro: "O nome não pode ficar vazio." });

  const atualizado = db.update("candidatos", candidato.id, dados);

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

// ---------- Pareceres dos consultores (histórico com autor e data) ----------
router.post("/:id/pareceres", requireAuth, (req, res) => {
  const candidato = db.findById("candidatos", req.params.id);
  if (!candidato) return res.status(404).json({ erro: "Candidato não encontrado." });
  if (!podeEditar(req, db.findById("vagas", candidato.vagaId))) {
    return res.status(403).json({ erro: "Você só pode dar parecer em candidatos de vagas atribuídas a você." });
  }
  const texto = String((req.body || {}).texto || "").trim();
  if (!texto) return res.status(400).json({ erro: "Escreva o parecer." });
  const parecer = {
    id: db.newId(),
    autorId: req.consultor.id,
    autorNome: req.consultor.nome,
    texto: texto.slice(0, 5000),
    criadoEm: new Date().toISOString(),
  };
  res.status(201).json(db.update("candidatos", candidato.id, { pareceres: [...(candidato.pareceres || []), parecer] }));
});

// Remover parecer: só o autor ou Gestor/Supervisora.
router.delete("/:id/pareceres/:parecerId", requireAuth, (req, res) => {
  const candidato = db.findById("candidatos", req.params.id);
  if (!candidato) return res.status(404).json({ erro: "Candidato não encontrado." });
  const parecer = (candidato.pareceres || []).find((p) => p.id === req.params.parecerId);
  if (!parecer) return res.status(404).json({ erro: "Parecer não encontrado." });
  const gestao = ["Gestor", "Supervisora"].includes(req.consultor.perfil);
  if (parecer.autorId !== req.consultor.id && !gestao) return res.status(403).json({ erro: "Só quem escreveu (ou a gestão) pode remover este parecer." });
  res.json(db.update("candidatos", candidato.id, { pareceres: candidato.pareceres.filter((p) => p.id !== parecer.id) }));
});

// ---------- Currículo ----------
// Recebe o arquivo em base64 (JSON) para não depender de biblioteca de upload.
router.post("/:id/curriculo", requireAuth, (req, res) => {
  const candidato = db.findById("candidatos", req.params.id);
  if (!candidato) return res.status(404).json({ erro: "Candidato não encontrado." });
  if (!podeEditar(req, db.findById("vagas", candidato.vagaId))) {
    return res.status(403).json({ erro: "Você só pode anexar currículo em candidatos de vagas atribuídas a você." });
  }
  const { nomeArquivo, conteudoBase64 } = req.body || {};
  const ext = path.extname(String(nomeArquivo || "")).toLowerCase();
  if (!TIPOS_CURRICULO[ext]) return res.status(400).json({ erro: "Formato não aceito. Envie PDF, Word (DOC/DOCX), ODT, RTF, TXT ou imagem (JPG/PNG)." });
  const buffer = Buffer.from(String(conteudoBase64 || ""), "base64");
  if (!buffer.length) return res.status(400).json({ erro: "Arquivo vazio." });
  if (buffer.length > TAMANHO_MAX) return res.status(400).json({ erro: "Arquivo maior que 8 MB." });

  const pasta = path.join(PASTA_CURRICULOS, candidato.id);
  fs.mkdirSync(pasta, { recursive: true });
  const seguro = path.basename(String(nomeArquivo)).replace(/[^\w.\- ]+/g, "_").slice(-80);
  const arquivo = `${Date.now()}-${seguro}`;
  fs.writeFileSync(path.join(pasta, arquivo), buffer);

  const novo = {
    arquivo: `${candidato.id}/${arquivo}`,
    nomeOriginal: path.basename(String(nomeArquivo)),
    tipo: TIPOS_CURRICULO[ext],
    tamanho: buffer.length,
    enviadoEm: new Date().toISOString(),
    enviadoPor: req.consultor.nome,
  };
  const anteriores = [...(candidato.curriculosAnteriores || []), ...(candidato.curriculo ? [candidato.curriculo] : [])];
  res.json(db.update("candidatos", candidato.id, { curriculo: novo, curriculosAnteriores: anteriores }));
});

// Abre/baixa o currículo atual (ou um anterior, com ?arquivo=...). Só com login.
router.get("/:id/curriculo", requireAuth, (req, res) => {
  const candidato = db.findById("candidatos", req.params.id);
  if (!candidato || !candidato.curriculo) return res.status(404).send("Currículo não encontrado.");
  const todos = [candidato.curriculo, ...(candidato.curriculosAnteriores || [])];
  const alvo = req.query.arquivo ? todos.find((c) => c.arquivo === req.query.arquivo) : candidato.curriculo;
  if (!alvo) return res.status(404).send("Currículo não encontrado.");
  const caminho = path.resolve(PASTA_CURRICULOS, alvo.arquivo);
  if (!caminho.startsWith(path.resolve(PASTA_CURRICULOS) + path.sep) || !fs.existsSync(caminho)) {
    return res.status(404).send("Arquivo do currículo não encontrado no servidor.");
  }
  res.setHeader("Content-Type", alvo.tipo || "application/octet-stream");
  res.setHeader("Content-Disposition", `${req.query.baixar ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(alvo.nomeOriginal)}`);
  res.sendFile(caminho);
});

// ---------- Banco de talentos: incluir o mesmo candidato em outra vaga ----------
// Cria um novo registro na vaga escolhida com os dados pessoais e o currículo
// (o arquivo é compartilhado, nunca copiado nem apagado). O registro original fica intacto.
router.post("/:id/copiar", requireAuth, (req, res) => {
  const origem = db.findById("candidatos", req.params.id);
  if (!origem) return res.status(404).json({ erro: "Candidato não encontrado." });
  const vaga = db.findById("vagas", (req.body || {}).vagaId);
  if (!vaga) return res.status(400).json({ erro: "Escolha a vaga de destino." });
  if (!podeEditar(req, vaga)) return res.status(403).json({ erro: "Você só pode adicionar candidatos em vagas atribuídas a você." });
  if (vaga.id === origem.vagaId) return res.status(400).json({ erro: "O candidato já está nesta vaga." });
  const raiz = origem.origemCandidatoId || origem.id;
  const jaNaVaga = db
    .readCollection("candidatos")
    .find((c) => c.vagaId === vaga.id && (c.id === raiz || c.origemCandidatoId === raiz || (origem.email && c.email === origem.email)));
  if (jaNaVaga) return res.status(400).json({ erro: `${origem.nome} já está cadastrado(a) nesta vaga.` });

  const copia = db.insert("candidatos", {
    nome: origem.nome,
    email: origem.email || "",
    telefone: origem.telefone || "",
    cidade: origem.cidade || "",
    linkedin: origem.linkedin || "",
    origem: origem.origem || "",
    pretensaoSalarial: origem.pretensaoSalarial || "",
    vagaId: vaga.id,
    etapaCandidato: "Inscrito",
    dataEntrevista: null,
    jusbrasilOk: false,
    obsReferencia: "",
    parecerComportamental: "",
    dataRetornoCliente: null,
    pareceres: [],
    curriculo: origem.curriculo || null,
    curriculosAnteriores: origem.curriculosAnteriores || [],
    origemCandidatoId: raiz,
    criadoPor: req.consultor.id,
  });
  res.status(201).json(copia);
});

module.exports = router;
