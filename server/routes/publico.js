// Rotas PÚBLICAS (sem login) — página de inscrição pelo link da vaga.
// Expõem só o mínimo: título, texto público escolhido pela Evoé e, se permitido,
// o nome da empresa. NUNCA o "perfil da vaga" interno, salário cadastrado,
// consultor, candidatos ou dados do cliente.

const express = require("express");
const db = require("../db");
const { notify } = require("../utils/notify");
const crypto = require("crypto");
const { salvarCurriculo } = require("../utils/curriculos");
const disc = require("../utils/disc");
const { paginaPublica, gerarTokenVaga } = require("../utils/vagaPagina");

const router = express.Router();

// Ao mudar o texto, mude a versão: cada inscrição guarda o texto exato que aceitou.
const VERSAO_CONSENTIMENTO = "2026-10-b";
const EMAIL_LGPD = "evoegestaorh@gmail.com";
const TEXTO_CONSENTIMENTO =
  "Autorizo a Evoé Gestão e RH a armazenar e utilizar meus dados pessoais e meu currículo para fins de recrutamento e seleção, " +
  "nesta e em outras vagas compatíveis com meu perfil, pelo prazo de até 2 anos. Sei que posso pedir a correção ou a exclusão " +
  `dos meus dados a qualquer momento pelo e-mail ${EMAIL_LGPD}.`;

const encerrada = (v) => /^1[12]\./.test(v.etapaAtual || "");
const pedeDisc = (v) => v.exigirDisc !== false;
const novoTokenDisc = () => crypto.randomBytes(12).toString("base64url");
const aceitaInscricao = (v) => !!v.linkToken && v.inscricoesAbertas !== false && !encerrada(v);
// Vaga que aparece na página "Vagas abertas": não encerrada e sem inscrições fechadas manualmente.
const vagaAberta = (v) => v.inscricoesAbertas !== false && !encerrada(v);

/** Garante o link público de toda vaga aberta (só acrescenta campos; nada é alterado). */
function garantirLinks() {
  const vagas = db.readCollection("vagas");
  let novos = 0;
  for (const v of vagas) {
    if (vagaAberta(v) && !v.linkToken) {
      v.linkToken = gerarTokenVaga(v.titulo);
      v.linkCriadoEm = new Date().toISOString();
      v.linkCriadoPor = "Automático (página de vagas)";
      novos++;
    }
  }
  if (novos) db.writeCollection("vagas", vagas);
  return vagas;
}

function vagaPublica(v) {
  const empresa = v.mostrarEmpresa ? (db.findById("empresas", v.empresaId) || {}).nome || "" : "";
  return {
    token: v.linkToken,
    titulo: v.titulo,
    empresa: empresa || null,
    descricao: v.descricaoPublica || "",
    pagina: paginaPublica(v.pagina),
    pedeDisc: pedeDisc(v),
    publicadaEm: v.linkCriadoEm || v.dataAbertura || null,
    // "Nova": vaga aberta há até 7 dias (pela data de abertura da vaga, não pela criação do link).
    nova: Date.now() - Date.parse(`${v.dataAbertura || "2000-01-01"}T12:00:00-03:00`) < 7 * 24 * 3600 * 1000,
    aberta: aceitaInscricao(v),
  };
}

// Limite simples contra robôs/abuso: no máximo 10 envios por conexão (IP) a cada 10 minutos.
const envios = new Map();
function limiteExcedido(ip) {
  const agora = Date.now();
  const recentes = (envios.get(ip) || []).filter((t) => agora - t < 10 * 60 * 1000);
  recentes.push(agora);
  envios.set(ip, recentes);
  if (envios.size > 5000) envios.clear();
  return recentes.length > 10;
}

router.get("/termo", (req, res) => res.json({ versao: VERSAO_CONSENTIMENTO, texto: TEXTO_CONSENTIMENTO }));

// Todas as vagas com inscrições abertas (página "Vagas abertas").
router.get("/vagas", (req, res) => {
  // Ordem: novas primeiro, depois as com página preenchida, depois as abertas mais recentemente.
  const peso = (v) => (vagaPublica(v).nova ? 2 : 0) + (v.pagina && v.pagina.missao ? 1 : 0);
  const lista = garantirLinks()
    .filter(aceitaInscricao)
    .sort((a, b) => peso(b) - peso(a) || String(b.dataAbertura || "").localeCompare(String(a.dataAbertura || "")))
    .map(vagaPublica);
  res.json(lista);
});

