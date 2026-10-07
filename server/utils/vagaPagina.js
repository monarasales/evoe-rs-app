// "Página da vaga": conteúdo estruturado que o candidato vê na página pública.
// Fica em vaga.pagina. Tudo aqui é PÚBLICO por definição — dados internos (perfil
// interno da vaga, salário usado no Financeiro, consultor, cliente confidencial)
// ficam fora deste bloco.

const TIPOS_CONTRATACAO = ["CLT", "PJ", "Estágio", "Temporário", "Jovem Aprendiz", "Freelancer"];
const MODELOS_TRABALHO = ["Presencial", "Híbrido", "Remoto"];
const FREQUENCIAS = ["", "Diária", "Semanal", "Quinzenal", "Mensal", "Eventual"];

const texto = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
const lista = (v, max = 40, tam = 400) =>
  (Array.isArray(v) ? v : [])
    .map((x) => texto(x, tam))
    .filter(Boolean)
    .slice(0, max);

/** Normaliza o que veio da tela. Só os campos conhecidos são aceitos. */
function normalizarPagina(b = {}) {
  return {
    missao: texto(b.missao, 3000),
    objetivos: lista(b.objetivos),
    responsabilidades: (Array.isArray(b.responsabilidades) ? b.responsabilidades : [])
      .map((r) => ({
        texto: texto(r && r.texto, 400),
        frequencia: FREQUENCIAS.includes(r && r.frequencia) ? r.frequencia : "",
      }))
      .filter((r) => r.texto)
      .slice(0, 60),
    requisitos: lista(b.requisitos),
    diferenciais: lista(b.diferenciais),
    perfilComportamental: texto(b.perfilComportamental, 3000),
    ferramentas: texto(b.ferramentas, 1000),
    salario: texto(b.salario, 120),
    beneficios: lista(b.beneficios, 30, 120),
    horario: texto(b.horario, 300),
    bairro: texto(b.bairro, 120),
    cidade: texto(b.cidade, 120),
    tipoContratacao: TIPOS_CONTRATACAO.includes(b.tipoContratacao) ? b.tipoContratacao : "",
    modeloTrabalho: MODELOS_TRABALHO.includes(b.modeloTrabalho) ? b.modeloTrabalho : "",
  };
}

/** Versão pública (mesmos campos; garante que nada fora da lista vaze). */
function paginaPublica(pagina) {
  return pagina ? normalizarPagina(pagina) : null;
}

module.exports = { normalizarPagina, paginaPublica, TIPOS_CONTRATACAO, MODELOS_TRABALHO, FREQUENCIAS };
