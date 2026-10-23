// Proposta comercial de Recrutamento e Seleção: modelo padrão (editável pelo Gestor),
// cálculo dos valores por vaga e geração do PDF (identidade visual do modelo da Evoé:
// capa, papel timbrado com marca d'água e página de parceiros) e do Word editável.
//
// Os textos têm marcadores trocados na hora de gerar: {CLIENTE}, {CONTATO}, {PERCENTUAL},
// {PERCENTUAL_TABELA}, {PAGAMENTO}, {GARANTIA}, {PRAZO}, {VALIDADE}, {DATA}, {SALARIO_MINIMO}.
// Cada proposta guarda a SUA cópia dos textos: mudar o modelo não altera propostas antigas.

const path = require("path");
const PDFDocument = require("pdfkit");

const PASTA_IMG = path.join(__dirname, "..", "assets", "proposta");
const IMG = { capa: path.join(PASTA_IMG, "proposta-capa.jpg"), fundo: path.join(PASTA_IMG, "proposta-fundo.jpg"), parceiros: path.join(PASTA_IMG, "proposta-parceiros.jpg") };

const MARCADORES = [
  ["{CLIENTE}", "nome da empresa cliente"],
  ["{CONTATO}", "primeiro nome do contato"],
  ["{PERCENTUAL}", "taxa da proposta (ex.: 78)"],
  ["{PERCENTUAL_TABELA}", "taxa de tabela (ex.: 90)"],
  ["{PAGAMENTO}", "forma de pagamento"],
  ["{GARANTIA}", "dias de garantia de reposição"],
  ["{PRAZO}", "dias úteis para envio dos candidatos"],
  ["{VALIDADE}", "dias de validade da proposta"],
  ["{DATA}", "data da proposta"],
  ["{SALARIO_MINIMO}", "salário mínimo usado na regra do valor mínimo"],
];

