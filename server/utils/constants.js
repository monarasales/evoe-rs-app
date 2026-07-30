// Constantes compartilhadas do funil de Recrutamento e Seleção da Evoé Gestão e RH

const ETAPAS_VAGA = [
  "1. Backlog",
  "2. Alinhamento de Perfil",
  "3. Recrutamento (Divulgação)",
  "4. Triagem",
  "5. Convocação para Seleção",
  "6. Entrevista",
  "7. Checagem de Referência",
  "8. Parecer Comportamental",
  "9. Agendamento Cliente",
  "10. Aguardando Retorno Cliente",
  "11. Aprovado",
  "12. Cancelada/Encerrada",
];

const ETAPAS_ENCERRADAS = ["11. Aprovado", "12. Cancelada/Encerrada"];

const ETAPAS_CANDIDATO = [
  "Inscrito",
  "Sem Interesse",
  "Não Respondeu",
  "Triagem OK",
  "Convocado",
  "Entrevistado",
  "Aprovado na Entrevista",
  "Reprovado na Entrevista",
  "Referência OK",
  "Referência com Ressalva",
  "Parecer Comportamental OK",
  "Entrevista Final Agendada (Cliente)",
  "Aguardando Retorno Cliente",
  "Aprovado pelo Cliente",
  "Reprovado pelo Cliente",
  "Desistiu",
];

// Banco de Talentos: candidatos contatados que não demonstraram interesse na vaga
// ou não deram retorno — ficam numa aba separada dos candidatos ativos/engajados,
// mas continuam cadastrados para eventual reaproveitamento em vagas futuras.
const ETAPAS_SEM_RETORNO = ["Sem Interesse", "Não Respondeu"];

const PRIORIDADES = ["Alta", "Média", "Baixa"];

// Vaga de Reposição: quando o cliente pede a substituição de um profissional já
// colocado (desistência do candidato ou desligamento pelo cliente), dentro do
// prazo de garantia combinado no contrato (prazoReposicaoDias). Ajuda a não
// cobrar de novo por engano uma vaga que já foi paga na colocação original.
const TIPOS_VAGA = ["Nova", "Reposição"];
const MOTIVOS_REPOSICAO = ["Desistência do Candidato", "Cliente Demitiu", "Outro"];

// CRM — Prospects: quem entra em contato querendo cotar serviço, ainda sem ser cliente.
const SERVICOS_PROSPECT = [
  "Seleção e Recrutamento",
  "Implantação de RH",
  "Implantação de Cultura",
  "Pesquisa de Clima",
  "Outro",
];
const ETAPAS_PROSPECT = ["Novo", "Em Contato", "Proposta Enviada", "Fechado", "Perdido"];

// Supervisora: mesmo nível de acesso do Gestor para o Funil de Vagas (criar, editar,
// mover, atribuir a qualquer consultor, colocar em Stand By, excluir) e para o Dashboard
// (visão geral de todos os consultores) — mas sem acesso a Contratos nem a Configurações
// (equipe/login de consultores, empresas, parâmetros do sistema), que seguem só do Gestor.
const PERFIS_ACESSO = ["Gestor", "Supervisora", "Recrutador"];

// Funcionários (RH interno da Evoé): tipo de vínculo determina se o valor cadastrado
// é "Salário" ou "Bolsa Estágio" no formulário, e ajuda a diferenciar quem tem CLT/PJ
// de quem está em estágio.
const TIPOS_VINCULO = ["CLT", "PJ", "Estágio", "Outro"];

// Comissão por fechamento de vaga: valor fixo pago ao consultor responsável quando a
// vaga fecha (11. Aprovado) dentro do SLA ideal (SLA_DIAS_IDEAL dias, ver abaixo).
// Vagas de Reposição nunca geram comissão, pois não são uma nova colocação vendida.
const VALOR_COMISSAO_FECHAMENTO = 30;

const DIAS_ALERTA_PRAZO = 3; // dias antes do prazo para disparar "Prazo Próximo do Vencimento"

