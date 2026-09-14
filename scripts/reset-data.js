#!/usr/bin/env node
/**
 * Script para resetar dados de desenvolvimento
 * Usa: node scripts/reset-data.js
 */

const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`✅ Criada pasta ${DATA_DIR}`);
  }
}

function writeData(filename, data) {
  const filepath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2) + "\n", "utf-8");
  console.log(`✅ ${filename} resetado`);
}

ensureDir();

// Reset Users
const users = [
  {
    id: "user-mariana",
    consultorId: "cons-mariana",
    username: "mariana",
    passwordHash: bcrypt.hashSync("evoe123", 10),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "user-rafael",
    consultorId: "cons-rafael",
    username: "rafael",
    passwordHash: bcrypt.hashSync("evoe123", 10),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "user-camila",
    consultorId: "cons-camila",
    username: "camila",
    passwordHash: bcrypt.hashSync("evoe123", 10),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];
writeData("users.json", users);

// Reset Consultores
const consultores = [
  {
    id: "cons-mariana",
    nome: "Mariana Sales",
    email: "mariana@evoe.com",
    perfil: "consultor",
    ativo: true,
    usaControlePonto: false,
    bloqueiaAutoCorrecaoPonto: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "cons-rafael",
    nome: "Rafael Costa",
    email: "rafael@evoe.com",
    perfil: "consultor",
    ativo: true,
    usaControlePonto: false,
    bloqueiaAutoCorrecaoPonto: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "cons-camila",
    nome: "Camila Silva",
    email: "camila@evoe.com",
    perfil: "consultor",
    ativo: true,
    usaControlePonto: false,
    bloqueiaAutoCorrecaoPonto: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];
writeData("consultores.json", consultores);

console.log("\n✅ Dados resetados com sucesso!");
console.log(`📍 Localização: ${DATA_DIR}`);
console.log("\n🔐 Credenciais de teste:");
console.log("   - Usuários: mariana, rafael, camila");
console.log("   - Senha: evoe123");
