// Controle de Ponto: entrada batida automaticamente no login (ver
// server/routes/auth.js), pausa de almoço e saída batidas manualmente pelo próprio
// funcionário, e relatório de horas trabalhadas x esperadas para o Gestor/Supervisora.
// Só o Gestor pode corrigir uma batida errada/esquecida ou lançar um dia manualmente
// (decisão explícita da usuária: segurança dos horários registrados).
const express = require("express");
const db = require("../db");
const { requireAuth, requireGestor, requireGestorOuSupervisora } = require("../middleware/auth");
const { getParamPonto } = require("./config");
const {
  hojeStrFuso,
  agoraHHMM,
  avaliarLocalizacao,
  usaControlePonto,
  horasEsperadasNoDia,
  diaSemanaDe,
  blocoDoDia,
  calcularHorasTrabalhadas,
  mesFechadoPara,
} = require("../utils/pontoCompute");

const router = express.Router();

const HORA_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function pontoDeHoje(consultorId) {
  const data = hojeStrFuso();
  return db.readCollection("pontos").find((p) => p.consultorId === consultorId && p.data === data) || null;
}

function toleranciaConfigurada() {
  return getParamPonto().toleranciaMetros;
}

// Recalcula horasTrabalhadas/saldoHoras de um registro (considerando a pausa de
// almoço, se houver) após qualquer alteração — batida normal, correção manual ou
// lançamento manual.
// Banco de Horas: diferenças pequenas (dentro da tolerância configurada, ver
// getParamPonto) não geram saldo — evita contabilizar minutos de imprecisão normal
// na hora de bater o ponto. Acima da tolerância, o saldo é a diferença cheia (não
// só o excedente), pra refletir corretamente horas extras ou horas faltando.
function recalcularHoras(registro) {
  const horasTrabalhadas = calcularHorasTrabalhadas(registro);
  if (horasTrabalhadas == null) return { horasTrabalhadas: null, saldoHoras: null };
  const diferenca = horasTrabalhadas - (registro.horasEsperadas || 0);
  const toleranciaHoras = (Number(getParamPonto().toleranciaBancoHorasMinutos) || 0) / 60;
  const saldoHoras = Math.abs(diferenca) <= toleranciaHoras ? 0 : Math.round(diferenca * 100) / 100;
  return { horasTrabalhadas, saldoHoras };
}

// Registro de ponto do dia do próprio usuário logado (ou null, se ainda não bateu
// hoje — por exemplo, quem não usa Controle de Ponto nunca tem um registro criado).
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

  const avaliacao = avaliarLocalizacao(req.consultor, lat, lng, toleranciaConfigurada());
  const atualizado = db.update("pontos", ponto.id, {
    entradaLat: lat,
    entradaLng: lng,
    entradaDistanciaMetros: avaliacao.distanciaMetros,
    entradaForaDoLocal: avaliacao.foraDoLocal,
    entradaReferencia: avaliacao.referencia,
  });
  res.json(atualizado);
});

// Bater a ENTRADA — ação manual do funcionário ao chegar (clique no botão em "Meu
// Ponto"). Cria o registro do dia só no primeiro clique; um segundo clique dá erro
// claro em vez de duplicar ou sobrescrever o horário já batido.
router.post("/bater-entrada", requireAuth, (req, res) => {
  if (!usaControlePonto(req.consultor)) {
    return res.status(403).json({ erro: "O Controle de Ponto não está habilitado para o seu cadastro." });
  }
  if (pontoDeHoje(req.consultor.id)) {
    return res.status(400).json({ erro: "A entrada de hoje já foi registrada." });
  }

  const data = hojeStrFuso();
  const { lat, lng } = req.body || {};
  const registro = {
    consultorId: req.consultor.id,
    data,
    diaSemana: diaSemanaDe(data),
    horaEntrada: agoraHHMM(),
    entradaLat: null,
    entradaLng: null,
    entradaDistanciaMetros: null,
    entradaForaDoLocal: false,
    entradaReferencia: null,
    pausaSaida: null,
    pausaEntrada: null,
    horaSaida: null,
    saidaLat: null,
    saidaLng: null,
    saidaDistanciaMetros: null,
    saidaForaDoLocal: false,
    horasTrabalhadas: null,
    horasEsperadas: horasEsperadasNoDia(req.consultor, data),
    saldoHoras: null,
  };
  if (typeof lat === "number" && typeof lng === "number") {
    const avaliacao = avaliarLocalizacao(req.consultor, lat, lng, toleranciaConfigurada());
    registro.entradaLat = lat;
    registro.entradaLng = lng;
    registro.entradaDistanciaMetros = avaliacao.distanciaMetros;
    registro.entradaForaDoLocal = avaliacao.foraDoLocal;
    registro.entradaReferencia = avaliacao.referencia;
  }
  const novo = db.insert("pontos", registro);
  res.status(201).json(novo);
});