router.get("/vagas/:token", (req, res) => {
  const vaga = db.readCollection("vagas").find((v) => v.linkToken && v.linkToken === req.params.token);
  if (!vaga) return res.status(404).json({ erro: "Vaga não encontrada. Confira o link recebido." });
  res.json(vagaPublica(vaga));
});

router.post("/vagas/:token/inscricao", (req, res) => {
  const vaga = db.readCollection("vagas").find((v) => v.linkToken && v.linkToken === req.params.token);
  if (!vaga) return res.status(404).json({ erro: "Vaga não encontrada. Confira o link recebido." });
  if (!aceitaInscricao(vaga)) return res.status(400).json({ erro: "As inscrições para esta vaga estão encerradas. Obrigado pelo interesse!" });

  const b = req.body || {};
  // Campo-armadilha: invisível para pessoas; robôs costumam preenchê-lo.
  if (b.website) return res.status(201).json({ ok: true });
  if (limiteExcedido(req.ip)) return res.status(429).json({ erro: "Muitos envios em pouco tempo. Aguarde alguns minutos e tente novamente." });

  const texto = (v, max = 200) => String(v || "").trim().slice(0, max);
  const nome = texto(b.nome, 120);
  const email = texto(b.email, 120).toLowerCase();
  const telefone = texto(b.telefone, 30);
  if (nome.length < 3) return res.status(400).json({ erro: "Informe seu nome completo." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ erro: "Informe um e-mail válido." });
  if (telefone.replace(/\D/g, "").length < 10) return res.status(400).json({ erro: "Informe um telefone/WhatsApp com DDD." });
  if (!b.consentimento) return res.status(400).json({ erro: "Para se inscrever, é preciso aceitar o termo de uso dos dados (LGPD)." });
  if (!b.curriculo || !b.curriculo.conteudoBase64) return res.status(400).json({ erro: "Anexe seu currículo." });

  const consentimento = {
    aceitoEm: new Date().toISOString(),
    versao: VERSAO_CONSENTIMENTO,
    texto: TEXTO_CONSENTIMENTO,
  };
  const dados = {
    nome,
    email,
    telefone,
    cidade: texto(b.cidade, 80),
    linkedin: texto(b.linkedin, 200),
    pretensaoSalarial: texto(b.pretensaoSalarial, 60),
    mensagemCandidato: texto(b.mensagem, 2000),
  };

  // Mesma pessoa (e-mail) na mesma vaga: não duplica. Nada do cadastro existente é
  // sobrescrito: só campos vazios são preenchidos, o reenvio fica no histórico
  // `reinscricoes` e o novo currículo vira nova versão (o anterior continua guardado).
  const existente = db.readCollection("candidatos").find((c) => c.vagaId === vaga.id && (c.email || "").toLowerCase() === email);
  let candidato;
  try {
    if (existente) {
      const campos = salvarCurriculo(existente, b.curriculo.nomeArquivo, b.curriculo.conteudoBase64, "Candidato (link da vaga)");
      const soVazios = Object.fromEntries(Object.entries(dados).filter(([k, v]) => v && !existente[k]));
      candidato = db.update("candidatos", existente.id, {
        ...soVazios,
        ...campos,
        consentimentoLgpd: consentimento,
        reinscricoes: [...(existente.reinscricoes || []), { em: new Date().toISOString(), dados }],
      });
    } else {
      candidato = db.insert("candidatos", {
        ...dados,
        vagaId: vaga.id,
        origem: "Link da vaga",
        etapaCandidato: "Inscrito",
        fase: "Recrutamento",
        historicoFases: [{ fase: "Recrutamento", em: new Date().toISOString(), por: "Candidato (link da vaga)" }],
        dataEntrevista: null,
        jusbrasilOk: false,
        obsReferencia: "",
        parecerComportamental: "",
        dataRetornoCliente: null,
        pareceres: [],
        curriculo: null,
        consentimentoLgpd: consentimento,
        inscritoPeloLink: true,
      });
      try {
        candidato = db.update("candidatos", candidato.id, salvarCurriculo(candidato, b.curriculo.nomeArquivo, b.curriculo.conteudoBase64, "Candidato (link da vaga)"));
      } catch (err) {
        db.remove("candidatos", candidato.id); // currículo inválido: desfaz a inscrição incompleta
        throw err;
      }
    }
  } catch (err) {
    return res.status(400).json({ erro: err.message });
  }

  // Avisa o consultor responsável e a gestão (sininho).
  const destinatarios = new Set([vaga.consultorId]);
  db.readCollection("consultores")
    .filter((c) => (c.perfil === "Gestor" || c.perfil === "Supervisora") && c.ativo !== false)
    .forEach((c) => destinatarios.add(c.id));
  destinatarios.forEach((id) =>
    notify({
      tipo: "Nova inscrição pelo link",
      vagaId: vaga.id,
      destinatarioId: id,
      assunto: `${existente ? "Inscrição atualizada" : "Nova inscrição"}: ${candidato.nome}`,
      mensagem: `${candidato.nome} ${existente ? "reenviou a inscrição" : "se inscreveu"} pelo link da vaga "${vaga.titulo}".`,
    })
  );

  let discUrl = null;
  if (pedeDisc(vaga) && !candidato.disc) {
    if (!candidato.discToken) candidato = db.update("candidatos", candidato.id, { discToken: novoTokenDisc(), discSolicitadoEm: new Date().toISOString() });
    discUrl = `/disc/${candidato.discToken}`;
  }
  res.status(201).json({ ok: true, atualizada: !!existente, discUrl, discJaFeito: !!candidato.disc });
});

