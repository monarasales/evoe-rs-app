const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { requireAuth, requireGestor } = require("../middleware/auth");
const { PERFIS_ACESSO, TIPOS_VINCULO, MODALIDADES_TRABALHO, DIAS_SEMANA } = require("../utils/constants");
const { geocodificarEndereco } = require("../utils/geo");
const { usaControlePonto } = require("../utils/pontoCompute");

const router = express.Router();

// Valida o horário esperado (usado no Controle de Ponto): uma LISTA de blocos,
// cada um com { dias: ["Segunda", ...], entrada: "08:00", saida: "14:00",
// pausaAlmocoMinutos: 60 }. Permite horários diferentes por dia da semana — ex:
// um bloco para Segunda/Quarta/Sexta e outro para Terça/Quinta — porque nem todo
// mundo tem o mesmo horário todo dia. pausaAlmocoMinutos é opcional (0/ausente =
// sem pausa de almoço naquele bloco). Aceita null (sem horário cadastrado ainda).
// Devolve null quando válido, ou uma mensagem de erro específica para mostrar ao
// Gestor (em vez de só um booleano) — importante para não deixar a pessoa perdida
// tentando adivinhar qual campo está errado.
function validarHorarioEsperado(horarioEsperado) {
  if (horarioEsperado == null) return null;
  if (!Array.isArray(horarioEsperado)) return "Horário esperado inválido.";

  const horaRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  const diasJaUsados = new Set();

  for (const bloco of horarioEsperado) {
    if (!bloco || typeof bloco !== "object") return "Horário esperado inválido.";
    const { dias, entrada, saida, pausaAlmocoMinutos } = bloco;

    if (!Array.isArray(dias) || dias.length === 0 || dias.some((d) => !DIAS_SEMANA.includes(d))) {
      return "Selecione ao menos um dia válido em cada horário cadastrado.";
    }
    const diaRepetido = dias.find((d) => diasJaUsados.has(d));
    if (diaRepetido) {
      return `O dia "${diaRepetido}" está em mais de um horário — cada dia só pode ter um horário esperado.`;
    }
    dias.forEach((d) => diasJaUsados.add(d));

    if (!horaRegex.test(entrada || "") || !horaRegex.test(saida || "")) {
      return "Horário de entrada/saída inválido — confira os campos preenchidos (formato HH:MM).";
    }
    const [he, me] = entrada.split(":").map(Number);
    const [hs, ms] = saida.split(":").map(Number);
    if (hs * 60 + ms <= he * 60 + me) {
      return "O horário de saída precisa ser depois do horário de entrada.";
    }
    if (pausaAlmocoMinutos !== undefined && pausaAlmocoMinutos !== null) {
      const minutos = Number(pausaAlmocoMinutos);
      if (!Number.isInteger(minutos) || minutos < 0 || minutos >= hs * 60 + ms - (he * 60 + me)) {
        return "A pausa de almoço precisa ser um número de minutos válido, menor que a duração do turno.";
      }
    }
  }
  return null;
}

// Geocodifica endereço residencial e/ou de trabalho quando mudam, ou quando o texto já
// está preenchido mas a busca anterior falhou e ficou sem coordenada (retry automático
// — evita um endereço ficar "preso" sem localização pra sempre só porque a tentativa
// original deu errado, ex: serviço de mapa fora do ar na hora). Só para quem usa
// Controle de Ponto, para não gastar chamadas à toa. Nunca derruba o cadastro se a
// geocodificação falhar: só fica sem a checagem de distância naquele endereço.
async function geocodificarSeNecessario(elegivel, enderecoAntigo, enderecoNovo, enderecoTrabalhoAntigo, enderecoTrabalhoNovo, latAntigo, latTrabalhoAntigo) {
  const resultado = {};
  if (!elegivel) return resultado;

  const enderecoMudou = enderecoNovo !== undefined && enderecoNovo !== enderecoAntigo;
  const enderecoPresoSemGeo = enderecoNovo !== undefined && enderecoNovo && enderecoNovo === enderecoAntigo && !latAntigo;
  if (enderecoMudou || enderecoPresoSemGeo) {
    const geo = await geocodificarEndereco(enderecoNovo);
    resultado.enderecoLat = geo ? geo.lat : null;
    resultado.enderecoLng = geo ? geo.lng : null;
  }

  const enderecoTrabalhoMudou = enderecoTrabalhoNovo !== undefined && enderecoTrabalhoNovo !== enderecoTrabalhoAntigo;
  const enderecoTrabalhoPresoSemGeo =
    enderecoTrabalhoNovo !== undefined && enderecoTrabalhoNovo && enderecoTrabalhoNovo === enderecoTrabalhoAntigo && !latTrabalhoAntigo;
  if (enderecoTrabalhoMudou || enderecoTrabalhoPresoSemGeo) {
    const geo = await geocodificarEndereco(enderecoTrabalhoNovo);
    resultado.enderecoTrabalhoLat = geo ? geo.lat : null;
    resultado.enderecoTrabalhoLng = geo ? geo.lng : null;
  }
  return resultado;
}

