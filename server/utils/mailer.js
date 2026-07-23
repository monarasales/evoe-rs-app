// Envio de e-mail via Gmail (SMTP), usado para mandar o contrato em PDF direto para o cliente.
// Credenciais NUNCA ficam no código — vêm de variáveis de ambiente (arquivo .env, que não
// é enviado/compartilhado). Veja README.md > "Configurar envio de e-mail" para o passo a passo
// de como gerar a senha de app do Gmail.

const nodemailer = require("nodemailer");

function emailConfigurado() {
  return !!(process.env.EMAIL_USER && process.env.EMAIL_PASS);
}

function getTransporter() {
  if (!emailConfigurado()) return null;
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

/** anexos: [{ filename, content (Buffer) }] */
async function enviarEmail({ para, assunto, texto, anexos = [] }) {
  const transporter = getTransporter();
  if (!transporter) {
    const erro = new Error(
      "Envio de e-mail não está configurado. Peça para configurarem EMAIL_USER e EMAIL_PASS no arquivo .env (veja o README)."
    );
    erro.naoConfigurado = true;
    throw erro;
  }
  return transporter.sendMail({
    from: `"Evoé Gestão e RH" <${process.env.EMAIL_USER}>`,
    to: para,
    subject: assunto,
    text: texto,
    attachments: anexos,
  });
}

module.exports = { enviarEmail, emailConfigurado };