// ---------- Banco de talentos (candidatura espontânea, sem vaga) ----------
router.post("/talentos", (req, res) => {
  const b = req.body || {};
  if (b.website) return res.status(201).json({ ok: true });
  if (limiteExcedido(req.ip)) return res.status(429).json({ erro: "Muitos envios em pouco tempo. Aguarde alguns minutos e tente novamente." });
  const texto = (v, max = 200) => String(v || "").trim().slice(0, max);
  const nome = texto(b.nome, 120);
  const email = texto(b.email, 120).toLowerCase();
  const telefone = texto(b.telefone, 30);
  const areaInteresse = texto(b.areaInteresse, 200);
  if (nome.length < 3) return res.status(400).json({ erro: "Informe seu nome completo." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ erro: "Informe um e-mail válido." });
  if (telefone.replace(/\D/g, "").length < 10) return res.status(400).json({ erro: "Informe um telefone/WhatsApp com DDD." });
  if (!areaInteresse) return res.status(400).json({ erro: "Conte em que área ou cargo você tem interesse." });
  if (!b.consentimento) return res.status(400).json({ erro: "Para se cadastrar, é preciso aceitar o termo de uso dos dados (LGPD)." });
  if (!b.curriculo || !b.curriculo.conteudoBase64) return res.status(400).json({ erro: "Anexe seu currículo." });

  const consentimento = { aceitoEm: new Date().toISOString(), versao: VERSAO_CONSENTIMENTO, texto: TEXTO_CONSENTIMENTO };
  const dados = { nome, email, telefone, cidade: texto(b.cidade, 80), linkedin: texto(b.linkedin, 200), pretensaoSalarial: texto(b.pretensaoSalarial, 60), areaInteresse, mensagemCandidato: texto(b.mensagem, 2000) };
  // Mesmo e-mail já no banco (sem vaga): não duplica — guarda o reenvio e a nova versão do currículo.
  const existente = db.readCollection("candidatos").find((c) => !c.vagaId && (c.email || "").toLowerCase() === email);
  let candidato;
  try {
    if (existente) {
      const soVazios = Object.fromEntries(Object.entries(dados).filter(([k, v]) => v && !existente[k]));
      candidato = db.update("candidatos", existente.id, {
        ...soVazios,
        ...salvarCurriculo(existente, b.curriculo.nomeArquivo, b.curriculo.conteudoBase64, "Candidato (banco de talentos)"),
        consentimentoLgpd: consentimento,
        reinscricoes: [...(existente.reinscricoes || []), { em: new Date().toISOString(), dados }],
      });
    } else {
      candidato = db.insert("candidatos", {
        ...dados,
        vagaId: null,
        origem: "Banco de talentos",
        etapaCandidato: "Inscrito",
        fase: "Recrutamento",
        historicoFases: [{ fase: "Recrutamento", em: new Date().toISOString(), por: "Candidato (banco de talentos)" }],
        jusbrasilOk: false,
        obsReferencia: "",
        parecerComportamental: "",
        pareceres: [],
        curriculo: null,
        consentimentoLgpd: consentimento,
        cadastroEspontaneo: true,
      });
      try {
        candidato = db.update("candidatos", candidato.id, salvarCurriculo(candidato, b.curriculo.nomeArquivo, b.curriculo.conteudoBase64, "Candidato (banco de talentos)"));
      } catch (err) {
        db.remove("candidatos", candidato.id);
        throw err;
      }
    }
  } catch (err) {
    return res.status(400).json({ erro: err.message });
  }
  db.readCollection("consultores")
    .filter((c) => (c.perfil === "Gestor" || c.perfil === "Supervisora") && c.ativo !== false)
    .forEach((c) =>
      notify({
        tipo: "Banco de talentos",
        destinatarioId: c.id,
        assunto: `Novo cadastro no banco de talentos: ${candidato.nome}`,
        mensagem: `${candidato.nome} se cadastrou no banco de talentos (interesse: ${areaInteresse}).`,
      })
    );
  if (!candidato.disc && !candidato.discToken) candidato = db.update("candidatos", candidato.id, { discToken: novoTokenDisc(), discSolicitadoEm: new Date().toISOString() });
  res.status(201).json({ ok: true, atualizada: !!existente, discUrl: candidato.disc ? null : `/disc/${candidato.discToken}` });
});

