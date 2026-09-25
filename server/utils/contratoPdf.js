// Renderiza o contrato (montado em contratoTexto.js) em PDF, usando pdfkit.
// Sem dependência de navegador/Chromium — só JS puro, roda em qualquer Mac sem instalar nada além do `npm install`.

const PDFDocument = require("pdfkit");
const { montarContrato } = require("./contratoTexto");
const { EVOE_DADOS } = require("./constants");

const COR_TEAL = "#2dd4c7";
const COR_ROXO = "#7c5cfa";
const COR_TEXTO = "#122454";
const COR_CINZA = "#5a6472";

function gerarContratoPdfBuffer(dadosContrato) {
  const contrato = montarContrato(dadosContrato);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 56, bufferPages: true });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const larguraUtil = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // Faixa colorida no topo, no espírito da identidade visual da Evoé
    doc.rect(0, 0, doc.page.width, 10).fill(COR_TEAL);
    doc.rect(0, 10, doc.page.width, 4).fill(COR_ROXO);
    doc.moveDown(2);

    doc.fillColor(COR_TEXTO).font("Helvetica-Bold").fontSize(10).text("EVOÉ GESTÃO E RH LTDA", { align: "left" });
    doc.font("Helvetica").fontSize(8.5).fillColor(COR_CINZA);
    doc.text("Consultoria em Gestão de Pessoas");
    doc.text(EVOE_DADOS.endereco);
    doc.text(`${EVOE_DADOS.telefone} — ${EVOE_DADOS.email}`);
    doc.moveDown(1);

    doc.fillColor(COR_TEXTO).font("Helvetica-Bold").fontSize(13).text(contrato.titulo, { align: "left" });
    doc.moveDown(0.3);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(COR_CINZA).text(`Contrato nº ${contrato.numero}`);
    doc.moveDown(0.8);
    doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor(COR_TEAL).lineWidth(1).stroke();
    doc.moveDown(1);

    const escreverTitulo = (texto) => {
      doc.font("Helvetica-Bold").fontSize(10.5).fillColor(COR_TEXTO).text(texto, { align: "justify" });
      doc.moveDown(0.15);
    };
    const escreverTexto = (texto, opcoes = {}) => {
      doc.font("Helvetica").fontSize(10).fillColor("#1c1c1c").text(texto, { align: "justify", ...opcoes });
    };

    contrato.blocos.forEach((bloco) => {
      switch (bloco.tipo) {
        case "texto":
          escreverTexto(bloco.texto);
          doc.moveDown(0.7);
          break;

        case "secao":
          doc.moveDown(0.3);
          doc.font("Helvetica-Bold").fontSize(10.5).fillColor(COR_ROXO).text(bloco.texto, { align: "center" });
          doc.moveDown(0.5);
          break;

        case "clausula": {
          // Mantém o título junto do primeiro parágrafo da cláusula, dentro do possível
          doc.font("Helvetica-Bold").fontSize(10.5).fillColor(COR_TEXTO);
          const tituloLinha = bloco.titulo + (bloco.texto ? "  " : "");
          doc.text(tituloLinha, { continued: !!bloco.texto, align: "justify" });
          if (bloco.texto) {
            doc.font("Helvetica").fillColor("#1c1c1c").text(bloco.texto, { align: "justify" });
          }
          doc.moveDown(0.35);

          (bloco.itens || []).forEach((item) => {
            const indent = item.letra.length <= 2 && /^[a-z]\.$/.test(item.letra) ? 26 : 14;
            doc.font("Helvetica-Bold").fontSize(10).fillColor(COR_TEXTO);
            doc.text(item.letra + "  ", doc.page.margins.left + indent, doc.y, { continued: true, width: larguraUtil - indent });
            doc.font("Helvetica").fillColor("#1c1c1c").text(item.texto, { align: "justify" });
            doc.moveDown(0.25);
          });

          (bloco.paragrafos || []).forEach((p) => {
            doc.font("Helvetica-Bold").fontSize(10).fillColor(COR_TEXTO);
            doc.text(p.simbolo + "  ", doc.page.margins.left + 14, doc.y, { continued: true, width: larguraUtil - 14 });
            doc.font("Helvetica").fillColor("#1c1c1c").text(p.texto, { align: "justify" });
            doc.moveDown(0.25);
          });

          doc.moveDown(0.45);
          break;
        }

        case "data":
          doc.moveDown(0.3);
          doc.font("Helvetica").fontSize(10).fillColor("#1c1c1c").text(bloco.texto, { align: "left" });
          doc.moveDown(1.2);
          break;

        case "assinaturas": {
          doc.moveDown(0.5);
          doc.font("Helvetica-Bold").fontSize(10).fillColor(COR_TEXTO).text(bloco.contratada.nome, { align: "center" });
          doc.font("Helvetica").fontSize(9.5).fillColor(COR_CINZA).text(bloco.contratada.cnpj, { align: "center" });
          doc.moveDown(0.6);
          doc.moveTo(doc.page.width / 2 - 110, doc.y).lineTo(doc.page.width / 2 + 110, doc.y).strokeColor("#999").lineWidth(0.7).stroke();
          doc.moveDown(1.4);

          doc.font("Helvetica-Bold").fontSize(10).fillColor(COR_TEXTO).text(bloco.contratante.nome, { align: "center" });
          doc.font("Helvetica").fontSize(9.5).fillColor(COR_CINZA).text(bloco.contratante.cnpj, { align: "center" });
          if (bloco.contratante.representante) {
            doc.text(bloco.contratante.representante, { align: "center" });
          }
          doc.moveDown(0.6);
          doc.moveTo(doc.page.width / 2 - 110, doc.y).lineTo(doc.page.width / 2 + 110, doc.y).strokeColor("#999").lineWidth(0.7).stroke();
          doc.moveDown(1.6);

          const colUnoX = doc.page.margins.left;
          const colDoisX = doc.page.width / 2 + 10;
          const colLargura = doc.page.width / 2 - doc.page.margins.left - 20;
          const yTestemunhas = doc.y;

          const escreverTestemunha = (x, dadosTest) => {
            doc.font("Helvetica-Bold").fontSize(9.5).fillColor(COR_TEXTO).text("TESTEMUNHA", x, yTestemunhas, { width: colLargura });
            doc.font("Helvetica").fontSize(9.5).fillColor("#1c1c1c");
            doc.text(`Nome: ${dadosTest.nome || "_______________________________"}`, x, doc.y + 4, { width: colLargura });
            doc.text(`CPF nº ${dadosTest.cpf || "____________________"}`, x, doc.y + 4, { width: colLargura });
            doc.text("Assinatura: ___________________________", x, doc.y + 10, { width: colLargura });
          };

          escreverTestemunha(colUnoX, bloco.testemunha1);
          escreverTestemunha(colDoisX, bloco.testemunha2);
          break;
        }

        default:
          break;
      }
    });

    // Rodapé com numeração de páginas
    const paginas = doc.bufferedPageRange();
    for (let i = 0; i < paginas.count; i++) {
      doc.switchToPage(i);
      // Escrever dentro da margem inferior faria o pdfkit criar uma página extra
      // automaticamente (ele acha que o texto "estourou" a área útil) — por isso
      // zeramos a margem de baixo só durante a escrita do rodapé.
      const margemInferiorOriginal = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.font("Helvetica").fontSize(8).fillColor(COR_CINZA);
      doc.text(
        `Contrato nº ${contrato.numero} — página ${i + 1} de ${paginas.count}`,
        doc.page.margins.left,
        doc.page.height - 34,
        { width: larguraUtil, align: "center", lineBreak: false }
      );
      doc.page.margins.bottom = margemInferiorOriginal;
    }

    doc.end();
  });
}

module.exports = { gerarContratoPdfBuffer };
