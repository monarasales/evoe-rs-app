# Evoé Gestão e RH — Sistema de Recrutamento e Seleção (versão local)

Aplicativo próprio para controlar toda a operação de R&S da Evoé: backlog de vagas,
alinhamento de perfil, recrutamento, triagem, entrevistas, checagem de referência,
parecer comportamental, agendamento com cliente e aprovação final — com indicadores
de desempenho por consultor e uma central de notificações interna.

- **Backend:** Node.js + Express
- **Frontend:** JavaScript puro (SPA feita à mão, sem framework)
- **Banco de dados:** arquivos JSON em `/data` (fase local — antes de ir para a internet)

## Como rodar localmente

Pré-requisito: [Node.js](https://nodejs.org) instalado (versão 18 ou superior).

```bash
cd evoe-rs-app
npm install
npm start
```

Abra **http://localhost:3000** no navegador.

Na primeira execução, o sistema já cria automaticamente os dados de exemplo (os
mesmos usados na versão anterior em Airtable): 3 consultores, 2 empresas, 3 vagas
e 3 candidatos.

### Usuários de teste

| Usuário   | Senha    | Perfil      |
|-----------|----------|-------------|
| mariana   | evoe123  | Gestor      |
| rafael    | evoe123  | Recrutador  |
| camila    | evoe123  | Recrutador  |

**Troque essas senhas antes de usar com dados reais** (crie um novo consultor pela
tela de Cadastros, ou edite diretamente `data/users.json` gerando um novo hash com
`bcryptjs`).

Para recomeçar do zero, apague os arquivos dentro de `/data` (ou apenas
`data/consultores.json`) e rode novamente `npm start` — os dados de exemplo são
recriados automaticamente. Para começar vazio (sem os dados de exemplo), edite
`server/seed.js` antes de rodar pela primeira vez.

## Estrutura do projeto

```
evoe-rs-app/
  server/                 # backend Express
    index.js              # ponto de entrada do servidor
    db.js                 # camada de leitura/escrita dos arquivos JSON
    seed.js                # dados iniciais de exemplo
    middleware/auth.js      # sessão e checagem de perfil (Gestor/Recrutador)
    routes/                # rotas REST (vagas, candidatos, empresas, etc.)
    utils/                  # regras de negócio (prazos, notificações, cálculos)
  data/                    # "banco de dados" — um arquivo .json por tabela
  public/                  # frontend (SPA em JavaScript puro)
    index.html
    css/style.css
    js/
      app.js               # bootstrap da aplicação
      api.js               # wrapper de chamadas à API
      router.js            # roteador por hash (#/kanban, #/dashboard, ...)
      views/               # uma view por tela (kanban, candidatos, dashboard...)
```

## O que o sistema já faz

- **Login por usuário e senha**, com sessão e dois perfis de acesso: Gestor (vê
  tudo) e Recrutador (só vê/edita as vagas atribuídas a ele).
- **Funil de Vagas em Kanban** com as 12 etapas do processo da Evoé — arraste o
  card para mudar a vaga de etapa. Cada mudança gera automaticamente um registro
  no histórico da vaga (usado para medir tempo por etapa).
- **Candidatos** vinculados a cada vaga, com sub-funil próprio (triagem, entrevista,
  checagem de referência/Jusbrasil, parecer comportamental, retorno do cliente).
- **Indicadores**: total de vagas, tempo médio em aberto, vagas por consultor, por
  etapa e por status de prazo (No Prazo / Atrasada / Concluída no Prazo / Concluída
  com Atraso), candidatos por etapa. O Recrutador vê os próprios números; o Gestor
  vê tudo (e pode filtrar por consultor).
- **Central de notificações** (sininho no topo): nova vaga atribuída, mudança de
  etapa, prazo próximo do vencimento (3 dias antes), vaga atrasada e candidato
  aprovado. O servidor confere os prazos automaticamente a cada 60 minutos.
- **Cadastros**: empresas clientes (todos podem criar/editar) e equipe de
  consultores (só o Gestor cria/edita, incluindo o login de cada novo consultor).
- **Contratos**: gera o Contrato de Prestação de Serviços de R&S em PDF, puxando
  automaticamente os dados do cliente (cadastrado em Configurações) e da vaga
  selecionada. Permite baixar o PDF, enviar por e-mail direto do sistema, e abrir
  o WhatsApp com uma mensagem pronta para anexar o PDF manualmente.

## Configurar envio de e-mail (para o botão "Enviar por e-mail" dos Contratos)

O sistema manda o contrato em PDF usando o seu Gmail. Para funcionar, é preciso
gerar uma **senha de app** do Google (diferente da sua senha normal de login) e
colocar em um arquivo `.env` — que fica só no seu computador, nunca é
compartilhado.

**Passo a passo:**

1. Acesse [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
   logada com o e-mail que vai enviar os contratos (precisa ter a verificação em
   duas etapas ativada na conta Google).
2. Crie uma senha de app com o nome "Evoé Sistema" (ou qualquer nome). O Google
   vai mostrar uma senha de 16 letras — copie ela.
3. Na pasta do sistema, copie o arquivo `.env.example` e renomeie a cópia para
   `.env` (sem o ".example").
4. Abra o `.env` em um editor de texto e preencha:
   ```
   EMAIL_USER=seuemail@gmail.com
   EMAIL_PASS=a senha de 16 letras que o Google gerou (sem espaços)
   ```
5. Salve e reinicie o sistema (`npm start`). O botão "Enviar por e-mail" da tela
   de Contratos já vai funcionar.

Enquanto o `.env` não existir, o botão de e-mail mostra um aviso pedindo para
configurar — o resto do sistema funciona normalmente sem ele.

**Numeração dos contratos:** o sistema começa sugerindo o número 0031/2026 (o
próximo depois do seu último contrato manual). Se precisar ajustar, vá em
Configurações > Parâmetros do Sistema > "Próximo número de contrato" (só o
Gestor pode alterar).

## Configurar a leitura automática de arquivo de vaga com IA

Em Funil de Vagas > Nova Vaga, dá para enviar um arquivo (PDF, Word ou texto) com o
perfil da vaga que o cliente mandou, e o sistema preenche título, perfil, salário,
prazo e prioridade automaticamente (usando a IA da Anthropic) — você só confere e
ajusta antes de salvar.

Isso usa uma conta separada na Anthropic (a mesma empresa do Claude), com um custo
bem pequeno por vaga lida (na casa de centavos). Sem configurar, essa função
específica fica indisponível (com um aviso claro na tela), mas o resto do sistema
continua funcionando normalmente.

**Passo a passo:**

1. Crie uma conta em [console.anthropic.com](https://console.anthropic.com) e
   configure uma forma de pagamento (cartão) — é cobrado só pelo uso, não tem
   mensalidade fixa.
2. Em "API Keys", crie uma chave nova e copie o valor (começa com `sk-ant-`).
3. **No Render** (onde o sistema está publicado): abra o serviço, vá em
   "Environment" e adicione uma variável nova:
   ```
   ANTHROPIC_API_KEY=a chave que você copiou
   ```
   Salve — o Render reinicia o serviço sozinho e a leitura automática já passa a
   funcionar.
4. **Para testar no seu computador** (opcional): coloque a mesma chave no arquivo
   `.env` (ver seção do e-mail acima), na linha `ANTHROPIC_API_KEY=`.

Isso eu não consigo fazer por você — só quem tem acesso à conta da Anthropic e ao
painel do Render consegue criar a chave e configurá-la.

## Link público para o cliente pedir uma vaga

Em Funil de Vagas > Solicitações de Vaga tem um botão "Copiar link para o cliente" —
é um link fixo (`/solicitar-vaga.html`) que pode ser enviado por WhatsApp ou e-mail
para qualquer cliente, mesmo um que ainda não seja cadastrado. O cliente preenche um
formulário simples (sem precisar de login) e o pedido cai como uma **solicitação
pendente** — nada vira vaga de verdade no funil sozinho. Só o Gestor revisa, ajusta o
que precisar e aprova (ou rejeita) — aí sim a vaga é criada.

## Sobre as notificações por e-mail e WhatsApp

Nesta fase local, todas as notificações ficam **dentro do próprio sistema** (central
de notificações). Isso foi combinado assim de propósito: evita depender de contas de
e-mail/WhatsApp antes de decidir a fase de implementação definitiva.

Quando o app for para a internet, dá para estender `server/utils/notify.js` para
também enviar e-mail de verdade (biblioteca `nodemailer`, com um SMTP de um provedor
como Gmail/SendGrid) e WhatsApp (via Meta WhatsApp Business API ou Twilio). A função
`notify()` é o único lugar que precisa mudar — todas as rotas já chamam ela.

## Preparando para "subir para a internet" (fase futura)

O sistema já foi construído pensando nessa migração, então os ajustes são pontuais:

1. **Trocar o `SESSION_SECRET`** por um valor aleatório forte, definido como variável
   de ambiente no servidor de produção (nunca deixar o valor padrão do código).
2. **Ligar `cookie.secure = true`** em `server/index.js` (linha comentada) quando o
   domínio tiver HTTPS.
3. **Trocar o armazenamento de sessão** (hoje em memória) por um store persistente
   (ex: `connect-redis`), para a sessão não se perder a cada reinício do servidor.
4. **Trocar o banco de arquivos JSON por um banco de verdade** (Postgres, MySQL ou
   SQLite) — como toda a lógica de negócio está isolada em `server/db.js`
   (`findAll`, `findById`, `insert`, `update`, `remove`), é possível reescrever
   só esse arquivo com queries reais sem tocar nas rotas.
5. **Configurar e-mail/WhatsApp reais**, como descrito acima.
6. **Hospedar** em um serviço como Render, Railway ou uma VPS própria, apontando
   um domínio da Evoé.

## Segurança e LGPD

O sistema armazena dados de candidatos (nome, contato, currículo, parecer
comportamental, checagem de referência). Ao ir para a internet, garanta HTTPS,
backups periódicos da pasta `data/` (ou do banco, após a migração) e uma política
de retenção/exclusão de dados de candidatos não aprovados, alinhada à LGPD.