// Textos do modelo "Proposta Recrutamento e Seleção Evoé" (PDF enviado pela diretora).
const SECOES_PADRAO = [
  {
    id: "carta",
    titulo: "",
    novaPagina: true,
    texto:
      "Olá, {CONTATO}!\n\n" +
      "Gostaríamos de expressar nossa profunda gratidão pela confiança em nossa consultoria de RH e nossa equipe de especialistas em gestão de pessoas.\n\n" +
      "Essa proposta de Recrutamento e Seleção irá auxiliar na contratação assertiva e melhoria na performance dos processos internos, fortalecendo a marca empregadora e alcançando o sucesso empresarial. Estamos comprometidos na resolução deste desafio, fornecendo serviços de consultoria personalizados e soluções estratégicas.\n\n" +
      "Nossa equipe experiente e dedicada está ansiosa para colaborar com você na implantação de práticas de RH eficazes, que resultarão em uma força de trabalho mais produtiva, motivada e alinhada com a visão e os objetivos da sua empresa.\n\n" +
      "Estamos à sua disposição para discutir quaisquer dúvidas ou esclarecimentos adicionais que possam surgir durante este processo de implantação.",
  },
  {
    id: "objetivo",
    titulo: "OBJETIVO",
    novaPagina: true,
    texto: "Identificar, atrair e selecionar os candidatos mais adequados para preencher vagas da organização, com perfis qualificados e alinhados com as necessidades e a cultura corporativa.",
  },
  {
    id: "diferenciais",
    titulo: "NOSSOS DIFERENCIAIS",
    texto:
      "A chave de sucesso da Consultoria Evoé Gestão e RH está na capacidade de conduzir projetos personalizados, de acordo com cada particularidade dos nossos parceiros. Nosso diferencial baseia-se em cinco pilares:\n" +
      "• Metodologia de Recrutamento e PDI especializado;\n" +
      "• Aplicação de métodos modernos e reconhecidos, adaptando as metodologias dependendo do cargo em questão;\n" +
      "• Capacidade de atração de talentos;\n" +
      "• Credibilidade pela atuação em grandes projetos e sólidos networks, como importantes veículos de mídia;\n" +
      "• Implantação do modelo Ágil no RH: estruturamos e implantamos o Recursos Humanos da organização, em um processo com resultados gradativos, desenvolvendo os subsistemas de RH de acordo com a necessidade organizacional e conforme o resultado do diagnóstico realizado. Sempre alinhado às diretrizes e estratégias da direção.",
  },
  {
    id: "etapas",
    titulo: "ETAPAS DO PROCESSO",
    novaPagina: true,
    texto:
      "• Recrutamento através de banco de dados e anúncios;\n" +
      "• Triagem de currículos conforme o perfil da vaga informada;\n" +
      "• Seleção contendo entrevista por competência e fit cultural, dinâmicas de grupo e aplicação de testes psicológicos/comportamentais e/ou de conhecimentos específicos;\n" +
      "• Checagem de referências profissionais e jurídicas;\n" +
      "• Elaboração do laudo ou parecer psicológico ou comportamental do candidato;\n" +
      "• Encaminhamento de até três candidatos finalistas aptos;\n" +
      "• Acompanhamento do período de experiência.",
  },
  {
    id: "investimento",
    titulo: "INVESTIMENTO",
    tabelaVagas: true,
    texto:
      "O valor da taxa de sucesso atualmente por vaga individual corresponde a {PERCENTUAL_TABELA}% do salário da posição CLT e PJ. Porém, devido à parceria, iremos fazer {PERCENTUAL}% em cima do salário.\n\n" +
      "O investimento é dividido em dois momentos: {PAGAMENTO}.",
  },
  {
    id: "observacao",
    titulo: "OBSERVAÇÃO",
    texto: "Quando, aplicada a taxa de {PERCENTUAL}% sobre o salário base da vaga, o resultado for inferior ao salário mínimo vigente ({SALARIO_MINIMO}), o valor cobrado pela vaga será o do mínimo legal.",
  },
  {
    id: "reposicao",
    titulo: "REPOSIÇÃO DA VAGA",
    texto: "Oferecemos uma garantia de {GARANTIA} dias para cada vaga preenchida pela empresa, contados a partir da data de fechamento da posição, caso o candidato não venha a desempenhar bem no cargo.",
  },
  {
    id: "beneficios",
    titulo: "BENEFÍCIOS",
    novaPagina: true,
    texto: "Realizamos avaliação dos candidatos no período de experiência: fazemos avaliação mensalmente juntamente com a gestão para desenvolver os pontos de melhoria do candidato.",
  },
  {
    id: "prazo",
    titulo: "PRAZO DE ENTREGA",
    texto:
      "A Evoé Gestão e RH se compromete a encaminhar os candidatos e/ou currículos à empresa contratante dentro de um prazo máximo de {PRAZO} dias úteis a partir da assinatura do contrato e entrada do pagamento. Este prazo pode ser alterado de acordo com o volume da demanda ou com a complexidade da vaga.",
  },
  {
    id: "validade",
    titulo: "VALIDADE DA PROPOSTA",
    texto: "Esta proposta é válida por {VALIDADE} dias a partir de {DATA}.",
  },
];

const MODELO_PADRAO = {
  percentual: 78,
  percentualTabela: 90,
  pagamento: "50% na entrada no serviço e 50% na conclusão da vaga ou 30 dias depois",
  garantiaDias: 90,
  prazoDias: 20,
  validadeDias: 15,
  salarioMinimo: 1518,
  assinaturaNome: "Valdecio Costa",
  assinaturaCargo: "CEO & FOUNDER",
  incluirParceiros: true,
  secoes: SECOES_PADRAO,
};

