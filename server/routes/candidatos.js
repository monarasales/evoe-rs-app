const express = require("express");
const db = require("../db");
const crypto = require("crypto");
const { salvarCurriculo, caminhoCurriculo } = require("../utils/curriculos");
const { relatorioDisc } = require("../utils/discRelatorio");
const { cpfValido, formatarCpf, dataIso, dataNascimentoValida } = require("../utils/validacao");
const { requireAuth } = require("../middleware/auth");
const { notify } = require("../utils/notify");
const { ETAPAS_CANDIDATO, FASES_CANDIDATO, FASES_FINAIS, MOTIVOS_REPROVACAO } = require("../utils/constants");

const router = express.Router();

// Campos que a tela pode gravar. Atualização é sempre por MERGE: campos que não
// vierem na requisição continuam como estão (nada se perde).
const CAMPOS = [
  "nome",
  "email",
  "telefone",
  "cidade",
  "cpf",
  "dataNascimento",
  "cep",
  "endereco",
  "numero",
  "complemento",
  "bairro",
  "uf",
  "linkedin",
  "origem",
  "pretensaoSalarial",
  "etapaCandidato",
  "dataEntrevista", // entrevista com a consultoria (Evoé)
  "dataEntrevistaCliente",
  "avaliacaoConsultoria",
  "notaConsultoria",
  "avaliacaoEmpresa",
  "notaEmpresa",
  "jusbrasilOk",
  "obsReferencia",
  "parecerComportamental",
  "dataRetornoCliente",
];
const CAMPOS_TEXTO = ["nome", "email", "telefone", "cidade", "cpf", "dataNascimento", "cep", "endereco", "numero", "complemento", "bairro", "uf", "linkedin", "origem", "pretensaoSalarial"];

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
  // Dados pessoais são opcionais no cadastro interno (candidatos antigos não têm), mas,
  // se preenchidos, precisam ser válidos.
  if (dados.cpf) {
    if (!cpfValido(dados.cpf)) dados.__erro = "CPF inválido. Confira os números.";
    else dados.cpf = formatarCpf(dados.cpf);
  }
  if (dados.dataNascimento) {
    const iso = dataIso(dados.dataNascimento);
    if (!iso || !dataNascimentoValida(iso)) dados.__erro = "Data de nascimento inválida.";
    else dados.dataNascimento = iso;
  }
  if (dados.uf) dados.uf = dados.uf.toUpperCase().slice(0, 2);
  for (const n of ["notaConsultoria", "notaEmpresa"]) {
    if (dados[n] !== undefined) dados[n] = [1, 2, 3, 4, 5].includes(Number(dados[n])) ? Number(dados[n]) : null;
  }
  for (const t of ["avaliacaoConsultoria", "avaliacaoEmpresa"]) {
    if (dados[t] !== undefined) dados[t] = String(dados[t] || "").slice(0, 5000);
  }
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

