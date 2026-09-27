// Backup dos dados do sistema (clientes, vagas, candidatos, contratos, ponto...).
//
// Um backup é um único arquivo .json com TODAS as coleções dentro. Ele é:
//  - enviado por e-mail uma vez por dia (só em produção), para existir uma cópia
//    FORA do Render, sem prazo de validade;
//  - guardado também numa pasta "backups" dentro do disco de dados (últimas cópias);
//  - baixável a qualquer momento pelo Gestor em Configurações > Parâmetros do Sistema.
//
// Destinatário do e-mail: BACKUP_EMAIL (se definido) ou o próprio EMAIL_USER.

const fs = require("fs");
const path = require("path");
const db = require("../db");
const { enviarEmail, emailConfigurado } = require("./mailer");

const PASTA_BACKUPS = path.join(db.DATA_DIR, "backups");
const COPIAS_MANTIDAS_NO_DISCO = 30;
const FUSO = "America/Fortaleza";

function hojeLocal() {
  // formato AAAA-MM-DD no horário do Ceará
  return new Date().toLocaleDateString("en-CA", { timeZone: FUSO });
}

function listarColecoes() {
  return fs
    .readdirSync(db.DATA_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

function gerarBackup() {
  const colecoes = {};
  for (const nome of listarColecoes()) colecoes[nome] = db.readCollection(nome);
  const conteudo = {
    sistema: "evoe-rs-app",
    geradoEm: new Date().toISOString(),
    colecoes,
  };
  const totais = Object.fromEntries(Object.entries(colecoes).map(([k, v]) => [k, v.length]));
  return {
    nomeArquivo: `backup-evoe-${hojeLocal()}.json`,
    buffer: Buffer.from(JSON.stringify(conteudo, null, 2), "utf-8"),
    totais,
  };
}

function salvarNoDisco(backup) {
  fs.mkdirSync(PASTA_BACKUPS, { recursive: true });
  fs.writeFileSync(path.join(PASTA_BACKUPS, backup.nomeArquivo), backup.buffer);
  const antigos = fs
    .readdirSync(PASTA_BACKUPS)
    .filter((f) => f.startsWith("backup-evoe-"))
    .sort()
    .reverse()
    .slice(COPIAS_MANTIDAS_NO_DISCO);
  antigos.forEach((f) => fs.unlinkSync(path.join(PASTA_BACKUPS, f)));
}

function getParamBackup() {
  const param = db.readCollection("parametros").find((p) => p.chave === "backup");
  return param || db.insert("parametros", { chave: "backup", ultimoEnvio: null, ultimoErro: null });
}

function statusBackup() {
  const param = getParamBackup();
  return {
    emailConfigurado: emailConfigurado(),
    automaticoAtivo: backupAutomaticoAtivo(),
    destinatario: process.env.BACKUP_EMAIL || process.env.EMAIL_USER || null,
    ultimoEnvio: param.ultimoEnvio,
    ultimoErro: param.ultimoErro,
  };
}

async function enviarBackupPorEmail() {
  const backup = gerarBackup();
  salvarNoDisco(backup);

  const resumo = Object.entries(backup.totais)
    .map(([nome, qtd]) => `  - ${nome}: ${qtd} registro(s)`)
    .join("\n");

  const param = getParamBackup();
  try {
    await enviarEmail({
      para: process.env.BACKUP_EMAIL || process.env.EMAIL_USER,
      assunto: `Backup Evoé — ${hojeLocal()}`,
      texto:
        `Backup automático dos dados do sistema Evoé Gestão e RH.\n\n` +
        `Conteúdo:\n${resumo}\n\n` +
        `Guarde este e-mail: o arquivo anexo permite recuperar os dados caso algo ` +
        `seja perdido. Não encaminhe — contém dados pessoais de candidatos e clientes (LGPD).`,
      anexos: [{ filename: backup.nomeArquivo, content: backup.buffer }],
    });
    db.update("parametros", param.id, { ultimoEnvio: new Date().toISOString(), ultimoErro: null });
  } catch (err) {
    db.update("parametros", param.id, { ultimoErro: `${new Date().toISOString()} — ${err.message}` });
    throw err;
  }
  return backup;
}

// Só envia sozinho em produção — rodando localmente (dados de exemplo) não manda e-mail.
function backupAutomaticoAtivo() {
  return process.env.NODE_ENV === "production" && emailConfigurado();
}

async function checkBackupDiario() {
  if (!backupAutomaticoAtivo()) return;
  const { ultimoEnvio } = getParamBackup();
  const ultimoDia = ultimoEnvio
    ? new Date(ultimoEnvio).toLocaleDateString("en-CA", { timeZone: FUSO })
    : null;
  if (ultimoDia === hojeLocal()) return;
  try {
    await enviarBackupPorEmail();
    console.log(`[backup] Backup diário enviado (${hojeLocal()}).`);
  } catch (err) {
    console.error("[backup] Falha ao enviar backup diário — nova tentativa na próxima hora:", err.message);
  }
}

function startBackupDiario(intervalMinutos = 60) {
  checkBackupDiario();
  setInterval(checkBackupDiario, intervalMinutos * 60 * 1000);
}

module.exports = { gerarBackup, enviarBackupPorEmail, statusBackup, startBackupDiario };
