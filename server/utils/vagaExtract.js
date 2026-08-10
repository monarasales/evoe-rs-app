// Leitura automática de arquivos de vaga: o cliente manda um PDF/Word/texto
// descrevendo a vaga, o sistema extrai o texto do arquivo e usa a API da Anthropic
// (Claude) para identificar título, perfil, salário, prazo e prioridade — a usuária
// só confere e ajusta no formulário antes de salvar (nunca cria a vaga sozinho).
//
// Requer a variável de ambiente ANTHROPIC_API_KEY configurada (chave de uma conta
// na Anthropic, console.anthropic.com — tem um custo pequeno por uso). Sem ela, a
// extração falha com uma mensagem clara em vez de travar o resto do sistema.
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
// Modelo rápido/econômico, suficiente para extrair campos estruturados de um texto
// curto. Pode ser trocado sem alterar código via a variável ANTHROPIC_MODEL, caso a
// Anthropic troque os nomes de modelo disponíveis no futuro.
const MODELO_PADRAO = "claude-haiku-4-5-20251001";

const PRIORIDADES_VALIDAS = ["Alta", "Média", "Baixa"];

async function extrairTextoDoArquivo(buffer, nomeOriginal, mimetype) {
  const ext = (nomeOriginal.split(".").pop() || "").toLowerCase();

  if (ext === "pdf" || mimetype === "application/pdf") {
    try {
      const resultado = await pdfParse(buffer);
      return resultado.text || "";
    } catch (err) {
      throw new Error(
        "Não conseguimos abrir esse PDF (pode estar corrompido ou num formato incomum). Tente reenviar em Word (.docx) ou texto (.txt)."
      );
    }
  }
  if (
    ext === "docx" ||
    mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const resultado = await mammoth.extractRawText({ buffer });
    return resultado.value || "";
  }
  if (ext === "txt" || mimetype === "text/plain") {
    return buffer.toString("utf-8");
  }
  if (ext === "doc") {
    throw new Error('Arquivos ".doc" (Word antigo) não são suportados — peça para reenviarem em .docx ou PDF.');
  }
  throw new Error("Formato de arquivo não suportado. Envie em PDF, Word (.docx) ou texto (.txt).");
}

function montarPrompt(texto) {
  return `Você vai receber o texto de um documento enviado por um cliente descrevendo uma vaga de emprego que ele quer que uma consultoria de Recrutamento e Seleção preencha no sistema dela. Extraia as informações e responda APENAS com um JSON válido (sem markdown, sem texto antes ou depois, sem crases), exatamente neste formato:

{
  "titulo": "string ou null — o cargo/título da vaga",
  "perfilVaga": "string ou null — descrição do perfil, requisitos, responsabilidades e cultura da empresa mencionados no texto, reescrita de forma organizada em português (pode ser um parágrafo curto ou tópicos separados por quebra de linha)",
  "salario": número ou null — o salário/remuneração mencionado, apenas o número em reais (sem \"R$\", sem separador de milhar; use ponto para decimais),
  "prazoSugeridoDias": número ou null — se o texto mencionar um prazo desejado para o fechamento da vaga (ex: \"em até 30 dias\", \"urgente\"), estime em dias corridos a partir de hoje (\"urgente\" ~ 10 dias); sem nenhuma menção de prazo, use null,
  "prioridade": "Alta", "Média", "Baixa" ou null — baseado no tom de urgência do texto,
  "nomeEmpresaDetectado": "string ou null — nome da empresa/cliente, se mencionado no texto"
}

Se alguma informação não estiver no texto, use null nesse campo — nunca invente dado que não está no texto.

Texto do documento:
"""
${texto.slice(0, 12000)}
"""`;
}

async function chamarClaude(texto) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const erro = new Error(
      "A leitura automática de arquivos com IA ainda não está configurada neste sistema (falta a chave ANTHROPIC_API_KEY). Preencha manualmente por enquanto, ou peça para configurarem a chave."
    );
    erro.semChaveConfigurada = true;
    throw erro;
  }

  let resposta;
  try {
    resposta = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || MODELO_PADRAO,
        max_tokens: 1024,
        messages: [{ role: "user", content: montarPrompt(texto) }],
      }),
    });
  } catch (err) {
    throw new Error("Não foi possível conectar ao serviço de IA agora. Tente novamente em instantes ou preencha manualmente.");
  }

  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => "");
    throw new Error(`Falha ao consultar a IA (HTTP ${resposta.status}). ${detalhe.slice(0, 300)}`);
  }

  const dados = await resposta.json();
  const conteudo = (dados.content && dados.content[0] && dados.content[0].text) || "";
  const jsonMatch = conteudo.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("A IA não devolveu um resultado no formato esperado. Tente novamente ou preencha manualmente.");
  }

  let extraido;
  try {
    extraido = JSON.parse(jsonMatch[0]);
  } catch (err) {
    throw new Error("Não conseguimos interpretar a resposta da IA. Tente novamente ou preencha manualmente.");
  }

  return {
    titulo: typeof extraido.titulo === "string" ? extraido.titulo.trim() : null,
    perfilVaga: typeof extraido.perfilVaga === "string" ? extraido.perfilVaga.trim() : null,
    salario: typeof extraido.salario === "number" && isFinite(extraido.salario) ? extraido.salario : null,
    prazoSugeridoDias:
      typeof extraido.prazoSugeridoDias === "number" && isFinite(extraido.prazoSugeridoDias)
        ? Math.max(1, Math.round(extraido.prazoSugeridoDias))
        : null,
    prioridade: PRIORIDADES_VALIDAS.includes(extraido.prioridade) ? extraido.prioridade : null,
    nomeEmpresaDetectado: typeof extraido.nomeEmpresaDetectado === "string" ? extraido.nomeEmpresaDetectado.trim() : null,
  };
}

// Extrai texto do arquivo e devolve os campos de vaga já estruturados (via IA),
// prontos para pré-preencher o formulário — a pessoa confere e ajusta antes de salvar.
async function extrairDadosDaVaga(buffer, nomeOriginal, mimetype) {
  const texto = await extrairTextoDoArquivo(buffer, nomeOriginal, mimetype);
  if (!texto || texto.trim().length < 10) {
    throw new Error(
      "Não conseguimos extrair texto desse arquivo — confira se ele não é uma imagem escaneada sem texto selecionável."
    );
  }
  return chamarClaude(texto);
}

module.exports = { extrairDadosDaVaga };