router.get("/fases", (req, res) => {
  res.json({ fases: FASES_CANDIDATO, finais: FASES_FINAIS, motivos: MOTIVOS_REPROVACAO });
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
  if (dados.__erro) return res.status(400).json({ erro: dados.__erro });
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
    fase: FASES_CANDIDATO.includes(req.body.fase) && !FASES_FINAIS.includes(req.body.fase) ? req.body.fase : "Recrutamento",
    historicoFases: [{ fase: FASES_CANDIDATO.includes(req.body.fase) && !FASES_FINAIS.includes(req.body.fase) ? req.body.fase : "Recrutamento", em: new Date().toISOString(), por: req.consultor.nome }],
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
  if (dados.__erro) return res.status(400).json({ erro: dados.__erro });
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

// ---------- Funil: mudar a fase do candidato ----------
// Reprovar exige motivo. Toda mudança entra em "historicoFases" (nada se perde).
router.post("/:id/fase", requireAuth, (req, res) => {
  const candidato = db.findById("candidatos", req.params.id);
  if (!candidato) return res.status(404).json({ erro: "Candidato não encontrado." });
  const vaga = db.findById("vagas", candidato.vagaId);
  if (!podeEditar(req, vaga)) return res.status(403).json({ erro: "Você só pode mover candidatos de vagas atribuídas a você." });
  const { fase } = req.body || {};
  const motivo = String((req.body || {}).motivo || "").trim();
  const observacao = String((req.body || {}).observacao || "").trim().slice(0, 1000);
  if (!FASES_CANDIDATO.includes(fase)) return res.status(400).json({ erro: "Fase inválida." });
  if (fase === "Reprovado" && !MOTIVOS_REPROVACAO.includes(motivo)) return res.status(400).json({ erro: "Escolha o motivo da reprovação." });
  if (fase === candidato.fase) return res.json(candidato);

  const agora = new Date().toISOString();
  const dados = {
    fase,
    historicoFases: [
      ...(candidato.historicoFases || []),
      { fase, de: candidato.fase || null, em: agora, por: req.consultor.nome, ...(motivo ? { motivo } : {}), ...(observacao ? { obs: observacao } : {}) },
    ],
  };
  if (fase === "Reprovado") {
    dados.reprovacao = { fase: candidato.fase || null, motivo, observacao, em: agora, por: req.consultor.nome };
  } else if (candidato.reprovacao) {
    // Reativado: a reprovação anterior vai para o histórico, não é apagada.
    dados.reprovacoesAnteriores = [...(candidato.reprovacoesAnteriores || []), candidato.reprovacao];
    dados.reprovacao = null;
  }
  const atualizado = db.update("candidatos", candidato.id, dados);

  if (fase === "Aprovado" && vaga) {
    const mensagem = `${atualizado.nome} foi aprovado(a) no processo da vaga "${vaga.titulo}".`;
    const destinos = new Set([vaga.consultorId]);
    db.readCollection("consultores")
      .filter((c) => (c.perfil === "Gestor" || c.perfil === "Supervisora") && c.ativo !== false)
      .forEach((g) => destinos.add(g.id));
    destinos.forEach((id) =>
      notify({ tipo: "Candidato Aprovado", vagaId: vaga.id, destinatarioId: id, assunto: `Candidato aprovado: ${atualizado.nome}`, mensagem })
    );
  }
  res.json(atualizado);
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
  let campos;
  try {
    campos = salvarCurriculo(candidato, nomeArquivo, conteudoBase64, req.consultor.nome);
  } catch (err) {
    return res.status(400).json({ erro: err.message });
  }
  res.json(db.update("candidatos", candidato.id, campos));
});

// Abre/baixa o currículo atual (ou um anterior, com ?arquivo=...). Só com login.
router.get("/:id/curriculo", requireAuth, (req, res) => {
  const candidato = db.findById("candidatos", req.params.id);
  if (!candidato || !candidato.curriculo) return res.status(404).send("Currículo não encontrado.");
  const todos = [candidato.curriculo, ...(candidato.curriculosAnteriores || [])];
  const alvo = req.query.arquivo ? todos.find((c) => c.arquivo === req.query.arquivo) : candidato.curriculo;
  if (!alvo) return res.status(404).send("Currículo não encontrado.");
  const caminho = caminhoCurriculo(alvo.arquivo);
  if (!caminho) return res.status(404).send("Arquivo do currículo não encontrado no servidor.");
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
    ...Object.fromEntries(["cpf", "dataNascimento", "cep", "endereco", "numero", "complemento", "bairro", "uf", "areaInteresse"].filter((k) => origem[k]).map((k) => [k, origem[k]])),
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
    // O DISC é da pessoa (não da vaga): acompanha o candidato para a nova vaga.
    disc: origem.disc || null,
    discAnteriores: origem.discAnteriores || [],
    origemCandidatoId: raiz,
    fase: "Recrutamento",
    historicoFases: [{ fase: "Recrutamento", em: new Date().toISOString(), por: req.consultor.nome, obs: "Incluído a partir do banco de talentos" }],
    criadoPor: req.consultor.id,
  });
  res.status(201).json(copia);
});

// ---------- Teste DISC ----------
// Gera (ou reaproveita) o link individual do teste. Com { refazer: true }, o resultado
// atual vai para `discAnteriores` (nada se perde) e um novo link é criado.
router.post("/:id/disc/link", requireAuth, (req, res) => {
  const candidato = db.findById("candidatos", req.params.id);
  if (!candidato) return res.status(404).json({ erro: "Candidato não encontrado." });
  if (!podeEditar(req, db.findById("vagas", candidato.vagaId))) {
    return res.status(403).json({ erro: "Você só pode enviar o teste para candidatos de vagas atribuídas a você." });
  }
  const dados = {};
  if ((req.body || {}).refazer && candidato.disc) {
    dados.discAnteriores = [...(candidato.discAnteriores || []), { ...candidato.disc, substituidoEm: new Date().toISOString(), substituidoPor: req.consultor.nome }];
    dados.disc = null;
    dados.discToken = crypto.randomBytes(12).toString("base64url");
  } else if (!candidato.discToken) {
    dados.discToken = crypto.randomBytes(12).toString("base64url");
  }
  if (dados.discToken) dados.discSolicitadoEm = new Date().toISOString();
  res.json(Object.keys(dados).length ? db.update("candidatos", candidato.id, dados) : candidato);
});

// Relatório completo (HTML para imprimir/salvar em PDF). Com ?anterior=N abre um resultado antigo.
router.get("/:id/disc/relatorio", requireAuth, (req, res) => {
  const candidato = db.findById("candidatos", req.params.id);
  if (!candidato) return res.status(404).send("Candidato não encontrado.");
  const alvo = req.query.anterior !== undefined ? (candidato.discAnteriores || [])[Number(req.query.anterior)] : candidato.disc;
  if (!alvo) return res.status(404).send("Este candidato ainda não fez o teste DISC.");
  const vaga = db.findById("vagas", candidato.vagaId);
  const empresa = vaga ? (db.findById("empresas", vaga.empresaId) || {}).nome : "";
  res.type("html").send(relatorioDisc({ candidato: { ...candidato, disc: alvo }, vaga, empresa }));
});

module.exports = router;
