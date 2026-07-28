// Popula o banco de dados (arquivos JSON em /data) com os mesmos dados de exemplo
// usados na primeira versão (Airtable): 3 consultores, 2 empresas, 3 vagas,
// 3 candidatos, histórico de etapas e notificações iniciais.
// Roda automaticamente na primeira vez que o servidor sobe (ver server/index.js)
// e também pode ser executado manualmente com `npm run seed`.

const bcrypt = require("bcryptjs");
const db = require("./db");

function jaSemeado() {
  return db.readCollection("consultores").length > 0;
}

function seed() {
  if (jaSemeado()) {
    console.log("[seed] Dados já existem — nada a fazer. (apague os arquivos em /data para recomeçar do zero)");
    return;
  }

  console.log("[seed] Criando dados iniciais...");

  const consultores = [
    { id: "cons-mariana", nome: "Mariana Souza", email: "mariana.souza@evoerh.com.br", whatsapp: "(85) 99900-1111", perfil: "Gestor", ativo: true },
    { id: "cons-rafael", nome: "Rafael Lima", email: "rafael.lima@evoerh.com.br", whatsapp: "(85) 99900-2222", perfil: "Recrutador", ativo: true },
    { id: "cons-camila", nome: "Camila Torres", email: "camila.torres@evoerh.com.br", whatsapp: "(85) 99900-3333", perfil: "Recrutador", ativo: true },
  ].map((c) => ({ ...c, createdAt: db.nowIso(), updatedAt: db.nowIso() }));
  db.writeCollection("consultores", consultores);

  const senhaHash = bcrypt.hashSync("evoe123", 10);
  const users = [
    { id: "user-mariana", consultorId: "cons-mariana", username: "mariana", passwordHash: senhaHash },
    { id: "user-rafael", consultorId: "cons-rafael", username: "rafael", passwordHash: senhaHash },
    { id: "user-camila", consultorId: "cons-camila", username: "camila", passwordHash: senhaHash },
  ].map((u) => ({ ...u, createdAt: db.nowIso(), updatedAt: db.nowIso() }));
  db.writeCollection("users", users);

  const empresas = [
    {
      id: "emp-construtora",
      nome: "Construtora Ceará Sul",
      cnpj: "12.345.678/0001-90",
      endereco: "Av. Santos Dumont, 1500, Aldeota, Fortaleza/CE, CEP 60150-160",
      segmento: "Construção Civil",
      contatoResponsavel: "Eduardo Nogueira (RH)",
      emailContato: "eduardo@construtoracearasul.com.br",
      whatsappContato: "(85) 98800-1234",
      representanteLegalNome: "Eduardo Nogueira",
      representanteLegalCpf: "123.456.789-00",
    },
    {
      id: "emp-farmacia",
      nome: "Farmácia Popular Nordeste",
      cnpj: "98.765.432/0001-10",
      endereco: "Rua Barão de Studart, 800, Meireles, Fortaleza/CE, CEP 60120-000",
      segmento: "Varejo Farmacêutico",
      contatoResponsavel: "Patrícia Ramos (RH)",
      emailContato: "patricia@farmaciapopularne.com.br",
      whatsappContato: "(85) 98800-5678",
      representanteLegalNome: "Patrícia Ramos",
      representanteLegalCpf: "987.654.321-00",
    },
  ].map((e) => ({ ...e, createdAt: db.nowIso(), updatedAt: db.nowIso() }));
  db.writeCollection("empresas", empresas);

  const vagas = [
    {
      id: "vaga-1",
      titulo: "Analista Financeiro Pleno",
      perfilVaga: "Formação em Ciências Contábeis/Administração, experiência com conciliação bancária, fluxo de caixa e DRE. Perfil analítico, alinhado à cultura de disciplina e prazos da construtora.",
      empresaId: "emp-construtora",
      consultorId: "cons-rafael",
      dataAbertura: "2026-07-10",
      prazoFechamento: "2026-08-10",
      prioridade: "Alta",
      salario: 4500,
      etapaAtual: "4. Triagem",
      dataEntradaEtapa: "2026-07-15",
      dataFechamento: null,
      observacoes: "",
      alertaPrazoEnviado: false,
      alertaAtrasoEnviado: false,
    },
    {
      id: "vaga-2",
      titulo: "Farmacêutico Responsável Técnico",
      perfilVaga: "CRF ativo, experiência em farmácia de varejo, disponibilidade para responsabilidade técnica. Cultura orientada a atendimento humanizado.",
      empresaId: "emp-farmacia",
      consultorId: "cons-camila",
      dataAbertura: "2026-07-01",
      prazoFechamento: "2026-07-25",
      prioridade: "Alta",
      salario: 6000,
      etapaAtual: "9. Agendamento Cliente",
      dataEntradaEtapa: "2026-07-18",
      dataFechamento: null,
      observacoes: "",
      alertaPrazoEnviado: false,
      alertaAtrasoEnviado: false,
    },
    {
      id: "vaga-3",
      titulo: "Auxiliar Administrativo",
      perfilVaga: "Ensino médio completo, pacote Office intermediário, organização e proatividade.",
      empresaId: "emp-construtora",
      consultorId: "cons-rafael",
      dataAbertura: "2026-07-17",
      prazoFechamento: "2026-08-15",
      prioridade: "Média",
      etapaAtual: "1. Backlog",
      dataEntradaEtapa: "2026-07-17",
      dataFechamento: null,
      observacoes: "",
      alertaPrazoEnviado: false,
      alertaAtrasoEnviado: false,
    },
  ].map((v) => ({
    ...v,
    tipoVaga: "Nova",
    motivoReposicao: "",
    vagaOrigemId: null,
    alertaSlaProximoEnviado: false,
    alertaSlaEstouradoEnviado: false,
    emStandBy: false,
    dataInicioStandBy: null,
    diasStandByAcumulados: 0,
    motivoStandBy: "",
    createdAt: db.nowIso(),
    updatedAt: db.nowIso(),
  }));
  db.writeCollection("vagas", vagas);

  const candidatos = [
    {
      id: "cand-1",
      nome: "João Pedro Alves",
      email: "joaopedro.alves@email.com",
      telefone: "(85) 99111-2222",
      vagaId: "vaga-1",
      etapaCandidato: "Triagem OK",
      dataEntrevista: null,
      jusbrasilOk: false,
      obsReferencia: "",
      parecerComportamental: "",
      dataRetornoCliente: null,
    },
    {
      id: "cand-2",
      nome: "Fernanda Costa",
      email: "fernanda.costa@email.com",
      telefone: "(85) 99222-3333",
      vagaId: "vaga-1",
      etapaCandidato: "Inscrito",
      dataEntrevista: null,
      jusbrasilOk: false,
      obsReferencia: "",
      parecerComportamental: "",
      dataRetornoCliente: null,
    },
    {
      id: "cand-3",
      nome: "Lucas Martins",
      email: "lucas.martins@email.com",
      telefone: "(85) 99333-4444",
      vagaId: "vaga-2",
      etapaCandidato: "Entrevista Final Agendada (Cliente)",
      dataEntrevista: "2026-07-14",
      jusbrasilOk: true,
      obsReferencia: "Referências confirmadas via telefone. Sem pendências no Jusbrasil.",
      parecerComportamental: "",
      dataRetornoCliente: null,
    },
  ].map((c) => ({ ...c, createdAt: db.nowIso(), updatedAt: db.nowIso() }));
  db.writeCollection("candidatos", candidatos);

  const historico = [
    { id: "hist-1", vagaId: "vaga-1", consultorId: "cons-rafael", etapa: "1. Backlog", dataEntrada: "2026-07-10", dataSaida: "2026-07-11" },
    { id: "hist-2", vagaId: "vaga-1", consultorId: "cons-rafael", etapa: "2. Alinhamento de Perfil", dataEntrada: "2026-07-11", dataSaida: "2026-07-14" },
    { id: "hist-3", vagaId: "vaga-1", consultorId: "cons-rafael", etapa: "4. Triagem", dataEntrada: "2026-07-15", dataSaida: null },
    { id: "hist-4", vagaId: "vaga-2", consultorId: "cons-camila", etapa: "1. Backlog", dataEntrada: "2026-07-01", dataSaida: "2026-07-03" },
    { id: "hist-5", vagaId: "vaga-2", consultorId: "cons-camila", etapa: "9. Agendamento Cliente", dataEntrada: "2026-07-18", dataSaida: null },
    { id: "hist-6", vagaId: "vaga-3", consultorId: "cons-rafael", etapa: "1. Backlog", dataEntrada: "2026-07-17", dataSaida: null },
  ].map((h) => ({ ...h, createdAt: db.nowIso(), updatedAt: db.nowIso() }));
  db.writeCollection("historico", historico);

  const notificacoes = [
    {
      id: "notif-1",
      tipo: "Nova Vaga Atribuída",
      canal: "Sistema",
      vagaId: "vaga-1",
      destinatarioId: "cons-rafael",
      assunto: "Nova vaga atribuída: Analista Financeiro Pleno",
      mensagem: "Você foi designado como responsável pela vaga Analista Financeiro Pleno (Construtora Ceará Sul).",
      dataEnvio: "2026-07-10",
      lida: true,
    },
    {
      id: "notif-2",
      tipo: "Prazo Próximo do Vencimento",
      canal: "Sistema",
      vagaId: "vaga-2",
      destinatarioId: "cons-camila",
      assunto: "Prazo próximo do vencimento: Farmacêutico Responsável Técnico",
      mensagem: "O prazo de fechamento desta vaga é em breve. Confira o andamento.",
      dataEnvio: "2026-07-18",
      lida: false,
    },
  ].map((n) => ({ ...n, createdAt: db.nowIso(), updatedAt: db.nowIso() }));
  db.writeCollection("notificacoes", notificacoes);

  const indicadoresMensais = [
    { id: "ind-1", periodo: "Julho/2026", consultorId: "cons-rafael", vagasRecebidas: 2, vagasFechadasNoPrazo: 0, vagasFechadasComAtraso: 0, vagasEmAberto: 2, tempoMedioFechamentoDias: 0 },
    { id: "ind-2", periodo: "Julho/2026", consultorId: "cons-camila", vagasRecebidas: 1, vagasFechadasNoPrazo: 0, vagasFechadasComAtraso: 0, vagasEmAberto: 1, tempoMedioFechamentoDias: 0 },
  ].map((i) => ({ ...i, createdAt: db.nowIso(), updatedAt: db.nowIso() }));
  db.writeCollection("indicadoresMensais", indicadoresMensais);

  const prospects = [
    {
      id: "prospect-1",
      nome: "Renata Alencar",
      empresa: "Grupo Alencar Alimentos",
      telefone: "(85) 99777-1234",
      servicoDesejado: "Seleção e Recrutamento",
      servicoOutro: "",
      quemIndicou: "Indicação de cliente atual (Construtora Ceará Sul)",
      motivoNaoFechou: "",
      etapa: "Em Contato",
      dataContato: "2026-07-20",
      proximoFollowUp: "2026-07-28",
      observacoes: "Quer abrir 3 vagas de operação de loja ainda este semestre.",
      criadoPorId: "cons-mariana",
    },
    {
      id: "prospect-2",
      nome: "Marcos Vieira",
      empresa: "Vieira Contabilidade",
      telefone: "(85) 99666-5678",
      servicoDesejado: "Pesquisa de Clima",
      servicoOutro: "",
      quemIndicou: "LinkedIn",
      motivoNaoFechou: "Achou o valor acima do orçamento previsto para este ano.",
      etapa: "Perdido",
      dataContato: "2026-06-15",
      proximoFollowUp: null,
      observacoes: "Disse para retomar contato no início do próximo ano fiscal.",
      criadoPorId: "cons-mariana",
    },
  ].map((p) => ({ ...p, createdAt: db.nowIso(), updatedAt: db.nowIso() }));
  db.writeCollection("prospects", prospects);

  const parametros = [
    { id: "param-contratos", chave: "contratos", proximoNumero: 31, anoBase: 2025 },
  ].map((p) => ({ ...p, createdAt: db.nowIso(), updatedAt: db.nowIso() }));
  db.writeCollection("parametros", parametros);

  console.log("[seed] Concluído. Usuários de teste (senha para todos: evoe123):");
  console.log("  mariana (Gestor) / rafael (Recrutador) / camila (Recrutador)");
}

if (require.main === module) {
  seed();
}

module.exports = { seed, jaSemeado };
