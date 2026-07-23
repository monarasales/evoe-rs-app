const express = require("express");
const db = require("../db");
const { requireAuth, requireGestor } = require("../middleware/auth");
const { CONTRATO_PADRAO } = require("../utils/constants");
const { gerarContratoPdfBuffer } = require("../utils/contratoPdf");
const { enviarEmail, emailConfigurado } = require("../utils/mailer");
const { getParamContratos } = require("./config");

const router = express.Router();

function comDetalhes(contrato) {
  const empresa = db.findById("empresas", contrato.empresaId);
  const vaga = db.findById("vagas", contrato.vagaId);
  const consultor = contrato.consultorId ? db.findById("consultores", contrato.consultorId) : null;
  return {
    ...contrato,
    empresaNome: empresa ? empresa.nome : "—",
    vagaTitulo: vaga ? vaga.titulo : "—",
    consultorNome: consultor ? consultor.nome : "—",
  };
}

function montarNumero(sequencial, ano) {
  return `${String(sequencial).padStart(4, "0")}/${ano}`;
}

/** Monta o payload completo (cliente, testemunhas, termos) que alimenta o texto e o PDF do contrato. */
function montarDadosContrato(contrato) {
  const empresa = db.findById("empresas", contrato.empresaId) || {};
  const vaga = db.findById("vagas", contrato.vagaId) || {};
  return {
    numero: contrato.numero,
    dataContrato: contrato.dataContrato,
    cliente: { nome: empresa.nome || "", cnpj: empresa.cnpj || "", endereco: empresa.endereco || "" },
    cargoObjeto: contrato.cargoObjeto || vaga.titulo || "",
    percentualHonorarios: contrato.percentualHonorarios,
    parcelaInicialPct: contrato.parcelaInicialPct,
    parcelaFechamentoPct: contrato.parcelaFechamentoPct,
    prazoReposicaoDias: contrato.prazoReposicaoDias,
    vigenciaDias: contrato.vigenciaDias,
    prazoRescisaoAvisoDias: contrato.prazoRescisaoAvisoDias,
    testemunha1: { nome: contrato.testemunha1Nome || "", cpf: contrato.testemunha1Cpf || "" },
    testemunha2: { nome: contrato.testemunha2Nome || "", cpf: contrato.testemunha2Cpf || "" },
  };
}

router.get("/", requireAuth, (req, res) => {
  const contratos = db.readCollection("contratos").sort((a, b) => (a.dataContrato < b.dataContrato ? 1 : -1));
  res.json(contratos.map(comDetalhes));
});

router.get("/:id", requireAuth, (req, res) => {
  const contrato = db.findById("contratos", req.params.id);
  if (!contrato) return res.status(404).json({ erro: "Contrato não encontrado." });
  res.json(comDetalhes(contrato));
});

router.post("/", requireAuth, (req, res) => {
  const {
    vagaId,
    percentualHonorarios,
    parcelaInicialPct,
    parcelaFechamentoPct,
    prazoReposicaoDias,
    vigenciaDias,
    prazoRescisaoAvisoDias,
    dataContrato,
    testemunha1,
    testemunha2,
  } = req.body || {};

  if (!vagaId) return res.status(400).json({ erro: "Selecione a vaga para a qual o contrato será gerado." });
  const vaga = db.findById("vagas", vagaId);
  if (!vaga) return res.status(400).json({ erro: "Vaga inválida." });
  const empresa = db.findById("empresas", vaga.empresaId);
  if (!empresa) return res.status(400).json({ erro: "A vaga selecionada não tem uma empresa cliente vinculada." });
  if (!empresa.cnpj || !empresa.endereco) {
    return res.status(400).json({
      erro: `Complete o cadastro de "${empresa.nome}" (CNPJ e Endereço) em Configurações > Empresas Clientes antes de gerar o contrato.`,
    });
  }

  const paramContratos = getParamContratos();
  const ano = new Date(dataContrato || new Date()).getFullYear() || new Date().getFullYear();
  const numero = montarNumero(paramContratos.proximoNumero, ano);

  const contrato = db.insert("contratos", {
    numero,
    vagaId,
    empresaId: vaga.empresaId,
    consultorId: vaga.consultorId || null,
    cargoObjeto: vaga.titulo,
    percentualHonorarios: Number(percentualHonorarios) || CONTRATO_PADRAO.percentualHonorarios,
    parcelaInicialPct: Number(parcelaInicialPct) || CONTRATO_PADRAO.parcelaInicialPct,
    parcelaFechamentoPct: Number(parcelaFechamentoPct) || CONTRATO_PADRAO.parcelaFechamentoPct,
    prazoReposicaoDias: Number(prazoReposicaoDias) || CONTRATO_PADRAO.prazoReposicaoDias,
    vigenciaDias: Number(vigenciaDias) || CONTRATO_PADRAO.vigenciaDias,
    prazoRescisaoAvisoDias: Number(prazoRescisaoAvisoDias) || CONTRATO_PADRAO.prazoRescisaoAvisoDias,
    dataContrato: dataContrato || new Date().toISOString().slice(0, 10),
    testemunha1Nome: (testemunha1 && testemunha1.nome) || "",
    testemunha1Cpf: (testemunha1 && testemunha1.cpf) || "",
    testemunha2Nome: (testemunha2 && testemunha2.nome) || "",
    testemunha2Cpf: (testemunha2 && testemunha2.cpf) || "",
    status: "Gerado",
    geradoPorId: req.consultor.id,
  });

  db.update("parametros", paramContratos.id, { proximoNumero: paramContratos.proximoNumero + 1 });

  res.status(201).json(comDetalhes(contrato));
});

