// Controle de Ponto: entrada batida automaticamente no login, pausa de almoço e
// saída batidas manualmente, com localização opcional comparada aos dois endereços
// cadastrados (residencial e de trabalho) e cálculo de horas trabalhadas x esperadas
// (para apurar hora extra ou desconto). Hoje se aplica a quem tem o campo
// controlaPonto ligado (ver usaControlePonto abaixo) — não só a estagiários.
const db = require("../db");
const { DIAS_SEMANA, TOLERANCIA_PONTO_METROS } = require("./constants");
const { distanciaMetros } = require("./geo");

// Fortaleza/CE, UTC-3 o ano todo (o Brasil não usa mais horário de verão desde 2019).
// Precisa ser fixo assim porque o servidor (ex: Render) roda no fuso UTC por padrão —
// sem isso, a hora batida no ponto sairia sistematicamente errada (3h a mais).
const FUSO_HORARIO = "America/Fortaleza";

function partesAgoraNoFuso() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_HORARIO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const obj = {};
  partes.forEach((p) => {
    if (p.type !== "literal") obj[p.type] = p.value;
  });
  return obj;
}

// Data de hoje (AAAA-MM-DD) sempre no horário de Fortaleza/CE, independente do fuso
// horário configurado no servidor. Uso exclusivo do Controle de Ponto — as demais
// datas do sistema (vagas, contratos etc.) continuam usando hojeStr() de vagaCompute.js.
function hojeStrFuso() {
  const { year, month, day } = partesAgoraNoFuso();
  return `${year}-${month}-${day}`;
}

// Hora atual (HH:MM) sempre no horário de Fortaleza/CE.
function agoraHHMM() {
  const { hour, minute } = partesAgoraNoFuso();
  return `${hour}:${minute}`;
}

// Quem usa o Controle de Ponto: por padrão qualquer um com o campo controlaPonto
// marcado explicitamente. Para cadastros antigos (de antes desse campo existir),
// cai no comportamento anterior — vale para quem tem vínculo "Estágio" — para não
// "desligar" o ponto de ninguém que já usava sem o Gestor precisar reconfirmar.
function usaControlePonto(consultor) {
  if (!consultor) return false;
  if (typeof consultor.controlaPonto === "boolean") return consultor.controlaPonto;
  return consultor.tipoVinculo === "Estágio";
}

// Meio-dia (T12:00:00) evita que o fuso horário jogue a data para o dia anterior/
// seguinte ao converter a string "AAAA-MM-DD" em Date só para pegar o dia da semana.
function diaSemanaDe(dataStr) {
  return DIAS_SEMANA[new Date(`${dataStr}T12:00:00`).getDay()];
}

// Quantas horas esse consultor deveria trabalhar num dia específico, de acordo com o
// horário esperado cadastrado (0 se não tiver horário cadastrado ou o dia não for um
// dos dias de trabalho previstos) — já descontando a pausa de almoço, se houver.
function horasEsperadasNoDia(consultor, dataStr) {
  const h = consultor.horarioEsperado;
  if (!h || !h.entrada || !h.saida || !Array.isArray(h.dias) || h.dias.length === 0) return 0;
  if (!h.dias.includes(diaSemanaDe(dataStr))) return 0;
  const [he, me] = h.entrada.split(":").map(Number);
  const [hs, ms] = h.saida.split(":").map(Number);
  const minutosBrutos = hs * 60 + ms - (he * 60 + me);
  const minutosLiquidos = minutosBrutos - (Number(h.pausaAlmocoMinutos) || 0);
  return Math.max(0, Math.round((minutosLiquidos / 60) * 100) / 100);
}

// Horas entre dois horários "HH:MM" do mesmo dia.
function horasEntre(horaInicio, horaFim) {
  const [hi, mi] = horaInicio.split(":").map(Number);
  const [hf, mf] = horaFim.split(":").map(Number);
  const minutos = hf * 60 + mf - (hi * 60 + mi);
  return Math.round((minutos / 60) * 100) / 100;
}

// Horas realmente trabalhadas num registro de ponto: se a pausa de almoço foi batida
// (saída e volta), desconta esse intervalo do total; senão, é só saída - entrada.
function calcularHorasTrabalhadas(registro) {
  if (!registro.horaEntrada || !registro.horaSaida) return null;
  if (registro.pausaSaida && registro.pausaEntrada) {
    return (
      Math.round((horasEntre(registro.horaEntrada, registro.pausaSaida) + horasEntre(registro.pausaEntrada, registro.horaSaida)) * 100) / 100
    );
  }
  return horasEntre(registro.horaEntrada, registro.horaSaida);
}

// Compara uma coordenada batida (lat/lng do navegador) com OS DOIS endereços
// cadastrados (residencial e de trabalho) e fica com o mais próximo — em vez de
// depender de uma modalidade fixa (Presencial/Home Office) escolhida com antecedência.
// Isso resolve o caso de quem tem dias mistos (às vezes no escritório, às vezes em
// casa): o sistema simplesmente identifica de qual dos dois endereços a batida veio.
// Se nenhum dos dois estiver geocodificado ainda, devolve tudo null (sem checagem,
// sem alarme falso). toleranciaMetros é opcional (o chamador normalmente passa o
// valor configurado em Parâmetros do Sistema; sem ele, cai no padrão fixo).
function avaliarLocalizacao(consultor, lat, lng, toleranciaMetros = TOLERANCIA_PONTO_METROS) {
  const candidatos = [];
  if (consultor.enderecoTrabalhoLat != null && consultor.enderecoTrabalhoLng != null) {
    candidatos.push({ tipo: "trabalho", distancia: distanciaMetros(lat, lng, consultor.enderecoTrabalhoLat, consultor.enderecoTrabalhoLng) });
  }
  if (consultor.enderecoLat != null && consultor.enderecoLng != null) {
    candidatos.push({ tipo: "residencial", distancia: distanciaMetros(lat, lng, consultor.enderecoLat, consultor.enderecoLng) });
  }
  if (candidatos.length === 0) return { distanciaMetros: null, foraDoLocal: false, referencia: null };

  const maisProximo = candidatos.sort((a, b) => a.distancia - b.distancia)[0];
  return {
    distanciaMetros: Math.round(maisProximo.distancia),
    foraDoLocal: maisProximo.distancia > toleranciaMetros,
    // Só identifica QUAL endereço bateu (trabalho/residencial) quando está dentro da
    // tolerância — se está longe dos dois, não faz sentido "escolher" um como se fosse ele.
    referencia: maisProximo.distancia <= toleranciaMetros ? maisProximo.tipo : null,
  };
}

// Chamada no login (server/routes/auth.js) — bate a entrada do dia automaticamente,
// se o consultor usa Controle de Ponto e ainda não tiver batido hoje. Idempotente:
// se já bateu, devolve o registro existente sem duplicar.
function garantirPontoDeHoje(consultor) {
  const data = hojeStrFuso();
  const existente = db.readCollection("pontos").find((p) => p.consultorId === consultor.id && p.data === data);
  if (existente) return existente;
  return db.insert("pontos", {
    consultorId: consultor.id,
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
    horasEsperadas: horasEsperadasNoDia(consultor, data),
    saldoHoras: null,
  });
}

module.exports = {
  FUSO_HORARIO,
  hojeStrFuso,
  usaControlePonto,
  agoraHHMM,
  diaSemanaDe,
  horasEsperadasNoDia,
  horasEntre,
  calcularHorasTrabalhadas,
  avaliarLocalizacao,
  garantirPontoDeHoje,
};
