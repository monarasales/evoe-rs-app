require("dotenv").config();
const express = require("express");
const session = require("express-session");
const path = require("path");

const { seed } = require("./seed");
const { attachUser, requireAuth } = require("./middleware/auth");
const { startDeadlineChecker } = require("./utils/deadlineChecker");
const { startContratoChecker } = require("./utils/contratoChecker");
const { startBackupDiario } = require("./utils/backup");

// Primeira execução: se não houver dados ainda, cria o cenário de exemplo
// (mesmos dados usados na versão Airtable) para o sistema já nascer navegável.
seed();

// Ponto: garante a escala padrão e converte registros do ponto antigo em marcações.
require("./utils/ponto/jornada").garantirJornadaPadrao();
require("./utils/ponto/migracao").migrarPontoLegado();

const app = express();
const PORT = process.env.PORT || 3000;
const EM_PRODUCAO = process.env.NODE_ENV === "production";

// Necessário quando o app roda atrás de um proxy HTTPS (como o do Render) para
// o Express entender que a conexão original do navegador é segura, mesmo que
// internamente o tráfego chegue em HTTP simples.
if (EM_PRODUCAO) app.set("trust proxy", 1);

// Limite maior para permitir o envio de currículos (até 8 MB, em base64).
app.use(express.json({ limit: "12mb" }));
app.use(
  session({
    name: "evoe.sid",
    secret: process.env.SESSION_SECRET || "evoe-rs-local-dev-secret-troque-antes-de-ir-para-internet",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // secure:true exige HTTPS — automático em produção (Render fornece HTTPS).
      // Em desenvolvimento local (http://localhost) continua false.
      secure: EM_PRODUCAO,
      maxAge: 1000 * 60 * 60 * 8, // 8 horas
    },
  })
);
app.use(attachUser);

// Toda a API exige login, exceto as rotas de autenticação (login/logout/me).
// Proteção central: vale mesmo para rotas que esquecerem o requireAuth individual —
// sem isso, dados de candidatos/colaboradores ficavam abertos na internet (LGPD).
app.use("/api", (req, res, next) => {
  if (req.path.startsWith("/auth/")) return next();
  return requireAuth(req, res, next);
});

app.use("/api/auth", require("./routes/auth"));
app.use("/api/consultores", require("./routes/consultores"));
app.use("/api/empresas", require("./routes/empresas"));
app.use("/api/vagas", require("./routes/vagas"));
app.use("/api/candidatos", require("./routes/candidatos"));
app.use("/api/historico", require("./routes/historico"));
app.use("/api/notificacoes", require("./routes/notificacoes"));
app.use("/api/indicadores", require("./routes/indicadores"));
app.use("/api/config", require("./routes/config"));
app.use("/api/contratos", require("./routes/contratos"));
app.use("/api/financeiro", require("./routes/financeiro"));
app.use("/api/prospects", require("./routes/prospects"));
app.use("/api/colaboradores", require("./routes/colaboradores"));
app.use("/api/ponto", require("./routes/ponto"));
app.use("/api/ponto-gestao", require("./routes/pontoGestao"));
app.use("/api/configuracao", require("./routes/configuracao"));

app.use(express.static(path.join(__dirname, "..", "public")));

// Qualquer rota não-API cai no index.html (SPA com roteamento por hash).
// Exceto arquivos estáticos (imagens, css, js): se não existirem, devem
// devolver 404 de verdade — senão uma logo ainda não enviada, por exemplo,
// "carregaria" como HTML em vez de disparar o fallback do <img onerror>.
app.get(/^(?!\/api)(?!\/img\/)(?!\/css\/)(?!\/js\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});
app.use((req, res) => {
  res.status(404).send("Arquivo não encontrado.");
});

// Tratamento de erro genérico, para nunca devolver uma página HTML de erro para o front-end.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ erro: "Erro interno do servidor.", detalhe: err.message });
});

startDeadlineChecker(60);
startContratoChecker(60);
startBackupDiario(60);

// Configuração inicial do ponto (escritório, feriados, vínculos) — roda em segundo plano.
require("./utils/ponto/configInicial").aplicarConfiguracaoInicial();

app.listen(PORT, () => {
  console.log(`\nEvoé Gestão e RH — Sistema de R&S rodando em http://localhost:${PORT}\n`);
});
