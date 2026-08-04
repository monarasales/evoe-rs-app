// Controle de Ponto: entrada batida automaticamente no login (ver
// server/routes/auth.js), saída batida manualmente pelo próprio funcionário, e
// relatório de horas trabalhadas x esperadas para o Gestor/Supervisora — que também
// pode corrigir uma batida errada/esquecida ou lançar um dia manualmente.
const express = require("express");
const db = require("../db");
const { requireAuth, requireGestorOuSupervisora } = require("../middleware/auth");
const { hojeStr } = require("../utils/vagaCompute");
const { horasEntre, avaliarLocalizacao, usaControlePonto, horasEsperadasNoDia, diaSemanaDe } = require("../utils/pontoCompute");

const router = express.Router();

const HORA_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function pontoDeHoje(consultorId) {
  const data = hojeStr();
  return db.readCollection("pontos").find((p) => p.consultorId === consultorId && p.data === data) || null;
}

// Recalcula horasTrabalhadas/saldoHoras de um registro após uma correção manual.
function recalcularHoras(registro) {
  if (!registro.horaEntrada || !registro.horaSaida) {
    return { horasTrabalhadas: null, saldoHoras: null };
  }
  const horasTrabalhadas = horasEntre(registro.horaEntrada, registro.horaSaida);
  return {
    horasTrabalhadas,
    saldoHoras: Math.round((horasTrabalhadas - (registro.horasEsperadas || 0)) * 100) / 100,
  };
}

// Registro de ponto do dia do próprio usuário logado (ou null, se ainda não bateu
// hoje — por exemplo, quem não é estagiário nunca tem um registro criado).
router.get("/hoje", requireAuth, (req, res) => {
  res.json(pontoDeHoje(req.consultor.id));
});

// Chamado logo após o login para anexar a localização capturada pelo navegador à
// entrada já batida automaticamente. Sem localização, o ponto continua valendo —
// só fica sem a checagem de distância.
router.patch("/hoje/entrada-localizacao", requireAuth, (req, res) => {
  const { lat, lng } = req.body || {};
  if (typeof lat !== "number" || typeof lng !== "number") {
    return res.status(400).json({ erro: "Localização inválida." });
  }
  const ponto = pontoDeHoje(req.consultor.id);
  if (!ponto) return res.status(404).json({ erro: "Nenhuma batida de ponto encontrada para hoje." });

  const avaliacao = avaliarLocalizacao(req.consultor, lat, lng);
  const atualizado = db.update("pontos", ponto.id, {
    entradaLat: lat,
    entradaLng: lng,
    entradaDistanciaMetros: avaliacao.distanciaMetros,
    entradaForaDoLocal: avaliacao.foraDoLocal,
    entradaReferencia: avaliacao.referencia,
  });
  res.json(atualizado);
});

// Bater saída — ação manual do funcionário. Calcula horas trabalhadas e o saldo
// (positivo = hora extra, negativo = a descontar) com base no horário esperado
// cadastrado.
router.post("/bater-saida", requireAuth, (req, res) => {
  if (!usaControlePonto(req.consultor)) {
    return res.status(403).json({ erro: "O Controle de Ponto não está habilitado para o seu cadastro." });
  }
  const ponto = pontoDeHoje(req.consultor.id);
  if (!ponto) {
    return res.status(400).json({ erro: "Nenhuma entrada registrada hoje. Faça login novamente para bater o ponto." });
  }
  if (ponto.horaSaida) {
    return res.status(400).json({ erro: "A saída de hoje já foi registrada." });
  }

  const { lat, lng } = req.body || {};
  const horaSaida = (() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  })();

  const patch = { horaSaida };
  if (typeof lat === "number" && typeof lng === "number") {
    const avaliacao = avaliarLocalizacao(req.consultor, lat, lng);
    patch.saidaLat = lat;
    patch.saidaLng = lng;
    patch.saidaDistanciaMetros = avaliacao.distanciaMetros;
    patch.saidaForaDoLocal = avaliacao.foraDoLocal;
  }

  const horasTrabalhadas = horasEntre(ponto.horaEntrada, horaSaida);
  patch.horasTrabalhadas = horasTrabalhadas;
  patch.saldoHoras = Math.round((horasTrabalhadas - (ponto.horasEsperadas || 0)) * 100) / 100;

  const atualizado = db.update("pontos", ponto.id, patch);
  res.json(atualizado);
});

// Histórico do próprio estagiário (tela "Meu Ponto").
router.get("/meu", requireAuth, (req, res) => {
  const registros = db
    .readCollection("pontos")
    .filter((p) => p.consultorId === req.consultor.id)
    .sort((a, b) => b.data.localeCompare(a.data));
  res.json(registros);
});

// Listagem completa (Gestor/Supervisora) — opcionalmente filtrada por consultor.
router.get("/", requireGestorOuSupervisora, (req, res) => {
  let registros = db.readCollection("pontos");
  const { consultorId } = req.query;
  if (consultorId) registros = registros.filter((p) => p.consultorId === consultorId);
  registros = registros.sort((a, b) => b.data.localeCompare(a.data));
  res.json(registros);
});