// Bater a SAÍDA para o almoço — só para quem tem pausa configurada no horário
// esperado (pausaAlmocoMinutos > 0).
router.post("/pausa-saida", requireAuth, (req, res) => {
  if (!usaControlePonto(req.consultor)) {
    return res.status(403).json({ erro: "O Controle de Ponto não está habilitado para o seu cadastro." });
  }
  const ponto = pontoDeHoje(req.consultor.id);
  if (!ponto) return res.status(400).json({ erro: "Nenhuma entrada registrada hoje." });
  if (ponto.horaSaida) return res.status(400).json({ erro: "A saída de hoje já foi registrada — não é mais possível bater a pausa." });
  if (ponto.pausaSaida) return res.status(400).json({ erro: "A saída para o almoço já foi registrada." });

  // O horário esperado agora pode ter blocos diferentes por dia (ex: com pausa
  // numa Segunda, sem pausa numa Terça) — confere se o bloco de HOJE tem pausa
  // configurada antes de deixar bater, mesmo que o botão já fique escondido no
  // front-end quando não há pausa prevista para o dia.
  const blocoHoje = blocoDoDia(req.consultor, ponto.data);
  if (!blocoHoje || !(Number(blocoHoje.pausaAlmocoMinutos) > 0)) {
    return res.status(400).json({ erro: "Seu horário de hoje não tem pausa de almoço configurada." });
  }

  const { lat, lng } = req.body || {};
  const patch = { pausaSaida: agoraHHMM() };
  if (typeof lat === "number" && typeof lng === "number") {
    const avaliacao = avaliarLocalizacao(req.consultor, lat, lng, toleranciaConfigurada());
    patch.pausaSaidaLat = lat;
    patch.pausaSaidaLng = lng;
    patch.pausaSaidaForaDoLocal = avaliacao.foraDoLocal;
  }
  const atualizado = db.update("pontos", ponto.id, patch);
  res.json(atualizado);
});

// Bater a VOLTA do almoço.
router.post("/pausa-entrada", requireAuth, (req, res) => {
  if (!usaControlePonto(req.consultor)) {
    return res.status(403).json({ erro: "O Controle de Ponto não está habilitado para o seu cadastro." });
  }
  const ponto = pontoDeHoje(req.consultor.id);
  if (!ponto) return res.status(400).json({ erro: "Nenhuma entrada registrada hoje." });
  if (!ponto.pausaSaida) return res.status(400).json({ erro: "Bata a saída para o almoço antes de bater a volta." });
  if (ponto.pausaEntrada) return res.status(400).json({ erro: "A volta do almoço já foi registrada." });

  const { lat, lng } = req.body || {};
  const patch = { pausaEntrada: agoraHHMM() };
  if (typeof lat === "number" && typeof lng === "number") {
    const avaliacao = avaliarLocalizacao(req.consultor, lat, lng, toleranciaConfigurada());
    patch.pausaEntradaLat = lat;
    patch.pausaEntradaLng = lng;
    patch.pausaEntradaForaDoLocal = avaliacao.foraDoLocal;
  }
  const atualizado = db.update("pontos", ponto.id, patch);
  res.json(atualizado);
});

