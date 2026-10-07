# Evoé RS App — Sistema de R&S da Evoé Gestão e RH

App interno da consultoria (recrutamento e seleção, CRM, contratos, financeiro,
colaboradores e ponto com GPS). A dona do projeto não é desenvolvedora:
explicar tudo em português simples, sem jargão.

## Stack
- Backend: Node.js (>=18) + Express, sessão com `express-session` (em memória)
- Frontend: SPA em JavaScript puro (sem framework, sem build), roteamento por hash
- "Banco": um arquivo JSON por tabela, acessado só via `server/db.js`
  (`findAll`, `findById`, `insert`, `update`, `remove`)

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
- Inscrição cria candidato "Inscrito"/origem "Link da vaga" com `consentimentoLgpd`; mesmo e-mail na mesma vaga não duplica
  (só preenche campos vazios, guarda `reinscricoes` e nova versão do currículo). Currículos: `server/utils/curriculos.js`.

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
