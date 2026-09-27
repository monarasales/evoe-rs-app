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

## Produção (Render)
- Deploy via `render.yaml`; os dados reais ficam no disco persistente do Render
  (`DATA_DIR=/data`), **não** no repositório.
- Push na branch `main` do GitHub pode disparar deploy automático; confirmar
  com a usuária antes de fazer push.

## Cuidados
- Toda rota `/api/*` exige login (middleware central em `server/index.js`), exceto `/api/auth/*`.
- Busca de CEP/coordenadas fica em `server/utils/cep.js` (ViaCEP → BrasilAPI; Nominatim para lat/long) e nunca deve bloquear um cadastro.
- O repositório é **público**. Nunca commitar `.env`, senhas, ou dados reais de
  clientes/candidatos (LGPD). A pasta `data/` do repo contém só dados de exemplo.
- `data/*.json` está rastreado no git apesar do `.gitignore`; rodar o app
  localmente altera esses arquivos. Não incluí-los em commits (use
  `git checkout -- data/` para descartar).
- Mensagens de commit em português, no formato `feat:` / `fix:` já usado no histórico.