const brl = (n) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (iso) => (/^\d{4}-\d{2}-\d{2}/.test(String(iso || "")) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
const pct = (n) => String(Number(n) || 0).replace(".", ",");

/** Valor por vaga: salário × taxa, nunca abaixo do salário mínimo. */
function calcularVagas(p) {
  const taxa = (Number(p.percentual) || 0) / 100;
  const minimo = Number(p.salarioMinimo) || 0;
  const linhas = (p.vagas || [])
    .filter((v) => v && (v.cargo || v.salario))
    .map((v) => {
      const salario = Number(v.salario) || 0;
      const qtd = Math.max(1, parseInt(v.quantidade, 10) || 1);
      const calculado = Math.round(salario * taxa * 100) / 100;
      const unitario = Math.max(calculado, minimo);
      return { cargo: v.cargo || "", salario, quantidade: qtd, unitario, aplicouMinimo: calculado < minimo, total: unitario * qtd };
    });
  return { linhas, total: linhas.reduce((s, l) => s + l.total, 0) };
}

function trocarMarcadores(texto, p) {
  const contato = String(p.contatoNome || "").trim().split(/\s+/)[0] || "";
  return String(texto || "")
    .replace(/\{CLIENTE\}/g, p.clienteNome || "")
    .replace(/Olá, \{CONTATO\}!/g, contato ? `Olá, ${contato}!` : "Olá!")
    .replace(/\{CONTATO\}/g, contato)
    .replace(/\{PERCENTUAL_TABELA\}/g, pct(p.percentualTabela))
    .replace(/\{PERCENTUAL\}/g, pct(p.percentual))
    .replace(/\{PAGAMENTO\}/g, p.pagamento || "")
    .replace(/\{GARANTIA\}/g, String(p.garantiaDias || ""))
    .replace(/\{PRAZO\}/g, String(p.prazoDias || ""))
    .replace(/\{VALIDADE\}/g, String(p.validadeDias || ""))
    .replace(/\{DATA\}/g, dataBr(p.data))
    .replace(/\{SALARIO_MINIMO\}/g, brl(p.salarioMinimo));
}

/** Texto em blocos: parágrafos e listas ("• " ou "- " no começo da linha). */
function blocos(texto) {
  const out = [];
  for (const linha of String(texto || "").split("\n")) {
    const l = linha.trim();
    if (!l) out.push({ tipo: "espaco" });
    else if (/^[•\-*]\s+/.test(l)) out.push({ tipo: "item", texto: l.replace(/^[•\-*]\s+/, "") });
    else out.push({ tipo: "par", texto: l });
  }
  return out;
}

// ---------- PDF ----------
const NAVY = "#122454";
const TEXTO = "#1f2937";
const CINZA = "#5a6472";
const TEAL = "#22c3b6";
const A4 = { w: 595.28, h: 841.89 };
const AREA = { topo: 118, base: 152, esq: 64, dir: 64 }; // dentro do papel timbrado

function gerarPdfProposta(p) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margins: { top: AREA.topo, bottom: AREA.base, left: AREA.esq, right: AREA.dir }, autoFirstPage: false, info: { Title: `Proposta ${p.numero || ""} — ${p.clienteNome || ""}`, Author: "Evoé Gestão e RH" } });
    const partes = [];
    doc.on("data", (c) => partes.push(c));
    doc.on("end", () => resolve(Buffer.concat(partes)));
    doc.on("error", reject);
    const largura = A4.w - AREA.esq - AREA.dir;
    let fundo = false;
    doc.on("pageAdded", () => {
      if (fundo) {
        doc.image(IMG.fundo, 0, 0, { width: A4.w, height: A4.h });
        doc.x = AREA.esq;
        doc.y = AREA.topo;
      }
    });

    // Capa (imagem do modelo) + identificação do cliente
    doc.addPage({ size: "A4", margin: 0 });
    doc.image(IMG.capa, 0, 0, { width: A4.w, height: A4.h });
    doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(15).text("PROPOSTA COMERCIAL", 0, 548, { width: A4.w, align: "center", characterSpacing: 1 });
    doc.font("Helvetica").fontSize(11.5).fillColor(CINZA).text("Recrutamento e Seleção", 0, 570, { width: A4.w, align: "center" });
    if (p.clienteNome) doc.font("Helvetica-Bold").fontSize(13).fillColor(NAVY).text(`Para: ${p.clienteNome}`, 0, 600, { width: A4.w, align: "center" });
    doc.font("Helvetica").fontSize(10).fillColor(CINZA).text([p.numero ? `Proposta nº ${p.numero}` : "", dataBr(p.data)].filter(Boolean).join("  ·  "), 0, 622, { width: A4.w, align: "center" });

    fundo = true;
    const { linhas, total } = calcularVagas(p);
    let primeira = true;
    for (const s of (p.secoes || []).filter((x) => x.incluir !== false)) {
      if (primeira || s.novaPagina) doc.addPage();
      else doc.moveDown(1.3);
      if (s.id === "carta") doc.moveDown(2.2); // como no modelo: a carta começa mais abaixo do logo
      primeira = false;
      if (s.titulo) {
        if (doc.y > A4.h - AREA.base - 60) doc.addPage();
        doc.font("Helvetica-Bold").fontSize(12).fillColor(NAVY).text(trocarMarcadores(s.titulo, p).toUpperCase(), { characterSpacing: 0.4 });
        doc.moveTo(AREA.esq, doc.y + 3).lineTo(AREA.esq + 38, doc.y + 3).lineWidth(2).strokeColor(TEAL).stroke();
        doc.moveDown(0.9);
      }
      for (const b of blocos(trocarMarcadores(s.texto, p))) {
        if (b.tipo === "espaco") doc.moveDown(0.6);
        else if (b.tipo === "item") {
          const y = doc.y;
          doc.font("Helvetica").fontSize(10.5).fillColor(TEAL).text("•", AREA.esq + 6, y);
          doc.fillColor(TEXTO).text(b.texto, AREA.esq + 20, y, { width: largura - 20, align: "left", lineGap: 2.5 });
          doc.x = AREA.esq;
          doc.moveDown(0.25);
        } else {
          doc.font("Helvetica").fontSize(10.5).fillColor(TEXTO).text(b.texto, AREA.esq, doc.y, { width: largura, align: "justify", lineGap: 2.5 });
        }
      }
      if (s.tabelaVagas && linhas.length) tabelaVagas(doc, linhas, total, largura, p);
      if (s.id === "carta" && (p.assinaturaNome || p.assinaturaCargo)) {
        doc.moveDown(2.5);
        doc.font("Helvetica").fontSize(10.5).fillColor(TEXTO).text("Atenciosamente,", AREA.esq);
        doc.moveDown(2);
        doc.font("Helvetica").fontSize(11).fillColor(NAVY).text(p.assinaturaNome || "");
        doc.font("Helvetica-Bold").fontSize(8.5).fillColor(CINZA).text(p.assinaturaCargo || "");
      }
    }
    if (p.incluirParceiros !== false) {
      fundo = false;
      doc.addPage({ size: "A4", margin: 0 });
      doc.image(IMG.parceiros, 0, 0, { width: A4.w, height: A4.h });
    }
    doc.end();
  });
}