router.delete("/:id", requireAuth, requireGestor, (req, res) => {
  const ok = db.remove("contratos", req.params.id);
  if (!ok) return res.status(404).json({ erro: "Contrato não encontrado." });
  res.json({ ok: true });
});

router.get("/:id/pdf", requireAuth, async (req, res) => {
  const contrato = db.findById("contratos", req.params.id);
  if (!contrato) return res.status(404).json({ erro: "Contrato não encontrado." });
  try {
    const buffer = await gerarContratoPdfBuffer(montarDadosContrato(contrato));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Contrato-${contrato.numero.replace("/", "-")}.pdf"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ erro: "Falha ao gerar o PDF do contrato.", detalhe: err.message });
  }
});

router.get("/:id/link-whatsapp", requireAuth, (req, res) => {
  const contrato = db.findById("contratos", req.params.id);
  if (!contrato) return res.status(404).json({ erro: "Contrato não encontrado." });
  const empresa = db.findById("empresas", contrato.empresaId);
  if (!empresa || !empresa.whatsappContato) {
    return res.status(400).json({ erro: "Esta empresa não tem um WhatsApp de contato cadastrado." });
  }
  const digitos = empresa.whatsappContato.replace(/\D/g, "");
  const numeroComPais = digitos.startsWith("55") ? digitos : `55${digitos}`;
  const mensagem = `Olá! Segue o contrato de prestação de serviços nº ${contrato.numero} da Evoé Gestão e RH referente à vaga "${contrato.cargoObjeto}". Vou anexar o PDF aqui em seguida.`;
  const link = `https://wa.me/${numeroComPais}?text=${encodeURIComponent(mensagem)}`;
  res.json({ link });
});

router.post("/:id/enviar-email", requireAuth, async (req, res) => {
  const contrato = db.findById("contratos", req.params.id);
  if (!contrato) return res.status(404).json({ erro: "Contrato não encontrado." });
  const empresa = db.findById("empresas", contrato.empresaId);
  const destinatario = (req.body && req.body.para) || (empresa && empresa.emailContato);
  if (!destinatario) {
    return res.status(400).json({ erro: "Informe um e-mail de destino ou cadastre o e-mail de contato desta empresa." });
  }

  if (!emailConfigurado()) {
    return res.status(400).json({
      erro: "O envio de e-mail ainda não foi configurado neste computador. Veja o README ('Configurar envio de e-mail') para o passo a passo com a senha de app do Gmail.",
    });
  }

  try {
    const buffer = await gerarContratoPdfBuffer(montarDadosContrato(contrato));
    await enviarEmail({
      para: destinatario,
      assunto: `Contrato de Prestação de Serviços nº ${contrato.numero} — Evoé Gestão e RH`,
      texto:
        `Olá,\n\nSegue em anexo o contrato de prestação de serviços de recrutamento e seleção referente à vaga "${contrato.cargoObjeto}".\n\n` +
        `Qualquer dúvida, estamos à disposição.\n\nAtenciosamente,\nEvoé Gestão e RH`,
      anexos: [{ filename: `Contrato-${contrato.numero.replace("/", "-")}.pdf`, content: buffer }],
    });
    db.update("contratos", contrato.id, { status: "Enviado por e-mail", emailEnviadoPara: destinatario, dataEnvioEmail: new Date().toISOString() });
    res.json({ ok: true, para: destinatario });
  } catch (err) {
    if (err.naoConfigurado) return res.status(400).json({ erro: err.message });
    res.status(500).json({ erro: "Falha ao enviar o e-mail.", detalhe: err.message });
  }
});

module.exports = router;
