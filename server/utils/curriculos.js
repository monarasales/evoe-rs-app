// Armazenamento de currículos — usado pelo cadastro interno de candidatos e pela
// inscrição pública pelo link da vaga (mesma regra nos dois caminhos).
// Os arquivos ficam no disco de dados (no Render, o disco persistente /data), numa
// pasta por candidato, e NUNCA são apagados: ao substituir, o anterior vai para
// `curriculosAnteriores`.

const fs = require("fs");
const path = require("path");
const db = require("../db");

const PASTA_CURRICULOS = path.join(db.DATA_DIR, "curriculos");
const TAMANHO_MAX = 8 * 1024 * 1024; // 8 MB
const TIPOS_CURRICULO = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".rtf": "application/rtf",
  ".txt": "text/plain",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

/** Valida e grava o arquivo; devolve os campos para atualizar o candidato. Lança Error com mensagem amigável. */
function salvarCurriculo(candidato, nomeArquivo, conteudoBase64, enviadoPor) {
  const ext = path.extname(String(nomeArquivo || "")).toLowerCase();
  if (!TIPOS_CURRICULO[ext]) throw new Error("Formato não aceito. Envie PDF, Word (DOC/DOCX), ODT, RTF, TXT ou imagem (JPG/PNG).");
  const buffer = Buffer.from(String(conteudoBase64 || ""), "base64");
  if (!buffer.length) throw new Error("Arquivo vazio.");
  if (buffer.length > TAMANHO_MAX) throw new Error("Arquivo maior que 8 MB.");

  const pasta = path.join(PASTA_CURRICULOS, candidato.id);
  fs.mkdirSync(pasta, { recursive: true });
  const seguro = path.basename(String(nomeArquivo)).replace(/[^\w.\- ]+/g, "_").slice(-80);
  const arquivo = `${Date.now()}-${seguro}`;
  fs.writeFileSync(path.join(pasta, arquivo), buffer);

  const novo = {
    arquivo: `${candidato.id}/${arquivo}`,
    nomeOriginal: path.basename(String(nomeArquivo)),
    tipo: TIPOS_CURRICULO[ext],
    tamanho: buffer.length,
    enviadoEm: new Date().toISOString(),
    enviadoPor,
  };
  const anteriores = [...(candidato.curriculosAnteriores || []), ...(candidato.curriculo ? [candidato.curriculo] : [])];
  return { curriculo: novo, curriculosAnteriores: anteriores };
}

/** Caminho absoluto seguro de um currículo (null se inválido ou inexistente). */
function caminhoCurriculo(arquivoRelativo) {
  const raiz = path.resolve(PASTA_CURRICULOS);
  const caminho = path.resolve(raiz, String(arquivoRelativo || ""));
  if (!caminho.startsWith(raiz + path.sep) || !fs.existsSync(caminho)) return null;
  return caminho;
}

module.exports = { salvarCurriculo, caminhoCurriculo, TAMANHO_MAX };
