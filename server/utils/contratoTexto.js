// Monta o texto integral do Contrato de Prestação de Serviços de Recrutamento e Seleção
// a partir do modelo padrão da Evoé Gestão e RH (enviado pela usuária em PDF).
// Cláusulas 3, 4, 6, 8 a 23 são fixas (boilerplate jurídico, iguais em todo contrato).
// Cláusulas 1, 2, 5 e 7 têm trechos variáveis, preenchidos com os dados do cliente/vaga
// e com os termos comerciais definidos para aquele contrato específico.

const { EVOE_DADOS } = require("./constants");

const DIAS_SEMANA = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const EXTENSO_NUMEROS = {
  15: "quinze", 20: "vinte", 30: "trinta", 45: "quarenta e cinco",
  50: "cinquenta", 60: "sessenta", 90: "noventa", 100: "cem",
  120: "cento e vinte", 180: "cento e oitenta", 365: "trezentos e sessenta e cinco",
};

function porExtenso(n) {
  return EXTENSO_NUMEROS[n] ? ` (${EXTENSO_NUMEROS[n]})` : "";
}

function formatarReal(valor) {
  const numero = Number(valor) || 0;
  return numero.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dataExtenso(dataStr) {
  const [ano, mes, dia] = (dataStr || "").split("-").map(Number);
  if (!ano || !mes || !dia) return "";
  const d = new Date(ano, mes - 1, dia);
  return `${DIAS_SEMANA[d.getDay()]}, ${String(dia).padStart(2, "0")} de ${MESES[mes - 1]} de ${ano}`;
}

/**
 * dados: {
 *   numero, dataContrato (yyyy-mm-dd),
 *   cliente: { nome, cnpj, endereco },
 *   cargoObjeto,
 *   percentualHonorarios, parcelaInicialPct, parcelaFechamentoPct,
 *   prazoReposicaoDias, vigenciaDias, prazoRescisaoAvisoDias,
 *   testemunha1: { nome, cpf }, testemunha2: { nome, cpf },
 * }
 * Retorna { titulo, subtitulo, blocos: [{ tipo: 'clausula'|'secao'|'texto'|'assinatura', ... }] }
 */
function montarContrato(dados) {
  const c = dados.cliente || {};
  const t1 = dados.testemunha1 || {};
  const t2 = dados.testemunha2 || {};

  const blocos = [];

  blocos.push({ tipo: "cabecalho", numero: dados.numero });

  const representacaoContratante = c.representanteNome
    ? ` neste ato representada por seu representante legal, ${c.representanteNome}${c.representanteCpf ? `, portador do CPF nº ${c.representanteCpf}` : ""},`
    : "";

  blocos.push({
    tipo: "texto",
    texto:
      `Contratante: ${c.nome || "—"}\n` +
      `CNPJ: ${c.cnpj || "—"}\n` +
      (c.representanteNome ? `Representante legal: ${c.representanteNome}${c.representanteCpf ? ` — CPF: ${c.representanteCpf}` : ""}\n` : "") +
      `\nPelo presente Instrumento Particular de Contrato de Prestação de Serviços de Recrutamento e Seleção de Pessoas, que entre si fazem, de um lado ${c.nome || "—"}, pessoa jurídica de direito privado, inscrita no CNPJ ${c.cnpj || "—"}, com endereço em ${c.endereco || "—"},${representacaoContratante} doravante denominada CONTRATANTE e, de outro lado, EVOÉ GESTÃO E RH, de nome fantasia EVOÉ GESTÃO E RH, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${EVOE_DADOS.cnpj}, com sede à ${EVOE_DADOS.endereco}, neste ato representada por sua representante legal abaixo assinada, doravante denominada CONTRATADA, sob as condições abaixo pactuadas:`,
  });

  blocos.push({
    tipo: "clausula",
    titulo: "Cláusula 1º. DO OBJETO DO CONTRATO.",
    texto:
      `O presente instrumento tem como objeto a prestação de serviços de Recrutamento e Seleção de pessoas à CONTRATANTE, especificamente nas áreas delineadas na Cláusula 2º, regidos nos formatos e condições descritas neste instrumento, bem como na legislação aplicável aos serviços contratados.`,
  });

  blocos.push({
    tipo: "clausula",
    titulo: "Cláusula 2º. DA ÁREA DE ATUAÇÃO.",
    texto: `A CONTRATADA prestará os serviços à CONTRATANTE, com zelo, atenção e diligência nas seguintes áreas:`,
    itens: [
      { letra: "I.", texto: `Seleção e Recrutamento de Pessoal para a vaga ${dados.cargoObjeto || "—"}\nRealização do processo de seleção e recrutamento de pessoal, conforme o perfil estabelecido entre as partes, contemplando as seguintes atividades:` },
      { letra: "a.", texto: "Alinhamento de vaga com gestores. Definição do perfil de profissional pretendido pela CONTRATANTE." },
      { letra: "b.", texto: "Abertura do processo seletivo. Lançamento do processo seletivo no mercado para prospecção de candidatos." },
      { letra: "c.", texto: "Alimentação do perfil na plataforma da empresa. Lançamento do perfil no Sistema de Rastreamento de Candidatos da CONTRATANTE." },
      { letra: "d.", texto: "Processo de hunting. Pesquisa e acionamento ativo de potenciais candidatos disponíveis no mercado." },
      { letra: "e.", texto: "Seleção de Pessoal. Realização de triagem e primeira seleção de candidatos." },
      { letra: "f.", texto: "Aplicação de teste comportamental ou psicológico." },
      { letra: "g.", texto: "Elaboração de parecer comportamental ou psicológico." },
      { letra: "h.", texto: "Envio de candidatos finalistas. Envio de três candidatos para a CONTRATANTE para entrevista e decisão final de gestores." },
      { letra: "i.", texto: `Reposição de vagas. Reposição de vagas em casos de não permanência do candidato dentro do prazo de ${dados.prazoReposicaoDias}${porExtenso(dados.prazoReposicaoDias)} dias, contados a partir da sua aprovação.` },
    ],
    paragrafos: [
      { simbolo: "§1º", texto: "Não estão inclusos no escopo deste contrato quaisquer serviços relacionados a seleção de pessoas, atendimentos individuais, tais como outras ações que não tenham sido pactuadas inicialmente, os quais deverão ser contratados mediante negociação própria e individualizada." },
      { simbolo: "§2º", texto: "A CONTRATANTE deverá assegurar condições laborais compatíveis com o cargo selecionado, bem assim que o candidato selecionado seja devidamente recepcionado na empresa por pessoa capacitada para lhe designar suas atribuições e obrigações, sob pena de perder o direito ao processo de reposição de vagas quando o desligamento do funcionário, voluntário ou não, ocorrer em razão de condições alheias ao processo seletivo em si." },
    ],
  });

  blocos.push({
    tipo: "clausula",
    titulo: "Cláusula 3º. DAS OBRIGAÇÕES DA CONTRATANTE.",
    texto: "Constituem compromissos da CONTRATANTE, além daqueles previstos legalmente, dentre outras questões, o que se segue:",
    itens: [
      { letra: "I.", texto: "Prestar, fornecer, informar e colocar à disposição todas e quaisquer informações necessárias, indispensáveis e/ou relevantes à prestação dos serviços desempenhados pela CONTRATADA, notadamente aquelas relacionadas ao setor de Recursos Humanos da empresa;" },
      { letra: "II.", texto: "Encaminhar à CONTRATADA toda e qualquer documentação que venha a ser solicitada ou que sejam de natureza obrigatória para a realização dos serviços contratados;" },
      { letra: "III.", texto: "Realizar o ressarcimento de despesas que venham a ser custeadas pela CONTRATADA em decorrência da prestação dos serviços e que não estejam englobadas pelos honorários pactuados;" },
      { letra: "IV.", texto: "Indicar à CONTRATADA a equipe ou profissional que ficará responsável pelo fornecimento das informações que eventualmente venham a ser solicitadas pela CONTRATADA e/ou sua equipe, responsabilizando-se, ademais, pela veracidade e completude das informações prestadas;" },
      { letra: "V.", texto: "Responsabilizar-se pelo cumprimento integral da proposta de emprego que vier a lançar no mercado, assim compreendidos salários, bonificações, comissões, vales e outros benefícios que tiver prometido ao empregado no ato da seleção, sob pena de não realização da reposição de vagas em caso de desistência ou demissão do candidato selecionado;" },
      { letra: "VI.", texto: "Somente exigir da CONTRATADA a execução de serviços que sejam possíveis e legais, que estejam dentro dos limites impostos pela legislação vigente, e que estejam em acordo com a moral e os bons costumes;" },
      { letra: "VII.", texto: "Comprometer-se com a realização das atividades e ações propostas pela CONTRATADA para alcance dos resultados pretendidos, atuando sempre como exemplo a ser seguido pelos seus colaboradores, e em hipótese alguma descredibilizando qualquer trabalho que venha a ser executado em razão deste contrato; e" },
      { letra: "VIII.", texto: "Informar com a devida antecedência a ocorrência de declarações de falência, recuperação judicial, fusões e aquisições, realização de auditorias externas e/ou internas, bem como quaisquer outros eventos que possam impactar direta ou indiretamente no objeto deste contrato." },
    ],
  });

  blocos.push({
    tipo: "clausula",
    titulo: "Cláusula 4º. DAS OBRIGAÇÕES DA CONTRATADA.",
    texto: "Constituem obrigações da CONTRATADA e de toda a sua equipe, além daqueles previstos legalmente e no respectivo Código de Ética, o que se segue:",
    itens: [
      { letra: "I.", texto: "Desempenhar os serviços contratados com zelo, diligência, transparência e organização, sempre de acordo com a legislação pátria, atendendo aos interesses da CONTRATANTE, resguardando a sua independência profissional, nos conformes delineados no Código de Ética da categoria;" },
      { letra: "II.", texto: "Fornecer todas as informações relacionadas aos serviços e solicitadas formalmente pela CONTRATANTE, dentro de prazo hábil para tanto, de acordo com os limites habituais de prestação dos serviços contratados;" },
      { letra: "III.", texto: "Responsabilizar-se pelos documentos e informações que lhe sejam confiados pela CONTRATANTE, enquanto estes permanecerem sob sua guarda para a execução dos serviços contratados, devendo prezar pela sua boa manutenção, de acordo com as regras comuns de armazenamento e arquivamento;" },
      { letra: "IV.", texto: "Indicar à CONTRATANTE a equipe ou profissional que ficará responsável tecnicamente pela prestação dos serviços contratados;" },
      { letra: "V.", texto: "Atuar conforme as diretrizes e definições estabelecidas diretamente com a CONTRATANTE, desde que legais e exigíveis, buscando sempre que possível atingir os objetivos e metas estabelecidos; e" },
      { letra: "VI.", texto: "Organizar e entregar à CONTRATANTE toda e qualquer documentação relativa à prestação dos serviços contratados, durante toda a vigência deste contrato, podendo exigir a assinatura do respectivo livro de protocolo ou documento que sirva como meio comprobatório de entrega dos documentos." },
    ],
  });

  blocos.push({
    tipo: "clausula",
    titulo: "Cláusula 5º. DOS HONORÁRIOS.",
    texto: "Fica acordado entre as partes que os honorários a título de prestação dos serviços objeto deste contrato serão pagos da forma a seguir definida, levando sempre em consideração os parâmetros de definição aqui estabelecidos:",
    itens: [
      dados.tipoCobranca === "ValorFixo"
        ? {
            letra: "I.",
            texto: `Pela prestação dos serviços contratados, a CONTRATANTE pagará à CONTRATADA o valor fixo de ${formatarReal(dados.valorFixo)} pela vaga trabalhada, independentemente do salário do cargo. Sendo que a primeira parcela a ser paga no percentual de ${dados.parcelaInicialPct}% desse valor para iniciar o serviço e os outros ${dados.parcelaFechamentoPct}% no fechamento da vaga.`,
          }
        : {
            letra: "I.",
            texto: `Pela prestação dos serviços contratados, a CONTRATANTE pagará à CONTRATADA um percentual por vaga trabalhada de ${dados.percentualHonorarios}% em cima do salário. Sendo que a primeira parcela a ser paga no percentual de ${dados.parcelaInicialPct}% para iniciar o serviço e os outros ${dados.parcelaFechamentoPct}% no fechamento da vaga. Vagas que a porcentagem aplicada em cima do salário o resultado for menos que um salário-mínimo, aplicamos a cobrança da vaga o valor do salário-mínimo vigente.`,
          },
    ],
    paragrafos: [
      { simbolo: "§1º", texto: "O atraso no pagamento de qualquer dos honorários estipulados nesta cláusula ocasionará a cobrança de multa correspondente a 5% (cinco unidades por cento) do valor da cobrança atrasada, além de juros de 2% (duas unidades por cento) ao mês, pro rata die, que incidirão automaticamente, independentemente de interpelação administrativa ou judicial." },
      { simbolo: "§2º", texto: "Os honorários estipulados neste contrato serão reajustados anualmente, de acordo com o INPC, sempre no mês de aniversário do contrato, quando se tratar de contrato de natureza recorrente e/ou fixa, salvo se disposto de forma diversa entre as partes." },
    ],
  });

  blocos.push({
    tipo: "clausula",
    titulo: "Cláusula 6º. DAS DESPESAS.",
    texto: "Todas as despesas efetuadas pela CONTRATADA ligadas direta ou indiretamente aos serviços prestados, incluindo-se aquisição de testes, viagens (deslocamento, locomoção, hospedagem e alimentação), custas, pagamento de taxas, entre outras, NÃO ESTÃO ENGLOBADOS NESTE CONTRATO, ficando a cargo da CONTRATANTE arcar com as mesmas, que deverá ser informada previamente pela CONTRATADA do valor total ou estimado das despesas.",
    paragrafos: [
      { simbolo: "§1º", texto: "A CONTRATANTE poderá solicitar à CONTRATADA a projeção de gastos estimadas para a realização de ações e atividades, viagens, atendimentos extraordinários, bem como outras eventualidades sobre as quais recaiam ônus além dos honorários regularmente estipulados." },
      { simbolo: "§2º", texto: "A CONTRATANTE poderá recusar os orçamentos apresentados pela CONTRATADA, desde que sejam incompatíveis com os valores regularmente praticados no mercado ou quando desejar suprir a demanda através de seus próprios meios, desde que não prejudique a execução dos serviços contratados, devendo, em todo caso, resguardar o padrão e condições apresentadas pela CONTRATADA." },
    ],
  });

  blocos.push({
    tipo: "clausula",
    titulo: "Cláusula 7º. DA VIGÊNCIA E TÉRMINO DO CONTRATO.",
    texto: `O presente contrato será válido pelo período de ${dados.vigenciaDias}${porExtenso(dados.vigenciaDias)} dias, contados a partir da data de sua assinatura, podendo ser prorrogado pelas partes por igual período ou por período indeterminado, o que deverá ser estabelecido em aditivo próprio a este fim, podendo, em todo caso, qualquer uma das partes rescindir o presente contrato, sem incidência de ônus, desde que avise com a antecedência mínima de ${dados.prazoRescisaoAvisoDias}${porExtenso(dados.prazoRescisaoAvisoDias)} dias para a parte contrária, sob pena de aplicação de multa correspondente a 1 (uma) mensalidade.`,
    paragrafos: [
      { simbolo: "§1º", texto: "A CONTRATANTE poderá rescindir o contrato, independentemente de denúncia prévia, interpelação ou notificação judicial ou extrajudicial, sem que assista à CONTRATADA qualquer direito a reclamação ou indenização, exceto o pagamento dos valores pendentes relativos aos serviços efetivamente prestados, no caso da ocorrência de qualquer das circunstâncias previstas a seguir: (a) Descumprimento contratual e/ou de obrigações legais pela CONTRATADA; (b) Falha devidamente comprovada e de responsabilidade exclusiva da CONTRATADA na prestação dos serviços objeto deste contrato; (c) Encerramento das atividades da CONTRATADA." },
      { simbolo: "§2º", texto: "Agindo a CONTRATANTE de forma dolosa ou culposa em face da CONTRATADA, ou vice-versa, restará facultado ao prejudicado rescindir o contrato, podendo a CONTRATADA, neste caso, se exonerar de todas as obrigações decorrentes deste contrato." },
      { simbolo: "§3º", texto: "Quando do encerramento do contrato, por qualquer motivo, toda a documentação relativa aos serviços prestados à CONTRATANTE ficará disponível para retirada na sede da CONTRATADA, dentro do prazo de 20 (vinte) dias, contados a partir do momento do encerramento do contrato, resguardando-se os prazos e/ou obrigações que porventura estejam compreendidas dentro deste lapso temporal." },
    ],
  });

  blocos.push({
    tipo: "clausula",
    titulo: "Cláusula 8º. DA CONFIDENCIALIDADE.",
    texto: "Durante ou após a vigência deste contrato, por prazo indeterminado, a CONTRATADA concorda em não fornecer ou autorizar qualquer pessoa a fornecer a nenhuma outra pessoa, órgão público ou particular, escritório ou empresa, qualquer informação confidencial da CONTRATANTE obtida em decorrência da prestação de serviços objeto deste contrato, salvo nos casos em que haja expressa necessidade de apresentação de tais informações e documentos.",
  });

  blocos.push({
    tipo: "clausula",
    titulo: "Cláusula 9º. DA VEDAÇÃO AO BAD MOUTHING.",
    texto: "Não obstante à cláusula de confidencialidade, as partes concordam em não fazer qualquer comentário, declaração ou alegação pública de caráter pejorativo uma da outra relacionadas ao escopo deste contrato ou outros serviços que dele sejam decorrentes.",
  });

  blocos.push({ tipo: "secao", texto: "DA LEI GERAL DE PROTEÇÃO DE DADOS PESSOAIS - LGPD" });

  blocos.push({
    tipo: "clausula",
    titulo: "Cláusula 10º.",
    texto: "As Partes reconhecem que, no âmbito deste Acordo, realizarão o tratamento de dados pessoais unicamente em nome próprio, sem que uma Parte instrua as atividades de tratamento a serem realizadas pela outra, configurando-se uma relação de controladoria independente.",
  });

  blocos.push({
    tipo: "clausula",
    titulo: "Cláusula 11º.",
    texto: "Se uma Parte realizar tratamento de dados pessoais em nome e sob instrução da outra Parte, figurará como operadora de dados pessoais, nos termos do artigo 5º, VII, da Lei n.º 13.709/2018 (\"LGPD\"), sendo a outra Parte, portanto, controladora desses dados, conforme definido no artigo 5º, VI, da LGPD. Nessa hipótese, a Parte controladora deverá avaliar todas as instruções, normas e boas práticas acerca da matéria, nos termos dos artigos 39 e 46, da LGPD, antes de instruir o tratamento de dados à Parte operadora.",
  });

  blocos.push({
    tipo: "clausula",
    titulo: "Cláusula 12º.",
    texto: "As Partes se comprometem a cumprir com a LGPD, com as diretrizes a serem emanadas pela Autoridade Nacional de Proteção de Dados (\"ANPD\") e com as demais normas aplicáveis.",
  });

  blocos.push({
    tipo: "clausula",
    titulo: "Cláusula 13º.",
    texto: "As Partes cooperarão, sempre que possível, para atender aos direitos dos titulares de dados pessoais, para endereçar incidentes de segurança e para responder a solicitações das autoridades.",
  });

  blocos.push({
    tipo: "clausula",
    titulo: "Cláusula 14º.",
    texto: "As Partes responderão pelos danos que lhes sejam atribuíveis, assegurado o direito de regresso contra aquela que deu causa, nos termos do artigo 42, §4º, da LGPD, c/c artigo 934, da Lei n.º 10.406/2002 (\"Código Civil\"), sem prejuízo do ressarcimento das despesas incorridas, inclusive honorários advocatícios.",
  });

  blocos.push({
    tipo: "clausula",
    titulo: "Cláusula 15º.",
    texto: "Em caso de responsabilização de uma das Partes por danos atribuíveis à outra Parte, fica assegurado o direito de regresso contra aquela que deu causa, nos termos do artigo 42, §4º, da LGPD, c/c artigo 934, do Código Civil, sem prejuízo do ressarcimento de todas as despesas incorridas para sua defesa, incluindo custas judiciais e honorários advocatícios.",
  });

  blocos.push({ tipo: "secao", texto: "DAS CONDIÇÕES GERAIS" });

  blocos.push({
    tipo: "clausula",
    titulo: "Cláusula 16º.",
    texto: "Nenhuma alteração a qualquer dos termos do presente contrato terá qualquer efeito, a menos que feita por escrito e assinada pelas partes.",
  });

  blocos.push({
    tipo: "clausula",
    titulo: "Cláusula 17º.",
    texto: "Havendo alteração de endereços, telefones, e-mails, entre outros, estas deverão ser comunicadas imediatamente entre as partes.",
  });

  blocos.push({
    tipo: "clausula",
    titulo: "Cláusula 18º.",
    texto: "A CONTRATADA poderá transferir ou delegar as atribuições e responsabilidades que assume por força deste contrato a terceiros sob sua responsabilidade.",
  });

  blocos.push({
    tipo: "clausula",
    titulo: "Cláusula 19º.",
    texto: "Os signatários do presente contrato asseguram e afirmam que são os representantes legais competentes para assumir em nome das partes as obrigações descritas neste contrato e representar de forma efetiva seus interesses.",
  });

  blocos.push({
    tipo: "clausula",
    titulo: "Cláusula 20º.",
    texto: "As partes são contratantes totalmente independentes, sendo cada uma inteiramente responsável por seus atos, obrigações e conteúdo das informações prestadas, em toda e qualquer circunstância, visto que o presente instrumento não cria vínculo empregatício e nem de representação comercial entre elas, e nenhuma delas poderá declarar que possui qualquer autoridade para assumir ou criar qualquer obrigação, expressa ou implícita, em nome da outra, e nem representá-la sob nenhum pretexto e em nenhuma situação.",
  });

  blocos.push({
    tipo: "clausula",
    titulo: "Cláusula 21º.",
    texto: "O não exercício por qualquer das partes de direitos ou faculdades que lhe assistam em decorrência do presente contrato, ou a tolerância com o atraso no cumprimento das obrigações da outra parte, não afetará aqueles direitos ou faculdades, os quais poderão ser exercidos a qualquer tempo, a exclusivo critério do interessado, não alterando as condições neste instrumento estipuladas.",
  });

  blocos.push({
    tipo: "clausula",
    titulo: "Cláusula 22º.",
    texto: "A impossibilidade de prestação do serviço causada por incorreção em informação fornecida pela CONTRATANTE ou por omissão no provimento de informação essencial à prestação, não caracterizará descumprimento de obrigação contratual isentando a CONTRATADA de toda e qualquer responsabilidade, ao tempo em que configurará o não cumprimento de obrigação por parte da CONTRATANTE.",
  });

  blocos.push({
    tipo: "clausula",
    titulo: "Cláusula 23º.",
    texto: `Para solução de quaisquer conflitos, entraves, questionamentos, entre outras demandas, judiciais ou administrativas, as partes elegem o foro de ${EVOE_DADOS.foro}, independentemente de qualquer outro, por mais benéfico que seja.`,
  });

  blocos.push({
    tipo: "texto",
    texto: "E por estarem de perfeito e comum acordo, assinam este contrato em 2 (duas) vias de igual forma e teor, na presença de duas testemunhas, para que surta seus devidos efeitos legais.",
  });

  blocos.push({ tipo: "data", texto: `${dataExtenso(dados.dataContrato)}.` });

  blocos.push({
    tipo: "assinaturas",
    contratada: { nome: EVOE_DADOS.razaoSocial, cnpj: `CNPJ/MF nº ${EVOE_DADOS.cnpj}` },
    contratante: {
      nome: c.nome || "—",
      cnpj: `CNPJ: ${c.cnpj || "—"}`,
      representante: c.representanteNome
        ? `Representante legal: ${c.representanteNome}${c.representanteCpf ? ` — CPF: ${c.representanteCpf}` : ""}`
        : "",
    },
    testemunha1: { nome: t1.nome || "", cpf: t1.cpf || "" },
    testemunha2: { nome: t2.nome || "", cpf: t2.cpf || "" },
  });

  return {
    titulo: "CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE RECRUTAMENTO E SELEÇÃO DE PESSOAS",
    numero: dados.numero,
    blocos,
  };
}

module.exports = { montarContrato, dataExtenso };
