const express = require("express");
const db = require("../db");
const { requireAuth, requireGestor } = require("../middleware/auth");
const { CONTRATO_PADRAO, DIAS_PARCELA2_APOS_PARCELA1, TIPOS_COBRANCA_CONTRATO } = require("../utils/constants");
const { calcularParcelas, calcularValorContrato, formatarListaCargos } = require("../utils/financeiro");
const { gerarContratoPdfBuffer } = require("../utils/contratoPdf");
const { gerarContratoDocxBuffer } = require("../utils/contratoDocx");
const { enviarEmail, emailConfigurado } = require("../utils/mailer");
const { getParamContratos } = require("./config");

const router = express.Router();

// Um contrato normalmente cobre uma única vaga (vagaId), mas pode agrupar outras do
// MESMO cliente (vagasAdicionaisIds) — quando o cliente abre duas vagas juntas, evita
// ter que gerar um contrato separado pra cada uma. O percentual/condições continuam
// os mesmos; só a base de cálculo do valor total passa a somar o salário de cada vaga.
function vagasDoContrato(contrato) {
  const principal = db.findById("vagas", contrato.vagaId);
  const adicionais = (contrato.vagasAdicionaisIds || []).map((id) => db.findById("vagas", id)).filter(Boolean);
  return [principal, ...adicionais].filter(Boolean);
}

function comDetalhes(contrato) {
  const empresa = db.findById("empresas", contrato.empresaId);
  const vaga = db.findById("vagas", contrato.vagaId);
  const todasVagas = vagasDoContrato(contrato);
  const vagasAdicionais = todasVagas.slice(1);
  const consultor = contrato.consultorId ? db.findById("consultores", contrato.consultorId) : null;
  const { valorTotal, valorParcela1, valorParcela2, salarioFaltando, ehPermuta } = calcularParcelas(contrato, vaga, vagasAdicionais);
  return {
    ...contrato,
    empresaNome: empresa ? empresa.nome : "—",
    vagaTitulo: formatarListaCargos(todasVagas.map((v) => v.titulo)) || "—",
    vagaSalario: todasVagas.reduce((soma, v) => soma + (Number(v.salario) || 0), 0),
    // Lista detalhada (vaga principal + adicionais) com salário individual — usada na
    // tela de Contratos para editar/gerenciar quais vagas estão neste contrato.
    vagasDoContrato: todasVagas.map((v) => ({ id: v.id, titulo: v.titulo, salario: v.salario || 0 })),
    consultorNome: consultor ? consultor.nome : "—",
    valorTotalContrato: valorTotal,
    valorParcela1,
    valorParcela2,
    salarioFaltando,
    ehPermuta,
    ehAjusteManual: contrato.valorManualOverride !== null && contrato.valorManualOverride !== undefined,
  };
}

function montarNumero(sequencial, ano) {
  return `${String(sequencial).padStart(4, "0")}/${ano}`;
}

