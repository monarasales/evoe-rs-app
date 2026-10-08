// Verificação obrigatória ANTES de publicar (npm run verificar):
//  1. sintaxe de todos os arquivos do navegador (public/js, como módulos ES) e do servidor;
//  2. testes automáticos.
// Um erro de sintaxe num único arquivo do navegador deixa o app inteiro em branco —
// já aconteceu (08/10/2026); por isso esta checagem existe.
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const raiz = path.join(__dirname, "..");
const listar = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? listar(p) : e.name.endsWith(".js") ? [p] : [];
  });

let erros = 0;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "evoe-verificar-"));
for (const arq of listar(path.join(raiz, "public", "js"))) {
  // inscricao.js é script clássico; os demais são módulos ES (import/export).
  const destino = path.join(tmp, path.basename(arq).replace(/\.js$/, arq.endsWith("inscricao.js") ? ".cjs" : ".mjs"));
  fs.copyFileSync(arq, destino);
  try {
    execFileSync(process.execPath, ["--check", destino], { stdio: "pipe" });
  } catch (e) {
    erros++;
    console.error(`✖ ${path.relative(raiz, arq)}\n${String(e.stderr).split("\n").slice(0, 6).join("\n")}`);
  }
}
for (const arq of listar(path.join(raiz, "server"))) {
  try {
    execFileSync(process.execPath, ["--check", arq], { stdio: "pipe" });
  } catch (e) {
    erros++;
    console.error(`✖ ${path.relative(raiz, arq)}\n${String(e.stderr).split("\n").slice(0, 6).join("\n")}`);
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
if (erros) {
  console.error(`\n${erros} arquivo(s) com erro de sintaxe — NÃO publique.`);
  process.exit(1);
}
console.log("✔ Sintaxe ok em todos os arquivos.");
try {
  execFileSync("npm", ["test", "--silent"], { cwd: raiz, stdio: "inherit", env: { ...process.env, TZ: "UTC" } });
} catch (e) {
  console.error("\nTestes falharam — NÃO publique.");
  process.exit(1);
}
console.log("\n✔ Tudo certo para publicar.");
