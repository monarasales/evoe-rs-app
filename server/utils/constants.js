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

const PRIORIDADES = ["Alta", "Média", "Baixa"];

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

// Valores padrão das cláusulas variáveis do contrato (todos editáveis por contrato
// na tela de Contratos, conforme pedido da usuária — servem só de ponto de partida).
const CONTRATO_PADRAO = {
  tipoCobranca: "Percentual", // "Percentual" (sobre o salário) ou "ValorFixo" (negociado com o cliente)
  percentualHonorarios: 90,
  valorFixo: 0,
  parcelaInicialPct: 50,
  parcelaFechamentoPct: 50,
  prazoReposicaoDias: 60,
  vigenciaDias: 90,
  prazoRescisaoAvisoDias: 30,
};

module.exports = {
  ETAPAS_VAGA,
  ETAPAS_ENCERRADAS,
  ETAPAS_CANDIDATO,
  PRIORIDADES,
  PERFIS_ACESSO,
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
