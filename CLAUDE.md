# Evoé RS App — Sistema de R&S da Evoé Gestão e RH

App interno da consultoria (recrutamento e seleção, CRM, contratos, financeiro,
colaboradores e ponto com GPS). A dona do projeto não é desenvolvedora:
explicar tudo em português simples, sem jargão.

## Stack
- Backend: Node.js (>=18) + Express, sessão com `express-session` (em memória)
- Frontend: SPA em JavaScript puro (sem framework, sem build), roteamento por hash
- "Banco": um arquivo JSON por tabela, acessado só via `server/db.js`
  (`findAll`, `findById`, `insert`, `update`, `remove`)

## ANTES DE CADA PUBLICAÇÃO (obrigatório)
1. `npm run verificar` — sintaxe de TODOS os arquivos (navegador e servidor) + testes. Se falhar, não publique.
   (Em 08/10/2026 uma variável declarada duas vezes em public/js/views/nps.js deixou o app inteiro em branco.)
2. Depois do deploy, abrir a página de produção num navegador (puppeteer) e confirmar: tela de login visível e
   nenhum erro de JavaScript no console.

## Comandos
- `npm install` — dependências
- `npm run dev` — servidor com recarga automática em http://localhost:3000
- `npm start` — servidor normal
- Login de teste: `mariana` / `evoe123` (Gestor), `rafael` ou `camila` (Recrutador).
  A API de login espera `{ username, senha }`.

## Estrutura
- `server/index.js` — entrada; registra todas as rotas `/api/*`
- `server/routes/` — uma rota REST por módulo (vagas, candidatos, contratos, ponto...)
- `server/utils/` — regras de negócio (prazos, notificações, contratos PDF/DOCX, e-mail)
- `server/middleware/auth.js` — sessão e perfis (Gestor vê tudo; Recrutador só as próprias vagas)
- `public/js/views/` — uma tela por arquivo; `public/js/api.js` faz as chamadas à API

## Módulo de Ponto
Baseado no documento "Controle de Ponto Próprio" (Resolut). Construído por etapas:
1 (feita) escalas, feriados, marcações, motor do dia, Meu Ponto, Registros;
2 (feita) Hoje/Folha/Frequência/Inconsistências + ocorrências; 3 ajustes, pedidos, fechamento.
- `server/utils/ponto/ocorrencias.js` — catálogo de tipos; o motor lê SÓ os 4 efeitos
  (abonaFalta, abonaAtraso, contaTrabalhado, descontaBanco), nunca o nome. Sem CID/diagnóstico.
- `server/utils/ponto/configInicial.js` — escritório, feriados e vínculos aplicados uma vez na subida.
- `server/utils/ponto/motor.js` — cálculo PURO do dia e `resumirDias` (única função que soma saldo;
  exclui dias pendentes). Testes em `test/pontoMotor.test.js` (`npm test`). Mexeu no motor → rode os testes.
- `server/utils/ponto/apuracao.js` — caminho único que junta marcações + escala + feriados; toda tela usa ele.
- `server/utils/ponto/tempo.js` — datas/horas sempre em America/Fortaleza; hora exibida sai de `horaMin`, nunca do timestamp.
- Coleções: `pontoMarcacoes` (PERMANENTE, nunca expurgar), `pontoJornadas` (padrão = sem colaboradorId), `pontoFeriados`, `pontoOcorrencias`.
  A coleção antiga `ponto` é migrada na subida (`migracao.js`) e mantida intacta.
- Colaborador é identificado pela sessão (login → colaborador.consultorId), nunca por parâmetro.
- Período de apuração = mês civil. Escala padrão Evoé: seg–sex 09–12/13–16 (30h/semana, estagiários).

## Inscrição pública pelo link da vaga
- Únicas rotas SEM login: `/api/publico/*` (routes/publico.js) e as páginas `/vagas` e `/vaga/<linkToken>`
  (public/inscricao.html + js/inscricao.js). Expõem só título, `descricaoPublica` e (se `mostrarEmpresa`) o nome da empresa —
  NUNCA `perfilVaga`, salário, consultor ou candidatos.
- Conteúdo da página: `vaga.pagina` (missão, objetivos, responsabilidades c/ frequência, requisitos, diferenciais,
  perfil comportamental, ferramentas, salário em TEXTO, benefícios, horário, bairro/cidade, contratação, modelo) —
  `server/utils/vagaPagina.js`; editor em `public/js/views/vagaPagina.js`. `vaga.salario` (número) é interno do Financeiro.
- `/vagas` lista TODAS as vagas não encerradas e sem `inscricoesAbertas === false`; `garantirLinks()` cria o link que faltar
  (só acrescenta campos). `/talentos` = banco de talentos (candidato com `vagaId: null`, `cadastroEspontaneo`).
- SEO: `server/utils/paginaPublicaSeo.js` injeta título, Open Graph (imagem `public/img/og-vagas.png`) e JSON-LD JobPosting
  (Google para Vagas) só com conteúdo público; `/disc/*` é noindex.
- Inscrição pública (vaga e banco de talentos) EXIGE CPF válido, data de nascimento e endereço com CEP
  (`utils/validacao.lerDadosPessoaisObrigatorios`); no cadastro interno esses campos são opcionais, mas validados.
  Busca pública de CEP: `GET /api/publico/cep/:cep`.
