// Gera o mesmo contrato (montado em contratoTexto.js) em formato Word (.docx) editável,
// usando a biblioteca "docx" (gera o arquivo puro em JS, sem precisar do Word instalado).
// Reaproveita a mesma estrutura de blocos usada no PDF, então qualquer alteração de texto
// feita em contratoTexto.js aparece automaticamente nos dois formatos.

const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  HeadingLevel,
  BorderStyle,
} = require("docx");
const { montarContrato } = require("./contratoTexto");
const { EVOE_DADOS } = require("./constants");

const COR_TEXTO = "122454";
const COR_ROXO = "7C5CFA";
const COR_CINZA = "5A6472";

function paragrafoTexto(texto, opcoes = {}) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 160 },
    children: [new TextRun({ text: texto, size: 20, ...opcoes })],
  });
}

function gerarContratoDocxBuffer(dadosContrato) {
  const contrato = montarContrato(dadosContrato);
  const children = [];

  children.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 20 },
      children: [new TextRun({ text: "EVOÉ GESTÃO E RH LTDA", bold: true, size: 20, color: COR_TEXTO })],
    }),
    new Paragraph({
      spacing: { after: 20 },
      children: [new TextRun({ text: "Consultoria em Gestão de Pessoas", size: 17, color: COR_CINZA })],
    }),
    new Paragraph({
      spacing: { after: 20 },
      children: [new TextRun({ text: EVOE_DADOS.endereco, size: 17, color: COR_CINZA })],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: `${EVOE_DADOS.telefone} — ${EVOE_DADOS.email}`, size: 17, color: COR_CINZA })],
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 80 },
      children: [new TextRun({ text: contrato.titulo, bold: true, size: 26, color: COR_TEXTO })],
    }),
    new Paragraph({
      spacing: { after: 200 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "2DD4C7" } },
      children: [new TextRun({ text: `Contrato nº ${contrato.numero}`, bold: true, size: 20, color: COR_CINZA })],
    })
  );

  contrato.blocos.forEach((bloco) => {
    switch (bloco.tipo) {
      case "texto":
        bloco.texto.split("\n").forEach((linha) => children.push(paragrafoTexto(linha)));
        break;

      case "secao":
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 200, after: 200 },
            children: [new TextRun({ text: bloco.texto, bold: true, size: 21, color: COR_ROXO })],
          })
        );
        break;

      case "clausula": {
        children.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { before: 160, after: 100 },
            children: [
              new TextRun({ text: bloco.titulo, bold: true, size: 21, color: COR_TEXTO }),
              ...(bloco.texto ? [new TextRun({ text: "  " + bloco.texto, size: 20 })] : []),
            ],
          })
        );
        (bloco.itens || []).forEach((item) => {
          children.push(
            new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              indent: { left: 360 },
              spacing: { after: 100 },
              children: [
                new TextRun({ text: item.letra + "  ", bold: true, size: 20, color: COR_TEXTO }),
                new TextRun({ text: item.texto, size: 20 }),
              ],
            })
          );
        });
        (bloco.paragrafos || []).forEach((p) => {
          children.push(
            new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              indent: { left: 200 },
              spacing: { after: 100 },
              children: [
                new TextRun({ text: p.simbolo + "  ", bold: true, size: 20, color: COR_TEXTO }),
                new TextRun({ text: p.texto, size: 20 }),
              ],
            })
          );
        });
        break;
      }

      case "data":
        children.push(
          new Paragraph({
            spacing: { before: 100, after: 300 },
            children: [new TextRun({ text: bloco.texto, size: 20 })],
          })
        );
        break;

      case "assinaturas": {
        const linhaAssinatura = () =>
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 300, after: 20 },
            border: { top: { style: BorderStyle.SINGLE, size: 4, color: "999999" } },
            children: [new TextRun({ text: " ", size: 4 })],
          });

        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 300 },
            children: [new TextRun({ text: bloco.contratada.nome, bold: true, size: 20, color: COR_TEXTO })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: bloco.contratada.cnpj, size: 19, color: COR_CINZA })],
          }),
          linhaAssinatura(),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 300 },
            children: [new TextRun({ text: bloco.contratante.nome, bold: true, size: 20, color: COR_TEXTO })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: bloco.contratante.cnpj, size: 19, color: COR_CINZA })],
          })
        );
        if (bloco.contratante.representante) {
          children.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: bloco.contratante.representante, size: 19, color: COR_CINZA })],
            })
          );
        }
        children.push(linhaAssinatura());

        [bloco.testemunha1, bloco.testemunha2].forEach((t, i) => {
          children.push(
            new Paragraph({
              spacing: { before: 300, after: 40 },
              children: [new TextRun({ text: `TESTEMUNHA ${i + 1}`, bold: true, size: 19, color: COR_TEXTO })],
            }),
            new Paragraph({
              spacing: { after: 20 },
              children: [new TextRun({ text: `Nome: ${t.nome || "_______________________________"}`, size: 19 })],
            }),
            new Paragraph({
              spacing: { after: 20 },
              children: [new TextRun({ text: `CPF nº ${t.cpf || "____________________"}`, size: 19 })],
            }),
            new Paragraph({
              spacing: { after: 20 },
              children: [new TextRun({ text: "Assinatura: ___________________________", size: 19 })],
            })
          );
        });
        break;
      }

      default:
        break;
    }
  });

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });

  return Packer.toBuffer(doc);
}

module.exports = { gerarContratoDocxBuffer };