function tabelaVagas(doc, linhas, total, largura, p) {
  doc.moveDown(0.9);
  const col = [largura * 0.38, largura * 0.18, largura * 0.1, largura * 0.17, largura * 0.17];
  const cab = ["Cargo", "Salário", "Qtd.", "Valor por vaga", "Total"];
  const linha = (vals, opts = {}) => {
    if (doc.y > A4.h - AREA.base - 30) doc.addPage();
    const y = doc.y;
    if (opts.fundo) doc.rect(AREA.esq, y - 3, largura, 18).fill(opts.fundo);
    let x = AREA.esq;
    vals.forEach((v, i) => {
      doc.font(opts.negrito ? "Helvetica-Bold" : "Helvetica").fontSize(9.5).fillColor(opts.cor || TEXTO).text(v, x + 4, y, { width: col[i] - 8, align: i === 0 ? "left" : "right" });
      x += col[i];
    });
    doc.y = Math.max(doc.y, y + 15);
    doc.x = AREA.esq;
  };
  linha(cab, { negrito: true, fundo: NAVY, cor: "#ffffff" });
  linhas.forEach((l, i) => linha([l.cargo, brl(l.salario), String(l.quantidade), `${brl(l.unitario)}${l.aplicouMinimo ? "*" : ""}`, brl(l.total)], { fundo: i % 2 ? "#f3f6fa" : null }));
  linha(["Total do investimento", "", "", "", brl(total)], { negrito: true, fundo: "#e3f8f6", cor: NAVY });
  if (linhas.some((l) => l.aplicouMinimo)) {
    doc.moveDown(0.4);
    doc.font("Helvetica-Oblique").fontSize(8.5).fillColor(CINZA).text(`* Valor ajustado ao salário mínimo vigente (${brl(p.salarioMinimo)}).`, AREA.esq);
  }
}

