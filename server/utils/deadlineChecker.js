// Verificação periódica de prazos: roda quando o servidor sobe e depois a cada
// intervalo fixo (padrão: 60 minutos), gerando notificações de "Prazo Próximo do
// Vencimento" e "Vaga Atrasada" para o consultor responsável e para todos os
// gestores. Cada vaga só dispara cada alerta uma vez (flags alertaPrazoEnviado /
// alertaAtrasoEnviado), evitando spam de notificação repetida.

const db = require("../db");
const { notify } = require("./notify");
const { ETAPAS_ENCERRADAS, DIAS_ALERTA_PRAZO, SLA_DIAS_LIMITE, DIAS_ALERTA_SLA_PROXIMO } = require("./constants");
const { hojeStr, diasEntre } = require("./vagaCompute");

function diasAte(dataStr) {
  const hoje = new Date(hojeStr() + "T00:00:00");
  const alvo = new Date(dataStr + "T00:00:00");
  return Math.round((alvo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
}

function getGestores(consultores) {
  return consultores.filter((c) => c.perfil === "Gestor" && c.ativo);
}

function checkPrazos() {
  const vagas = db.readCollection("vagas");
  const consultores = db.readCollection("consultores");
  const gestores = getGestores(consultores);
  let alterou = false;

  for (const vaga of vagas) {
    if (ETAPAS_ENCERRADAS.includes(vaga.etapaAtual)) continue;
    if (vaga.emStandBy) continue; // prazo pausado enquanto a vaga está em Stand By

    const dias = diasAte(vaga.prazoFechamento);

    if (dias < 0 && !vaga.alertaAtrasoEnviado) {
      notify({
        tipo: "Vaga Atrasada",
        vagaId: vaga.id,
        destinatarioId: vaga.consultorId,
        assunto: `Vaga atrasada: ${vaga.titulo}`,
        mensagem: `O prazo combinado (${vaga.prazoFechamento}) já passou e a vaga ainda está em "${vaga.etapaAtual}".`,
      });
      gestores.forEach((g) =>
        notify({
          tipo: "Vaga Atrasada",
          vagaId: vaga.id,
          destinatarioId: g.id,
          assunto: `Vaga atrasada: ${vaga.titulo}`,
          mensagem: `O prazo combinado (${vaga.prazoFechamento}) já passou e a vaga ainda está em "${vaga.etapaAtual}".`,
        })
      );
      vaga.alertaAtrasoEnviado = true;
      alterou = true;
    } else if (dias >= 0 && dias <= DIAS_ALERTA_PRAZO && !vaga.alertaPrazoEnviado) {
      notify({
        tipo: "Prazo Próximo do Vencimento",
        vagaId: vaga.id,
        destinatarioId: vaga.consultorId,
        assunto: `Prazo próximo do vencimento: ${vaga.titulo}`,
        mensagem: `Faltam ${dias} dia(s) para o prazo combinado (${vaga.prazoFechamento}).`,
      });
      vaga.alertaPrazoEnviado = true;
      alterou = true;
    }
  }

  if (alterou) db.writeCollection("vagas", vagas);
}

/** Verificação do SLA de fechamento (padrão interno de ${SLA_DIAS_LIMITE} dias, contado
 * a partir da abertura da vaga) — independente do prazo combinado com o cliente. Avisa o
 * consultor quando o prazo do SLA está próximo de estourar, e avisa consultor + gestores
 * quando o SLA já estourou, para que todos deem atenção ao fechamento. Cada aviso só
 * dispara uma vez por vaga (flags alertaSlaProximoEnviado / alertaSlaEstouradoEnviado). */
function checkSlaFechamento() {
  const vagas = db.readCollection("vagas");
  const consultores = db.readCollection("consultores");
  const gestores = getGestores(consultores);
  let alterou = false;

  for (const vaga of vagas) {
    if (ETAPAS_ENCERRADAS.includes(vaga.etapaAtual)) continue;
    if (vaga.emStandBy) continue; // SLA pausado enquanto a vaga está em Stand By

    const diasAbertos = diasEntre(vaga.dataAbertura, hojeStr());

    if (diasAbertos > SLA_DIAS_LIMITE && !vaga.alertaSlaEstouradoEnviado) {
      const msg = `A vaga "${vaga.titulo}" está aberta há ${diasAbertos} dia(s), acima do nosso SLA de fechamento (${SLA_DIAS_LIMITE} dias). Dê atenção especial para fechar essa vaga o quanto antes.`;
      notify({
        tipo: "SLA de Fechamento Estourado",
        vagaId: vaga.id,
        destinatarioId: vaga.consultorId,
        assunto: `SLA estourado: ${vaga.titulo}`,
        mensagem: msg,
      });
      gestores.forEach((g) =>
        notify({
          tipo: "SLA de Fechamento Estourado",
          vagaId: vaga.id,
          destinatarioId: g.id,
          assunto: `SLA estourado: ${vaga.titulo}`,
          mensagem: msg,
        })
      );
      vaga.alertaSlaEstouradoEnviado = true;
      vaga.alertaSlaProximoEnviado = true;
      alterou = true;
    } else if (diasAbertos >= SLA_DIAS_LIMITE - DIAS_ALERTA_SLA_PROXIMO && !vaga.alertaSlaProximoEnviado) {
      notify({
        tipo: "SLA de Fechamento Próximo do Limite",
        vagaId: vaga.id,
        destinatarioId: vaga.consultorId,
        assunto: `SLA quase no limite: ${vaga.titulo}`,
        mensagem: `A vaga "${vaga.titulo}" já está aberta há ${diasAbertos} dia(s). Faltam ${SLA_DIAS_LIMITE - diasAbertos} dia(s) para atingir o limite do nosso SLA de fechamento (${SLA_DIAS_LIMITE} dias). Fique de olho para fechar dentro do prazo.`,
      });
      vaga.alertaSlaProximoEnviado = true;
      alterou = true;
    }
  }

  if (alterou) db.writeCollection("vagas", vagas);
}

function startDeadlineChecker(intervalMinutos = 60) {
  checkPrazos();
  checkSlaFechamento();
  setInterval(() => {
    checkPrazos();
    checkSlaFechamento();
  }, intervalMinutos * 60 * 1000);
}

module.exports = { checkPrazos, checkSlaFechamento, startDeadlineChecker };
