// Controle de Ponto dos estagiários: entrada batida automaticamente no login, saída
// batida manualmente (botão "Bater Saída"), com localização opcional comparada ao
// endereço de referência (de trabalho, se Presencial; residencial, se Home Office) e
// cálculo de horas trabalhadas x esperadas (para apurar hora extra ou desconto).
const db = require("../db");
const { DIAS_SEMANA, TOLERANCIA_PONTO_METROS } = require("./constants");
const { distanciaMetros } = require("./geo");
const { hojeStr } = require("./vagaCompute");

function agoraHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Meio-dia (T12:00:00) evita que o fuso horário jogue a data para o dia anterior/
// seguinte ao converter a string "AAAA-MM-DD" em Date só para pegar o dia da semana.
function diaSemanaDe(dataStr) {
  return DIAS_SEMANA[new Date(`${dataStr}T12:00:00`).getDay()];
}

// Quantas horas esse consultor deveria trabalhar num dia específico, de acordo com o
// horário esperado cadastrado (0 se não tiver horário cadastrado ou o dia não for
// um dos dias de trabalho previstos).
function horasEsperadasNoDia(consultor, dataStr) {
  const h = consultor.horarioEsperado;
  if (!h || !h.entrada || !h.saida || !Array.isArray(h.dias) || h.dias.length === 0) return 0;
  if (!h.dias.includes(diaSemanaDe(dataStr))) return 0;
  const [he, me] = h.entrada.split(":").map(Number);
  const [hs, ms] = h.saida.split(":").map(Number);
  const minutos = hs * 60 + ms - (he * 60 + me);
  return Math.max(0, Math.round((minutos / 60) * 100) / 100);
}

// Horas entre dois horários "HH:MM" do mesmo dia.
function horasEntre(horaInicio, horaFim) {
  const [hi, mi] = horaInicio.split(":").map(Number);
  const [hf, mf] = horaFim.split(":").map(Number);
  const minutos = hf * 60 + mf - (hi * 60 + mi);
  return Math.round((minutos / 60) * 100) / 100;
}

// Qual endereço geocodificado usar como referência para checar a distância da
// batida do ponto: o de trabalho (Presencial) ou o residencial (Home Office).
// Retorna null se o consultor não tiver esse endereço geocodificado ainda.
function referenciaLocalizacao(consultor) {
  if (consultor.modalidadeTrabalho === "Home Office") {
    if (consultor.enderecoLat != null && consultor.enderecoLng != null) {
      return { lat: consultor.enderecoLat, lng: consultor.enderecoLng, tipo: "residencial" };
    }
    return null;
  }
  if (consultor.enderecoTrabalhoLat != null && consultor.enderecoTrabalhoLng != null) {
    return { lat: consultor.enderecoTrabalhoLat, lng: consultor.enderecoTrabalhoLng, tipo: "trabalho" };
  }
  return null;
}

// Compara uma coordenada batida (lat/lng do navegador) com a referência do consultor,
// devolvendo a distância em metros e se está fora da tolerância. Se não houver
// referência geocodificada, devolve tudo null (sem checagem, sem alarme falso).
function avaliarLocalizacao(consultor, lat, lng) {
  const ref = referenciaLocalizacao(consultor);
  if (!ref) return { distanciaMetros: null, foraDoLocal: false, referencia: null };
  const dist = distanciaMetros(lat, lng, ref.lat, ref.lng);
  return {
    distanciaMetros: Math.round(dist),
    foraDoLocal: dist > TOLERANCIA_PONTO_METROS,
    referencia: ref.tipo,
  };
}

// Chamada no login (server/routes/auth.js) — bate a entrada do dia automaticamente,
// se o consultor for estagiário e ainda não tiver batido hoje. Idempotente: se já
// bateu, devolve o registro existente sem duplicar.
function garantirPontoDeHoje(consultor) {
  const data = hojeStr();
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
  agoraHHMM,
  diaSemanaDe,
  horasEsperadasNoDia,
  horasEntre,
  referenciaLocalizacao,
  avaliarLocalizacao,
  garantirPontoDeHoje,
};