// A geocodificação automática (Nominatim/OpenStreetMap) às vezes erra o pino — sobra
// numa rua parecida em outra cidade, ou fica impreciso demais para endereços novos —
// e a pessoa passa a ser marcada como "fora do local" mesmo batendo o ponto no lugar
// certo. Quando o Gestor manda coordenadas manuais (copiadas do Google Maps na tela
// de Equipe), elas sempre valem por cima do resultado automático. Só usa o par quando
// os dois números (lat e lng) vêm válidos juntos, pra nunca salvar metade de um par.
function comCoordenadasManuais(geo, body) {
  const resultado = { ...geo };
  if (body.enderecoLatManual !== undefined && body.enderecoLngManual !== undefined) {
    const lat = Number(body.enderecoLatManual);
    const lng = Number(body.enderecoLngManual);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      resultado.enderecoLat = lat;
      resultado.enderecoLng = lng;
    }
  }
  if (body.enderecoTrabalhoLatManual !== undefined && body.enderecoTrabalhoLngManual !== undefined) {
    const lat = Number(body.enderecoTrabalhoLatManual);
    const lng = Number(body.enderecoTrabalhoLngManual);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      resultado.enderecoTrabalhoLat = lat;
      resultado.enderecoTrabalhoLng = lng;
    }
  }
  return resultado;
}

// Qualquer usuário autenticado pode listar consultores (precisa para os seletores de formulário).
router.get("/", (req, res) => {
  const users = db.readCollection("users");
  const consultores = db.readCollection("consultores").map((c) => {
    const user = users.find((u) => u.consultorId === c.id);
    return { ...c, username: user ? user.username : null };
  });
  res.json(consultores);
});

router.get("/:id", (req, res) => {
  const consultor = db.findById("consultores", req.params.id);
  if (!consultor) return res.status(404).json({ erro: "Consultor não encontrado." });
  res.json(consultor);
});