// Resumo por funcionário num período (padrão: mês atual) — horas trabalhadas,
// esperadas e saldo (hora extra ou desconto), além de avisos (fora do local,
// dias sem bater saída).
router.get("/resumo", requireGestorOuSupervisora, (req, res) => {
  const consultores = db.readCollection("consultores").filter(usaControlePonto);
  const registros = db.readCollection("pontos");
  const hoje = hojeStr();
  const inicio = req.query.inicio || `${hoje.slice(0, 7)}-01`;
  const fim = req.query.fim || hoje;

  const resumo = consultores.map((c) => {
    const doPeriodo = registros.filter((p) => p.consultorId === c.id && p.data >= inicio && p.data <= fim);
    const horasTrabalhadas = doPeriodo.reduce((acc, p) => acc + (p.horasTrabalhadas || 0), 0);
    const horasEsperadas = doPeriodo.reduce((acc, p) => acc + (p.horasEsperadas || 0), 0);
    return {
      consultor: { id: c.id, nome: c.nome, ativo: c.ativo, modalidadeTrabalho: c.modalidadeTrabalho },
      horasTrabalhadas: Math.round(horasTrabalhadas * 100) / 100,
      horasEsperadas: Math.round(horasEsperadas * 100) / 100,
      saldoHoras: Math.round((horasTrabalhadas - horasEsperadas) * 100) / 100,
      diasComPonto: doPeriodo.length,
      diasForaDoLocal: doPeriodo.filter((p) => p.entradaForaDoLocal || p.saidaForaDoLocal).length,
      diasSemSaida: doPeriodo.filter((p) => !p.horaSaida).length,
    };
  });

  res.json({ inicio, fim, resumo });
});

// Corrige uma batida errada ou esquecida (ex: o funcionário esqueceu de bater ou
// bateu no horário errado). Só Gestor/Supervisora. Recalcula horas trabalhadas/saldo
// e deixa um rastro (corrigidoPorId/corrigidoEm) de que houve uma correção manual.
router.patch("/:id", requireGestorOuSupervisora, (req, res) => {
  const registro = db.findById("pontos", req.params.id);
  if (!registro) return res.status(404).json({ erro: "Registro de ponto não encontrado." });

  const { horaEntrada, horaSaida } = req.body || {};
  if (horaEntrada !== undefined && horaEntrada !== null && !HORA_REGEX.test(horaEntrada)) {
    return res.status(400).json({ erro: "Horário de entrada inválido. Use o formato HH:MM." });
  }
  if (horaSaida !== undefined && horaSaida !== null && !HORA_REGEX.test(horaSaida)) {
    return res.status(400).json({ erro: "Horário de saída inválido. Use o formato HH:MM." });
  }

  const mesclado = {
    ...registro,
    horaEntrada: horaEntrada !== undefined ? horaEntrada : registro.horaEntrada,
    horaSaida: horaSaida !== undefined ? horaSaida : registro.horaSaida,
  };
  if (mesclado.horaEntrada && mesclado.horaSaida) {
    const [he, me] = mesclado.horaEntrada.split(":").map(Number);
    const [hs, ms] = mesclado.horaSaida.split(":").map(Number);
    if (hs * 60 + ms <= he * 60 + me) {
      return res.status(400).json({ erro: "A saída precisa ser depois da entrada." });
    }
  }

  const { horasTrabalhadas, saldoHoras } = recalcularHoras(mesclado);
  const atualizado = db.update("pontos", registro.id, {
    horaEntrada: mesclado.horaEntrada,
    horaSaida: mesclado.horaSaida,
    horasTrabalhadas,
    saldoHoras,
    corrigidoManualmente: true,
    corrigidoPorId: req.consultor.id,
    corrigidoEm: db.nowIso(),
  });
  res.json(atualizado);
});

// Lança um dia que ficou sem registro nenhum (ex: o funcionário esqueceu de logar
// naquele dia e não bateu ponto de jeito nenhum). Só Gestor/Supervisora. Não deixa
// duplicar um dia que já tem registro — nesse caso, use o PATCH acima para corrigir.
router.post("/manual", requireGestorOuSupervisora, (req, res) => {
  const { consultorId, data, horaEntrada, horaSaida } = req.body || {};
  const consultor = db.findById("consultores", consultorId);
  if (!consultor) return res.status(400).json({ erro: "Funcionário inválido." });
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return res.status(400).json({ erro: "Data inválida. Use o formato AAAA-MM-DD." });
  }
  if (!horaEntrada || !HORA_REGEX.test(horaEntrada)) {
    return res.status(400).json({ erro: "Horário de entrada inválido. Use o formato HH:MM." });
  }
  if (horaSaida && !HORA_REGEX.test(horaSaida)) {
    return res.status(400).json({ erro: "Horário de saída inválido. Use o formato HH:MM." });
  }
  if (horaSaida) {
    const [he, me] = horaEntrada.split(":").map(Number);
    const [hs, ms] = horaSaida.split(":").map(Number);
    if (hs * 60 + ms <= he * 60 + me) {
      return res.status(400).json({ erro: "A saída precisa ser depois da entrada." });
    }
  }

  const jaExiste = db.readCollection("pontos").some((p) => p.consultorId === consultorId && p.data === data);
  if (jaExiste) {
    return res
      .status(409)
      .json({ erro: "Já existe um registro de ponto para esse funcionário nesse dia. Edite o registro existente em vez de criar outro." });
  }

  const horasEsperadas = horasEsperadasNoDia(consultor, data);
  const { horasTrabalhadas, saldoHoras } = recalcularHoras({ horaEntrada, horaSaida: horaSaida || null, horasEsperadas });

  const novo = db.insert("pontos", {
    consultorId,
    data,
    diaSemana: diaSemanaDe(data),
    horaEntrada,
    entradaLat: null,
    entradaLng: null,
    entradaDistanciaMetros: null,
    entradaForaDoLocal: false,
    entradaReferencia: null,
    horaSaida: horaSaida || null,
    saidaLat: null,
    saidaLng: null,
    saidaDistanciaMetros: null,
    saidaForaDoLocal: false,
    horasTrabalhadas,
    horasEsperadas,
    saldoHoras,
    lancadoManualmente: true,
    corrigidoPorId: req.consultor.id,
    corrigidoEm: db.nowIso(),
  });
  res.status(201).json(novo);
});

module.exports = router;