// ---------- Teste DISC (link individual do candidato) ----------
const acharPorTokenDisc = (token) => db.readCollection("candidatos").find((c) => c.discToken && c.discToken === token);

router.get("/disc/:token", (req, res) => {
  const c = acharPorTokenDisc(req.params.token);
  if (!c) return res.status(404).json({ erro: "Link do teste não encontrado. Confira o link recebido." });
  const vaga = db.findById("vagas", c.vagaId);
  const base = { primeiroNome: (c.nome || "").split(" ")[0], vaga: vaga ? vaga.titulo : "", concluido: !!c.disc };
  if (c.disc) {
    const p = disc.PERFIS[c.disc.resultado.primario];
    return res.json({ ...base, resumo: { titulo: `${p.nome} (${p.titulo})`, texto: p.candidato } });
  }
  res.json({ ...base, total: disc.GRUPOS.length, perguntas: disc.perguntas(c.discToken) });
});

router.post("/disc/:token", (req, res) => {
  const c = acharPorTokenDisc(req.params.token);
  if (!c) return res.status(404).json({ erro: "Link do teste não encontrado." });
  if (c.disc) return res.status(400).json({ erro: "Você já concluiu este teste. Obrigado!" });
  if (limiteExcedido(req.ip)) return res.status(429).json({ erro: "Muitos envios em pouco tempo. Aguarde alguns minutos e tente novamente." });
  let resultado;
  try {
    resultado = disc.pontuar((req.body || {}).respostas, c.discToken);
  } catch (err) {
    return res.status(400).json({ erro: err.message });
  }
  const iniciadoEm = Date.parse((req.body || {}).iniciadoEm);
  const registro = {
    versao: disc.VERSAO,
    concluidoEm: new Date().toISOString(),
    duracaoSegundos: Number.isFinite(iniciadoEm) ? Math.max(0, Math.round((Date.now() - iniciadoEm) / 1000)) : null,
    respostas: req.body.respostas.map((r) => ({ grupo: r.grupo, mais: r.mais, menos: r.menos })),
    resultado,
  };
  db.update("candidatos", c.id, { disc: registro });

  const vaga = db.findById("vagas", c.vagaId);
  const destinatarios = new Set(vaga ? [vaga.consultorId] : []);
  db.readCollection("consultores")
    .filter((x) => (x.perfil === "Gestor" || x.perfil === "Supervisora") && x.ativo !== false)
    .forEach((x) => destinatarios.add(x.id));
  destinatarios.forEach((id) =>
    notify({
      tipo: "Teste DISC concluído",
      vagaId: vaga ? vaga.id : null,
      destinatarioId: id,
      assunto: `DISC concluído: ${c.nome} — perfil ${resultado.perfil}`,
      mensagem: `${c.nome} concluiu o teste DISC${vaga ? ` da vaga "${vaga.titulo}"` : ""}. Perfil: ${disc.nomePerfil(resultado)}.`,
    })
  );

  const p = disc.PERFIS[resultado.primario];
  res.status(201).json({ ok: true, resumo: { titulo: `${p.nome} (${p.titulo})`, texto: p.candidato } });
});

module.exports = router;