// Apenas Gestor pode criar/editar consultores (gestão de equipe).
router.post("/", requireGestor, async (req, res) => {
  const {
    nome, email, whatsapp, perfil, ativo, username, senha,
    dataAdmissao, tipoVinculo, valorRemuneracao, beneficios, cpf, dataNascimento, endereco,
    enderecoTrabalho, modalidadeTrabalho, horarioEsperado, controlaPonto,
    banco, agencia, conta, chavePix, bloqueiaAutoCorrecaoPonto,
  } = req.body || {};
  if (!nome || !email || !perfil || !PERFIS_ACESSO.includes(perfil)) {
    return res.status(400).json({ erro: "Nome, e-mail e perfil (Gestor/Recrutador) são obrigatórios." });
  }
  if (tipoVinculo && !TIPOS_VINCULO.includes(tipoVinculo)) {
    return res.status(400).json({ erro: "Tipo de vínculo inválido." });
  }
  if (modalidadeTrabalho && !MODALIDADES_TRABALHO.includes(modalidadeTrabalho)) {
    return res.status(400).json({ erro: "Modalidade de trabalho inválida." });
  }
  const erroHorario = validarHorarioEsperado(horarioEsperado);
  if (erroHorario) {
    return res.status(400).json({ erro: erroHorario });
  }

  // Valida o usuário de login ANTES de criar o consultor, para nunca deixar um
  // consultor "órfão" (criado, mas sem conseguir fazer login) sem avisar o Gestor.
  let usernameNormalizado = null;
  if (username && senha) {
    usernameNormalizado = String(username).trim().toLowerCase();
    const jaExiste = db.readCollection("users").some((u) => u.username === usernameNormalizado);
    if (jaExiste) {
      return res
        .status(400)
        .json({ erro: `O usuário "${usernameNormalizado}" já está em uso por outro consultor. Escolha outro nome de usuário.` });
    }
  }

  // Controle de Ponto: não é mais amarrado ao tipo de vínculo — o Gestor decide por
  // pessoa (Guilherme pode ser CLT e ainda assim usar ponto, por exemplo). Sem escolha
  // explícita no formulário, mantém o padrão histórico (ligado para quem é Estágio).
  const controlaPontoFinal = typeof controlaPonto === "boolean" ? controlaPonto : tipoVinculo === "Estágio";
  const geo = comCoordenadasManuais(
    await geocodificarSeNecessario(controlaPontoFinal, undefined, endereco || "", undefined, enderecoTrabalho || ""),
    req.body || {}
  );

  const consultor = db.insert("consultores", {
    nome,
    email,
    whatsapp: whatsapp || "",
    perfil,
    ativo: ativo !== false,
    dataAdmissao: dataAdmissao || "",
    dataDesligamento: null,
    tipoVinculo: tipoVinculo || "CLT",
    valorRemuneracao: Number(valorRemuneracao) || 0,
    beneficios: beneficios || "",
    cpf: cpf || "",
    dataNascimento: dataNascimento || "",
    endereco: endereco || "",
    enderecoLat: geo.enderecoLat ?? null,
    enderecoLng: geo.enderecoLng ?? null,
    // Controle de Ponto: quem usa (controlaPonto), endereço de trabalho e horário
    // esperado. Ficam vazios/null para quem não usa ponto.
    controlaPonto: controlaPontoFinal,
    enderecoTrabalho: enderecoTrabalho || "",
    enderecoTrabalhoLat: geo.enderecoTrabalhoLat ?? null,
    enderecoTrabalhoLng: geo.enderecoTrabalhoLng ?? null,
    modalidadeTrabalho: modalidadeTrabalho || "Presencial",
    horarioEsperado: horarioEsperado || null,
    // Dados bancários/PIX: usados pra pagamento de salário/comissão. Podem ser
    // preenchidos aqui pelo Gestor ou depois pelo próprio funcionário em Meu
    // Cadastro (ver PATCH /me) — sempre visíveis pro Gestor em Equipe.
    banco: banco || "",
    agencia: agencia || "",
    conta: conta || "",
    chavePix: chavePix || "",
    // Bloqueia a própria pessoa de corrigir seu próprio ponto (PATCH /api/ponto/:id
    // e lançamento manual), mesmo tendo perfil Gestor/Supervisora — usado quando
    // mais de uma pessoa tem acesso de Gestor e a dona da conta quer manter a
    // correção do ponto de alguém específico só com ela mesma.
    bloqueiaAutoCorrecaoPonto: bloqueiaAutoCorrecaoPonto === true,
  });

  if (usernameNormalizado) {
    db.insert("users", {
      consultorId: consultor.id,
      username: usernameNormalizado,
      passwordHash: bcrypt.hashSync(senha, 10),
    });
  }

  res.status(201).json(consultor);
});

// Autoatendimento: qualquer consultor logado pode atualizar os PRÓPRIOS dados de
// contato/endereço/bancários (usados no Controle de Ponto e no pagamento de
// salário/comissão) sem precisar pedir para o Gestor mexer no cadastro dele. Não
// deixa alterar perfil, vínculo, remuneração, horário esperado ou controlaPonto —
// isso continua exclusivo do Gestor (rota "/:id" abaixo).
// Precisa vir ANTES de "/:id" para o Express não tratar "me" como um :id.
//
// Importante: db.update (server/db.js) já ignora chaves com valor undefined no
// patch, então um campo que não veio no corpo da requisição NUNCA sobrescreve o
// valor já salvo — cada dado preenchido fica salvo e só muda se a própria pessoa
// mandar um valor novo para aquele campo especificamente.
router.patch("/me", requireAuth, async (req, res) => {
  const consultor = req.consultor;
  const { whatsapp, endereco, enderecoTrabalho, banco, agencia, conta, chavePix } = req.body || {};

  const geo = await geocodificarSeNecessario(
    usaControlePonto(consultor),
    consultor.endereco,
    endereco,
    consultor.enderecoTrabalho,
    enderecoTrabalho,
    consultor.enderecoLat,
    consultor.enderecoTrabalhoLat
  );

  const atualizado = db.update("consultores", consultor.id, {
    whatsapp,
    endereco,
    enderecoTrabalho,
    banco,
    agencia,
    conta,
    chavePix,
    ...geo,
  });
  res.json(atualizado);
});