// Bater saída — ação manual do funcionário. Calcula horas trabalhadas e o saldo
// (positivo = hora extra, negativo = a descontar) com base no horário esperado
// cadastrado, descontando a pausa de almoço se ela foi usada.
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
  if (ponto.pausaSaida && !ponto.pausaEntrada) {
    return res.status(400).json({ erro: "Bata a volta do almoço antes de bater a saída final." });
  }

  const { lat, lng } = req.body || {};
  const horaSaida = agoraHHMM();

  const patch = { horaSaida };
  if (typeof lat === "number" && typeof lng === "number") {
    const avaliacao = avaliarLocalizacao(req.consultor, lat, lng, toleranciaConfigurada());
    patch.saidaLat = lat;
    patch.saidaLng = lng;
    patch.saidaDistanciaMetros = avaliacao.distanciaMetros;
    patch.saidaForaDoLocal = avaliacao.foraDoLocal;
  }

  const { horasTrabalhadas, saldoHoras } = recalcularHoras({ ...ponto, horaSaida });
  patch.horasTrabalhadas = horasTrabalhadas;
  patch.saldoHoras = saldoHoras;

  const atualizado = db.update("pontos", ponto.id, patch);
  res.json(atualizado);
});

// Histórico do próprio funcionário (tela "Meu Ponto").
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
  const hoje = hojeStrFuso();
  const inicio = req.query.inicio || `${hoje.slice(0, 7)}-01`;
  const fim = req.query.fim || hoje;

  const resumo = consultores.map((c) => {
    const doPeriodo = registros.filter((p) => p.consultorId === c.id && p.data >= inicio && p.data <= fim);
    const horasTrabalhadas = doPeriodo.reduce((acc, p) => acc + (p.horasTrabalhadas || 0), 0);
    const horasEsperadas = doPeriodo.reduce((acc, p) => acc + (p.horasEsperadas || 0), 0);
    return {
      consultor: { id: c.id, nome: c.nome, ativo: c.ativo },
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
// bateu no horário errado). Só o Gestor — Supervisora só visualiza, não altera
// (decisão explícita da usuária). Recalcula horas trabalhadas/saldo e deixa um
// rastro (corrigidoPorId/corrigidoEm) de que houve uma correção manual.
router.patch("/:id", requireGestor, (req, res) => {
  const registro = db.findById("pontos", req.params.id);
  if (!registro) return res.status(404).json({ erro: "Registro de ponto não encontrado." });
  // Algumas pessoas com perfil Gestor podem ser bloqueadas (bloqueiaAutoCorrecaoPonto,
  // ver cadastro do funcionário) de corrigir o PRÓPRIO ponto — mesmo tendo acesso de
  // Gestor para o restante da equipe. Só quem não tem essa restrição pode se auto-corrigir.
  if (registro.consultorId === req.consultor.id && req.consultor.bloqueiaAutoCorrecaoPonto) {
    return res.status(403).json({ erro: "Você não tem permissão para corrigir o próprio ponto. Peça para outra pessoa com acesso de Gestor fazer essa correção." });
  }
  if (mesFechadoPara(registro.consultorId, registro.data)) {
    return res.status(409).json({
      erro: `O mês ${registro.data.slice(0, 7)} já foi fechado no Banco de Horas. Reabra o mês em Controle de Ponto antes de corrigir este dia.`,
    });
  }

  const { horaEntrada, horaSaida, pausaSaida, pausaEntrada } = req.body || {};
  for (const [rotulo, valor] of [
    ["entrada", horaEntrada],
    ["saída", horaSaida],
    ["saída para o almoço", pausaSaida],
    ["volta do almoço", pausaEntrada],
  ]) {
    if (valor !== undefined && valor !== null && !HORA_REGEX.test(valor)) {
      return res.status(400).json({ erro: `Horário de ${rotulo} inválido. Use o formato HH:MM.` });
    }
  }

  const mesclado = {
    ...registro,
    horaEntrada: horaEntrada !== undefined ? horaEntrada : registro.horaEntrada,
    horaSaida: horaSaida !== undefined ? horaSaida : registro.horaSaida,
    pausaSaida: pausaSaida !== undefined ? pausaSaida : registro.pausaSaida,
    pausaEntrada: pausaEntrada !== undefined ? pausaEntrada : registro.pausaEntrada,
  };

  // Confere a ordem cronológica de tudo que ficou preenchido: entrada < pausaSaida
  // < pausaEntrada < saída.
  const sequencia = [
    ["entrada", mesclado.horaEntrada],
    ["saída para o almoço", mesclado.pausaSaida],
    ["volta do almoço", mesclado.pausaEntrada],
    ["saída", mesclado.horaSaida],
  ].filter(([, v]) => v);
  for (let i = 1; i < sequencia.length; i++) {
    const [rotuloAnterior, anterior] = sequencia[i - 1];
    const [rotuloAtual, atual] = sequencia[i];
    const [ha, ma] = anterior.split(":").map(Number);
    const [hb, mb] = atual.split(":").map(Number);
    if (hb * 60 + mb <= ha * 60 + ma) {
      return res.status(400).json({ erro: `O horário de "${rotuloAtual}" precisa ser depois do de "${rotuloAnterior}".` });
    }
  }

  const { horasTrabalhadas, saldoHoras } = recalcularHoras(mesclado);
  const atualizado = db.update("pontos", registro.id, {
    horaEntrada: mesclado.horaEntrada,
    horaSaida: mesclado.horaSaida,
    pausaSaida: mesclado.pausaSaida,
    pausaEntrada: mesclado.pausaEntrada,
    horasTrabalhadas,
    saldoHoras,
    corrigidoManualmente: true,
    corrigidoPorId: req.consultor.id,
    corrigidoEm: db.nowIso(),
  });
  res.json(atualizado);
});

// Lança um dia que ficou sem registro nenhum (ex: o funcionário esqueceu de logar
// naquele dia e não bateu ponto de jeito nenhum). Só o Gestor. Não deixa duplicar um
// dia que já tem registro — nesse caso, use o PATCH acima para corrigir.
router.post("/manual", requireGestor, (req, res) => {
  const { consultorId, data, horaEntrada, horaSaida, pausaSaida, pausaEntrada } = req.body || {};
  const consultor = db.findById("consultores", consultorId);
  if (!consultor) return res.status(400).json({ erro: "Funcionário inválido." });
  if (consultorId === req.consultor.id && req.consultor.bloqueiaAutoCorrecaoPonto) {
    return res.status(403).json({ erro: "Você não tem permissão para lançar o próprio ponto manualmente. Peça para outra pessoa com acesso de Gestor fazer isso." });
  }
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return res.status(400).json({ erro: "Data inválida. Use o formato AAAA-MM-DD." });
  }
  if (mesFechadoPara(consultorId, data)) {
    return res.status(409).json({
      erro: `O mês ${data.slice(0, 7)} já foi fechado no Banco de Horas. Reabra o mês em Controle de Ponto antes de lançar um registro nele.`,
    });
  }
  if (!horaEntrada || !HORA_REGEX.test(horaEntrada)) {
    return res.status(400).json({ erro: "Horário de entrada inválido. Use o formato HH:MM." });
  }
  for (const [rotulo, valor] of [
    ["saída", horaSaida],
    ["saída para o almoço", pausaSaida],
    ["volta do almoço", pausaEntrada],
  ]) {
    if (valor && !HORA_REGEX.test(valor)) {
      return res.status(400).json({ erro: `Horário de ${rotulo} inválido. Use o formato HH:MM.` });
    }
  }

  const sequencia = [
    ["entrada", horaEntrada],
    ["saída para o almoço", pausaSaida],
    ["volta do almoço", pausaEntrada],
    ["saída", horaSaida],
  ].filter(([, v]) => v);
  for (let i = 1; i < sequencia.length; i++) {
    const [rotuloAnterior, anterior] = sequencia[i - 1];
    const [rotuloAtual, atual] = sequencia[i];
    const [ha, ma] = anterior.split(":").map(Number);
    const [hb, mb] = atual.split(":").map(Number);
    if (hb * 60 + mb <= ha * 60 + ma) {
      return res.status(400).json({ erro: `O horário de "${rotuloAtual}" precisa ser depois do de "${rotuloAnterior}".` });
    }
  }

  const jaExiste = db.readCollection("pontos").some((p) => p.consultorId === consultorId && p.data === data);
  if (jaExiste) {
    return res
      .status(409)
      .json({ erro: "Já existe um registro de ponto para esse funcionário nesse dia. Edite o registro existente em vez de criar outro." });
  }

  const horasEsperadas = horasEsperadasNoDia(consultor, data);
  const { horasTrabalhadas, saldoHoras } = recalcularHoras({
    horaEntrada,
    horaSaida: horaSaida || null,
    pausaSaida: pausaSaida || null,
    pausaEntrada: pausaEntrada || null,
    horasEsperadas,
  });

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
    pausaSaida: pausaSaida || null,
    pausaEntrada: pausaEntrada || null,
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
