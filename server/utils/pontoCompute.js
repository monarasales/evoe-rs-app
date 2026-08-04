// Controle de Ponto: entrada batida automaticamente no login, saída batida
// manualmente (botão "Bater Saída"), com localização opcional comparada aos dois
// endereços cadastrados (residencial e de trabalho) e cálculo de horas trabalhadas
// x esperadas (para apurar hora extra ou desconto). Hoje se aplica a quem tem o
// campo controlaPonto ligado (ver usaControlePonto abaixo) — não só a estagiários.
const db = require("../db");
const { DIAS_SEMANA, TOLERANCIA_PONTO_METROS } = require("./constants");
const { distanciaMetros } = require("./geo");
const { hojeStr } = require("./vagaCompute");

// Quem usa o Controle de Ponto: por padrão qualquer um com o campo controlaPonto
// marcado explicitamente. Para cadastros antigos (de antes desse campo existir),
// cai no comportamento anterior — vale para quem tem vínculo "Estágio" — para não
// "desligar" o ponto de ninguém que já usava sem o Gestor precisar reconfirmar.
function usaControlePonto(consultor) {
  if (!consultor) return false;
  if (typeof consultor.controlaPonto === "boolean") return consultor.controlaPonto;
  return consultor.tipoVinculo === "Estágio";
}

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

// Compara uma coordenada batida (lat/lng do navegador) com OS DOIS endereços
// cadastrados (residencial e de trabalho) e fica com o mais próximo — em vez de
// depender de uma modalidade fixa (Presencial/Home Office) escolhida com antecedência.
// Isso resolve o caso de quem tem dias mistos (às vezes no escritório, às vezes em
// casa): o sistema simplesmente identifica de qual dos dois endereços a batida veio.
// Se nenhum dos dois estiver geocodificado ainda, devolve tudo null (sem checagem,
// sem alarme falso).
function avaliarLocalizacao(consultor, lat, lng) {
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
    foraDoLocal: maisProximo.distancia > TOLERANCIA_PONTO_METROS,
    // Só identifica QUAL endereço bateu (trabalho/residencial) quando está dentro da
    // tolerância — se está longe dos dois, não faz sentido "escolher" um como se fosse ele.
    referencia: maisProximo.distancia <= TOLERANCIA_PONTO_METROS ? maisProximo.tipo : null,
  };
}

// Chamada no login (server/routes/auth.js) — bate a entrada do dia automaticamente,
// se o consultor usa Controle de Ponto e ainda não tiver batido hoje. Idempotente:
// se já bateu, devolve o registro existente sem duplicar.
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
  usaControlePonto,
  agoraHHMM,
  diaSemanaDe,
  horasEsperadasNoDia,
  horasEntre,
  avaliarLocalizacao,
  garantirPontoDeHoje,
};