// Contratos: a 2ª parcela dos honorários vence automaticamente N dias após a 1ª,
// e o Gestor recebe um lembrete de cobrança quando essa data está próxima/chegou.
const DIAS_PARCELA2_APOS_PARCELA1 = 30;
const DIAS_ALERTA_PARCELA_CONTRATO = 3;

// SLA de tempo de fechamento de vaga: até SLA_DIAS_IDEAL dias = melhor faixa (peso 2),
// até SLA_DIAS_LIMITE dias = ainda dentro do combinado (peso 1), acima disso = fora do SLA (peso 0).
const SLA_DIAS_IDEAL = 10;
const SLA_DIAS_LIMITE = 15;

// Quantos dias antes de estourar o SLA de fechamento (SLA_DIAS_LIMITE) o consultor
// já recebe um aviso de atenção (ex: com 3, o aviso sai no dia 12 de uma vaga aberta).
const DIAS_ALERTA_SLA_PROXIMO = 3;

// Meta mensal de vagas fechadas por consultor (usada no dashboard de indicadores).
const META_VAGAS_FECHADAS_MES = 6;

// Dados fixos da Evoé (CONTRATADA) usados no gerador de contratos —
// vindos do modelo padrão de Contrato de Prestação de Serviços de R&S enviado pela usuária.
const EVOE_DADOS = {
  razaoSocial: "EVOÉ GESTÃO E RH LTDA",
  nomeFantasia: "EVOÉ GESTÃO E RH",
  cnpj: "39.956.106/0001-07",
  endereco: "Rua Walter de Castro, nº 425, Cidade dos Funcionários, Fortaleza/CE, CEP 60.822-070",
  telefone: "(85) 99855-2247",
  email: "administrativo@evoegestaorh.com.br",
  foro: "Fortaleza/CE",
};

// Tipo de cobrança dos honorários do contrato: "Percentual" (calculado automaticamente
// sobre o salário cadastrado na vaga), "ValorFixo" (negociado direto com o cliente) ou
// "Permuta" (pago em troca de produto/serviço em vez de dinheiro — não entra nos
// totais de caixa do Financeiro, só no valor contratado total).
const TIPOS_COBRANCA_CONTRATO = ["Percentual", "ValorFixo", "Permuta"];

// Valores padrão das cláusulas variáveis do contrato (todos editáveis por contrato
// na tela de Contratos, conforme pedido da usuária — servem só de ponto de partida).
const CONTRATO_PADRAO = {
  tipoCobranca: "Percentual",
  percentualHonorarios: 90,
  valorFixo: 0,
  valorPermuta: 0,
  descricaoPermuta: "",
  parcelaInicialPct: 50,
  parcelaFechamentoPct: 50,
  prazoReposicaoDias: 60,
  vigenciaDias: 90,
  prazoRescisaoAvisoDias: 30,
  // Ajuste manual do valor total, feito pela tela de Financeiro (não pelo formulário de
  // edição do contrato) — null significa "usar o cálculo automático normalmente".
  valorManualOverride: null,
};

module.exports = {
  ETAPAS_VAGA,
  ETAPAS_ENCERRADAS,
  ETAPAS_CANDIDATO,
  ETAPAS_SEM_RETORNO,
  PRIORIDADES,
  TIPOS_VAGA,
  MOTIVOS_REPOSICAO,
  PERFIS_ACESSO,
  TIPOS_VINCULO,
  VALOR_COMISSAO_FECHAMENTO,
  TIPOS_COBRANCA_CONTRATO,
  SERVICOS_PROSPECT,
  ETAPAS_PROSPECT,
  DIAS_ALERTA_PRAZO,
  SLA_DIAS_IDEAL,
  SLA_DIAS_LIMITE,
  DIAS_ALERTA_SLA_PROXIMO,
  DIAS_PARCELA2_APOS_PARCELA1,
  DIAS_ALERTA_PARCELA_CONTRATO,
  META_VAGAS_FECHADAS_MES,
  EVOE_DADOS,
  CONTRATO_PADRAO,
};