// ---------- Word (editável) ----------
async function gerarDocxProposta(p) {
  const { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, Table, TableRow, TableCell, WidthType, PageBreak } = require("docx");
  const fs = require("fs");
  const filhos = [];
  filhos.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: "jpg", data: fs.readFileSync(IMG.capa), transformation: { width: 595, height: 842 } })] }));
  filhos.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "PROPOSTA COMERCIAL — RECRUTAMENTO E SELEÇÃO", bold: true, color: "122454", size: 28 })] }));
  if (p.clienteNome) filhos.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `Para: ${p.clienteNome}`, bold: true, color: "122454", size: 24 })] }));
  filhos.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: [p.numero ? `Proposta nº ${p.numero}` : "", dataBr(p.data)].filter(Boolean).join("  ·  "), color: "5A6472", size: 20 })] }));
  const { linhas, total } = calcularVagas(p);
  for (const s of (p.secoes || []).filter((x) => x.incluir !== false)) {
    if (s.novaPagina) filhos.push(new Paragraph({ children: [new PageBreak()] }));
    if (s.titulo) filhos.push(new Paragraph({ spacing: { before: 280, after: 140 }, children: [new TextRun({ text: trocarMarcadores(s.titulo, p).toUpperCase(), bold: true, color: "122454", size: 24 })] }));
    for (const b of blocos(trocarMarcadores(s.texto, p))) {
      if (b.tipo === "espaco") filhos.push(new Paragraph({ children: [] }));
      else filhos.push(new Paragraph({ bullet: b.tipo === "item" ? { level: 0 } : undefined, alignment: b.tipo === "par" ? AlignmentType.JUSTIFIED : undefined, spacing: { after: 80 }, children: [new TextRun({ text: b.texto, size: 21 })] }));
    }
    if (s.tabelaVagas && linhas.length) {
      const cel = (t, negrito) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: t, bold: !!negrito, size: 19 })] })] });
      filhos.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: ["Cargo", "Salário", "Qtd.", "Valor por vaga", "Total"].map((t) => cel(t, true)) }),
            ...linhas.map((l) => new TableRow({ children: [cel(l.cargo), cel(brl(l.salario)), cel(String(l.quantidade)), cel(`${brl(l.unitario)}${l.aplicouMinimo ? "*" : ""}`), cel(brl(l.total))] })),
            new TableRow({ children: [cel("Total do investimento", true), cel(""), cel(""), cel(""), cel(brl(total), true)] }),
          ],
        })
      );
    }
    if (s.id === "carta") {
      filhos.push(new Paragraph({ spacing: { before: 400 }, children: [new TextRun({ text: "Atenciosamente,", size: 21 })] }));
      filhos.push(new Paragraph({ spacing: { before: 400 }, children: [new TextRun({ text: p.assinaturaNome || "", size: 22, color: "122454" })] }));
      filhos.push(new Paragraph({ children: [new TextRun({ text: p.assinaturaCargo || "", bold: true, size: 16, color: "5A6472" })] }));
    }
  }
  if (p.incluirParceiros !== false) {
    filhos.push(new Paragraph({ children: [new PageBreak()] }));
    filhos.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: "jpg", data: fs.readFileSync(IMG.parceiros), transformation: { width: 560, height: 792 } })] }));
  }
  const doc = new Document({ sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } }, children: filhos }] });
  return Packer.toBuffer(doc);
}

module.exports = { MODELO_PADRAO, SECOES_PADRAO, MARCADORES, calcularVagas, trocarMarcadores, blocos, gerarPdfProposta, gerarDocxProposta };