- Convite ao candidato (WhatsApp/copiar): `public/js/mensagemVaga.js` — texto padrão da Evoé + frase com até 3
  competências reconhecidas por LISTA APROVADA (o texto livre da vaga nunca é copiado → sem risco de viés). O mesmo
  arquivo alerta termos discriminatórios (idade, gênero, aparência, estado civil, raça, religião, origem; CLT 373-A,
  Lei 9.029/95) no editor da página e no cadastro da vaga — só alerta, não bloqueia.
- Inscrição cria candidato "Inscrito"/origem "Link da vaga" com `consentimentoLgpd`; mesmo e-mail na mesma vaga não duplica
  (só preenche campos vazios, guarda `reinscricoes` e nova versão do currículo). Currículos: `server/utils/curriculos.js`.

## Funil do candidato
- Campo `fase` (FASES_CANDIDATO em constants.js): Recrutamento → Triagem → Seleção com RH → Checagem de referência →
  Seleção com gestor → Aprovado | Reprovado (exige motivo, `reprovacao`) | Desistiu. Mudança via `POST /api/candidatos/:id/fase`,
  sempre registrada em `historicoFases`; reativar guarda a reprovação em `reprovacoesAnteriores`.
- `etapaCandidato` (14 etapas antigas) é mantido como histórico; `utils/migracaoFases.js` deu `fase` a todos (uma vez,
  `faseMigradaDe`). Indicadores usam `fase`.
- Avaliação: `dataEntrevista` (consultoria), `dataEntrevistaCliente`, `dataRetornoCliente`, `avaliacaoConsultoria`/`notaConsultoria`,
  `avaliacaoEmpresa`/`notaEmpresa` (1–5), além de `parecerComportamental` e checagem de referência.

## Pesquisa de satisfação (NPS)
- Disparo: vaga vai para "11. Aprovado" (`PATCH /api/vagas/:id/etapa`) -> `utils/npsPesquisas.criarParaVaga` (uma por vaga,
  coleção `pesquisasNps`): e-mail automático (contatos do CRM `empresas.emailContato` + `contratos.emailEnviadoPara`),
  notificação ao consultor/gestor para enviar por WhatsApp (link wa.me pronto), lembrete por e-mail após 3 dias.
- WhatsApp é 1 clique (não há API oficial da Meta integrada). Página pública `/avaliacao/<token>` (noindex).
- Cálculo puro em `utils/nps.js` (NPS 0–10 padrão de mercado; critérios 1–5), testes em `test/nps.test.js`.
- Painel (só Gestor): menu Comercial › Satisfação (NPS), `GET /api/nps/painel`.
- Disparo retroativo: `GET /api/nps/campanha/candidatas` (vagas fechadas sem pesquisa; sugere a mais recente por empresa)
  e `POST /api/nps/campanha` (cria em lote, e-mail opcional, sem notificações); a tela abre a fila de WhatsApp (1 clique/cliente).

## Teste DISC
- `server/utils/disc.js`: questionário PRÓPRIO da Evoé (24 grupos "mais/menos", base Marston 1928) — não copiar
  itens de testes comerciais (ex.: Mr.Coach é protegido por direitos autorais). Pontuação pura, testes em `test/disc.test.js`.
- Códigos das palavras são opacos e diferentes por candidato (semente = `discToken`); a página nunca recebe o fator.
- Fluxo: inscrição pelo link -> se `vaga.exigirDisc !== false`, gera `candidato.discToken` -> página `/disc/<token>`.
  Resultado em `candidato.disc`; "pedir novo teste" move o atual para `discAnteriores` (nada se apaga).
- Relatório interno: `GET /api/candidatos/:id/disc/relatorio` (HTML para salvar em PDF), `utils/discRelatorio.js`.
- DISC não é teste psicológico do SATEPSI/CFP: sempre apresentar como informação complementar.

## Produção (Render)
- Deploy via `render.yaml`; os dados reais ficam no disco persistente do Render
  (`DATA_DIR=/data`), **não** no repositório.
- Push na branch `main` do GitHub pode disparar deploy automático; confirmar
  com a usuária antes de fazer push.

## Cuidados
- **REGRA DA DONA DO SISTEMA: qualquer melhoria deve preservar TODAS as informações já existentes no banco e no sistema.** Nunca apagar/renomear campos ou coleções; formulários atualizam por merge (campos que a tela não mostra continuam gravados); migrações só acrescentam e são idempotentes; testar com dados no formato antigo antes de publicar.
- Toda rota `/api/*` exige login (middleware central em `server/index.js`), exceto `/api/auth/*`.
- Busca de CEP/coordenadas fica em `server/utils/cep.js` (ViaCEP → BrasilAPI; Nominatim para lat/long) e nunca deve bloquear um cadastro.
- O repositório é **público**. Nunca commitar `.env`, senhas, ou dados reais de
  clientes/candidatos (LGPD). A pasta `data/` do repo contém só dados de exemplo.
- `data/*.json` está rastreado no git apesar do `.gitignore`; rodar o app
  localmente altera esses arquivos. Não incluí-los em commits (use
  `git checkout -- data/` para descartar).
- Mensagens de commit em português, no formato `feat:` / `fix:` já usado no histórico.