/** Soma dias a uma data no formato "AAAA-MM-DD", devolvendo também nesse formato. */
function somarDias(dataStr, dias) {
  const d = new Date(dataStr + "T00:00:00");
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Monta o payload completo (cliente, testemunhas, termos) que alimenta o texto e o PDF do contrato. */
function montarDadosContrato(contrato) {
  const empresa = db.findById("empresas", contrato.empresaId) || {};
  const vaga = db.findById("vagas", contrato.vagaId) || {};
  const vagasAdicionais = (contrato.vagasAdicionaisIds || []).map((id) => db.findById("vagas", id)).filter(Boolean);
  // Mesmo valor que aparece na tela de Contratos e no Financeiro (já respeita o valor
  // final digitado à mão, se a usuária tiver preenchido, e já soma o salário de
  // eventuais vagas adicionais do mesmo cliente) — usado pra deixar o valor em R$
  // explícito na cláusula de honorários, não só o percentual.
  const { valorTotal, salarioFaltando } = calcularValorContrato(contrato, vaga, vagasAdicionais);
  return {
    numero: contrato.numero,
    valorTotal,
    salarioFaltando,
    dataContrato: contrato.dataContrato,
    cliente: {
      nome: empresa.nome || "",
      cnpj: empresa.cnpj || "",
      endereco: empresa.endereco || "",
      representanteNome: empresa.representanteLegalNome || "",
      representanteCpf: empresa.representanteLegalCpf || "",
    },
    cargoObjeto: contrato.cargoObjeto || vaga.titulo || "",
    tipoCobranca: contrato.tipoCobranca || "Percentual",
    percentualHonorarios: contrato.percentualHonorarios,
    comissaoEstimada: contrato.comissaoEstimada || 0,
    valorTotalPersonalizado: contrato.valorTotalPersonalizado,
    clausulaHonorariosTexto: contrato.clausulaHonorariosTexto || "",
    valorFixo: contrato.valorFixo || 0,
    valorPermuta: contrato.valorPermuta || 0,
    descricaoPermuta: contrato.descricaoPermuta || "",
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

/** Extrai e normaliza os campos comerciais/administrativos do contrato, usados tanto na criação quanto na edição. */
function extrairCamposEditaveis(body) {
  const {
    cargoObjeto,
    tipoCobranca,
    percentualHonorarios,
    comissaoEstimada,
    valorTotalPersonalizado,
    clausulaHonorariosTexto,
    valorFixo,
    valorPermuta,
    descricaoPermuta,
    parcelaInicialPct,
    parcelaFechamentoPct,
    prazoReposicaoDias,
    vigenciaDias,
    prazoRescisaoAvisoDias,
    dataContrato,
    dataVencimentoParcela1,
    dataVencimentoParcela2,
    testemunha1,
    testemunha2,
  } = body || {};

  // A 2ª parcela vence automaticamente 30 dias após a 1ª — só é recalculada aqui
  // quando o formulário não mandou um valor próprio (ex: usuária editou a mão).
  const venc1 = dataVencimentoParcela1 || "";
  const venc2 = dataVencimentoParcela2 || (venc1 ? somarDias(venc1, DIAS_PARCELA2_APOS_PARCELA1) : "");

  return {
    cargoObjeto: cargoObjeto !== undefined ? cargoObjeto : undefined,
    tipoCobranca: TIPOS_COBRANCA_CONTRATO.includes(tipoCobranca) ? tipoCobranca : "Percentual",
    percentualHonorarios: Number(percentualHonorarios) || CONTRATO_PADRAO.percentualHonorarios,
    // Comissão estimada (R$): só se aplica a vagas da área comercial, cuja remuneração
    // inclui parte variável — soma ao salário na base de cálculo do percentual.
    comissaoEstimada: Number(comissaoEstimada) || 0,
    // Valor final digitado à mão (opcional): sobrepõe o cálculo automático (percentual,
    // fixo ou permuta) tanto nas parcelas quanto no texto do contrato, se a cláusula não
    // tiver sido reescrita à mão também. Null = segue o cálculo automático normalmente.
    valorTotalPersonalizado:
      valorTotalPersonalizado !== undefined && valorTotalPersonalizado !== null && valorTotalPersonalizado !== ""
        ? Number(valorTotalPersonalizado)
        : null,
    // Redação da Cláusula 5, item I (honorários), editável à mão pela usuária para
    // qualquer caso de negociação especial. Vazio = o sistema gera o texto padrão.
    clausulaHonorariosTexto: (clausulaHonorariosTexto || "").trim(),
    valorFixo: Number(valorFixo) || 0,
    valorPermuta: Number(valorPermuta) || 0,
    descricaoPermuta: descricaoPermuta || "",
    parcelaInicialPct: Number(parcelaInicialPct) || CONTRATO_PADRAO.parcelaInicialPct,
    parcelaFechamentoPct: Number(parcelaFechamentoPct) || CONTRATO_PADRAO.parcelaFechamentoPct,
    prazoReposicaoDias: Number(prazoReposicaoDias) || CONTRATO_PADRAO.prazoReposicaoDias,
    vigenciaDias: Number(vigenciaDias) || CONTRATO_PADRAO.vigenciaDias,
    prazoRescisaoAvisoDias: Number(prazoRescisaoAvisoDias) || CONTRATO_PADRAO.prazoRescisaoAvisoDias,
    dataContrato: dataContrato || new Date().toISOString().slice(0, 10),
    dataVencimentoParcela1: venc1,
    dataVencimentoParcela2: venc2,
    testemunha1Nome: (testemunha1 && testemunha1.nome) || "",
    testemunha1Cpf: (testemunha1 && testemunha1.cpf) || "",
    testemunha2Nome: (testemunha2 && testemunha2.nome) || "",
    testemunha2Cpf: (testemunha2 && testemunha2.cpf) || "",
  };
}

// Valida a lista de "vagas adicionais" (mesmo cliente, mesmo contrato): cada uma
// precisa existir, ser da MESMA empresa da vaga principal, e não estar vinculada a
// nenhum outro contrato (nem como principal, nem como adicional) — nunca à mesma vaga
// deste próprio contrato sendo editado. Devolve { erro } ou { vagas } (já resolvidas).
function validarVagasAdicionais(idsBrutos, vagaPrincipalId, empresaId, contratoIdIgnorar) {
  const idsUnicos = [...new Set(Array.isArray(idsBrutos) ? idsBrutos : [])].filter((id) => id && id !== vagaPrincipalId);
  const vagas = [];
  const todosContratos = db.readCollection("contratos");
  for (const id of idsUnicos) {
    const vagaAdicional = db.findById("vagas", id);
    if (!vagaAdicional) return { erro: "Uma das vagas adicionais selecionadas é inválida." };
    if (vagaAdicional.empresaId !== empresaId) {
      return { erro: `A vaga "${vagaAdicional.titulo}" não é da mesma empresa da vaga principal — só é possível agrupar vagas do mesmo cliente num contrato.` };
    }
    const jaVinculada = todosContratos.some(
      (ct) => ct.id !== contratoIdIgnorar && (ct.vagaId === id || (ct.vagasAdicionaisIds || []).includes(id))
    );
    if (jaVinculada) {
      return { erro: `A vaga "${vagaAdicional.titulo}" já está vinculada a outro contrato.` };
    }
    vagas.push(vagaAdicional);
  }
  return { vagas };
}

router.post("/", requireAuth, (req, res) => {
  const { vagaId, vagasAdicionaisIds } = req.body || {};

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
  const jaComoAdicionalEmOutro = db.readCollection("contratos").some((ct) => (ct.vagasAdicionaisIds || []).includes(vagaId));
  if (jaComoAdicionalEmOutro) {
    return res.status(400).json({ erro: "Esta vaga já está vinculada como vaga adicional de outro contrato." });
  }

  const { erro: erroAdicionais, vagas: vagasAdicionais } = validarVagasAdicionais(vagasAdicionaisIds, vagaId, vaga.empresaId, null);
  if (erroAdicionais) return res.status(400).json({ erro: erroAdicionais });

  const paramContratos = getParamContratos();
  const campos = extrairCamposEditaveis(req.body);
  const ano = new Date(campos.dataContrato).getFullYear() || new Date().getFullYear();
  const numero = montarNumero(paramContratos.proximoNumero, ano);
  const cargoObjetoPadrao = formatarListaCargos([vaga, ...vagasAdicionais].map((v) => v.titulo));

  const contrato = db.insert("contratos", {
    numero,
    vagaId,
    vagasAdicionaisIds: vagasAdicionais.map((v) => v.id),
    empresaId: vaga.empresaId,
    consultorId: vaga.consultorId || null,
    ...campos,
    cargoObjeto: campos.cargoObjeto || cargoObjetoPadrao,
    status: "Gerado",
    geradoPorId: req.consultor.id,
    lembreteParcela2Enviado: false,
  });

  db.update("parametros", paramContratos.id, { proximoNumero: paramContratos.proximoNumero + 1 });

  res.status(201).json(comDetalhes(contrato));
});

// Editar os dados comerciais/administrativos de um contrato já existente (não muda a
// vaga principal/empresa/número — mas as vagas adicionais do mesmo cliente podem ser
// ajustadas aqui, ex: o cliente abre uma segunda vaga junto poucos dias depois).
router.patch("/:id", requireAuth, requireGestor, (req, res) => {
  const contrato = db.findById("contratos", req.params.id);
  if (!contrato) return res.status(404).json({ erro: "Contrato não encontrado." });

  let vagasAdicionaisIds = contrato.vagasAdicionaisIds || [];
  let vagasAdicionaisMudou = false;
  if (req.body && req.body.vagasAdicionaisIds !== undefined) {
    const { erro: erroAdicionais, vagas: vagasAdicionaisValidadas } = validarVagasAdicionais(
      req.body.vagasAdicionaisIds,
      contrato.vagaId,
      contrato.empresaId,
      contrato.id
    );
    if (erroAdicionais) return res.status(400).json({ erro: erroAdicionais });
    vagasAdicionaisIds = vagasAdicionaisValidadas.map((v) => v.id);
    vagasAdicionaisMudou = true;
  }

  const campos = extrairCamposEditaveis(req.body);
  if (!campos.cargoObjeto) {
    // Sem redação própria informada: se a lista de vagas mudou, o "objeto" do contrato
    // (cargos cobertos) é recalculado a partir das vagas atuais; senão, mantém como estava.
    if (vagasAdicionaisMudou) {
      const vagaPrincipal = db.findById("vagas", contrato.vagaId);
      const vagasAdicionaisResolvidas = vagasAdicionaisIds.map((id) => db.findById("vagas", id)).filter(Boolean);
      const todasVagas = [vagaPrincipal, ...vagasAdicionaisResolvidas].filter(Boolean);
      campos.cargoObjeto = formatarListaCargos(todasVagas.map((v) => v.titulo)) || contrato.cargoObjeto;
    } else {
      campos.cargoObjeto = contrato.cargoObjeto;
    }
  }

  // Se a data de vencimento da 2ª parcela mudou (ex: usuária corrigiu a mão), o lembrete
  // de cobrança volta a poder disparar de novo para a nova data.
  const lembreteParcela2Enviado =
    campos.dataVencimentoParcela2 !== contrato.dataVencimentoParcela2 ? false : contrato.lembreteParcela2Enviado;

  const atualizado = db.update("contratos", contrato.id, { ...campos, vagasAdicionaisIds, status: contrato.status, lembreteParcela2Enviado });
  res.json(comDetalhes(atualizado));
});

// Ajuste manual do valor total só para fins financeiros — usado quando o cálculo
// automático (percentual x salário, valor fixo ou permuta) não reflete a realidade,
// por exemplo um contrato antigo lançado fora do padrão. Não altera nenhum outro
// campo do contrato nem o texto gerado em PDF/Word, só os números do Financeiro.
router.patch("/:id/ajuste-financeiro", requireAuth, requireGestor, (req, res) => {
  const contrato = db.findById("contratos", req.params.id);
  if (!contrato) return res.status(404).json({ erro: "Contrato não encontrado." });

  const { valorManualOverride } = req.body || {};
  let valor = null;
  if (valorManualOverride !== null && valorManualOverride !== undefined && valorManualOverride !== "") {
    valor = Number(valorManualOverride);
    if (Number.isNaN(valor) || valor < 0) {
      return res.status(400).json({ erro: "Informe um valor numérico válido (ou deixe em branco para voltar ao cálculo automático)." });
    }
  }

  const atualizado = db.update("contratos", contrato.id, { valorManualOverride: valor });
  res.json(comDetalhes(atualizado));
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

router.get("/:id/docx", requireAuth, async (req, res) => {
  const contrato = db.findById("contratos", req.params.id);
  if (!contrato) return res.status(404).json({ erro: "Contrato não encontrado." });
  try {
    const buffer = await gerarContratoDocxBuffer(montarDadosContrato(contrato));
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="Contrato-${contrato.numero.replace("/", "-")}.docx"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ erro: "Falha ao gerar o Word do contrato.", detalhe: err.message });
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