router.patch("/:id", requireGestor, async (req, res) => {
  const consultorAtual = db.findById("consultores", req.params.id);
  if (!consultorAtual) return res.status(404).json({ erro: "Consultor não encontrado." });

  const {
    nome, email, whatsapp, perfil, ativo,
    dataAdmissao, dataDesligamento, tipoVinculo, valorRemuneracao, beneficios, cpf, dataNascimento, endereco,
    enderecoTrabalho, modalidadeTrabalho, horarioEsperado, controlaPonto,
    banco, agencia, conta, chavePix, bloqueiaAutoCorrecaoPonto,
  } = req.body || {};
  if (perfil && !PERFIS_ACESSO.includes(perfil)) {
    return res.status(400).json({ erro: "Perfil inválido." });
  }
  if (tipoVinculo && !TIPOS_VINCULO.includes(tipoVinculo)) {
    return res.status(400).json({ erro: "Tipo de vínculo inválido." });
  }
  if (modalidadeTrabalho && !MODALIDADES_TRABALHO.includes(modalidadeTrabalho)) {
    return res.status(400).json({ erro: "Modalidade de trabalho inválida." });
  }
  const erroHorario = validarHorarioEsperado(horarioEsperado);
  if (erroHorario) {
    return res.status(400).json({ erro: erroHorario });
  }

  const elegivel = usaControlePonto({
    tipoVinculo: tipoVinculo !== undefined ? tipoVinculo : consultorAtual.tipoVinculo,
    controlaPonto: controlaPonto !== undefined ? controlaPonto : consultorAtual.controlaPonto,
  });
  const geo = comCoordenadasManuais(
    await geocodificarSeNecessario(
      elegivel,
      consultorAtual.endereco,
      endereco,
      consultorAtual.enderecoTrabalho,
      enderecoTrabalho,
      consultorAtual.enderecoLat,
      consultorAtual.enderecoTrabalhoLat
    ),
    req.body || {}
  );

  const atualizado = db.update("consultores", req.params.id, {
    nome, email, whatsapp, perfil, ativo,
    dataAdmissao, dataDesligamento, tipoVinculo,
    valorRemuneracao: valorRemuneracao !== undefined ? Number(valorRemuneracao) || 0 : undefined,
    beneficios, cpf, dataNascimento, endereco,
    enderecoTrabalho, modalidadeTrabalho, horarioEsperado, controlaPonto,
    banco, agencia, conta, chavePix,
    bloqueiaAutoCorrecaoPonto: typeof bloqueiaAutoCorrecaoPonto === "boolean" ? bloqueiaAutoCorrecaoPonto : undefined,
    ...geo,
  });
  if (!atualizado) return res.status(404).json({ erro: "Consultor não encontrado." });
  res.json(atualizado);
});

// Redefinir usuário/senha de login de um consultor já existente (só Gestor).
router.patch("/:id/credenciais", requireGestor, (req, res) => {
  const consultor = db.findById("consultores", req.params.id);
  if (!consultor) return res.status(404).json({ erro: "Consultor não encontrado." });

  const { username, senha } = req.body || {};
  if (!username || !senha) {
    return res.status(400).json({ erro: "Usuário e senha são obrigatórios." });
  }

  const usernameNormalizado = String(username).trim().toLowerCase();
  const users = db.readCollection("users");
  const emUsoPorOutro = users.some(
    (u) => u.username === usernameNormalizado && u.consultorId !== consultor.id
  );
  if (emUsoPorOutro) {
    return res.status(400).json({ erro: "Esse nome de usuário já está em uso por outro consultor." });
  }

  const existente = users.find((u) => u.consultorId === consultor.id);
  const passwordHash = bcrypt.hashSync(senha, 10);
  if (existente) {
    db.update("users", existente.id, { username: usernameNormalizado, passwordHash });
  } else {
    db.insert("users", { consultorId: consultor.id, username: usernameNormalizado, passwordHash });
  }

  res.json({ username: usernameNormalizado });
});

// Excluir consultor (e o login associado, se existir). Só Gestor, e não pode excluir a si mesmo.
router.delete("/:id", requireGestor, (req, res) => {
  const consultor = db.findById("consultores", req.params.id);
  if (!consultor) return res.status(404).json({ erro: "Consultor não encontrado." });
  if (req.consultor && req.consultor.id === consultor.id) {
    return res.status(400).json({ erro: "Você não pode excluir o consultor com o qual está logada agora." });
  }
  const userDoConsultor = db.readCollection("users").find((u) => u.consultorId === consultor.id);
  if (userDoConsultor) db.remove("users", userDoConsultor.id);
  db.remove("consultores", consultor.id);
  res.json({ ok: true });
});

module.exports = router;
