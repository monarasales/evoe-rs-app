// Camada de persistência simples baseada em arquivos JSON.
// Cada "coleção" é um arquivo em /data/<nome>.json contendo um array de objetos.
// Todas as operações são síncronas de propósito: o Node.js é single-threaded e,
// como o volume de dados de uma consultoria de R&S é pequeno, isso evita qualquer
// condição de corrida entre leituras/escritas sem precisar de um banco de verdade.
// Quando o sistema crescer/for para produção na internet, esta é a camada que deve
// ser trocada por um banco real (Postgres, SQLite, etc.) sem mudar as rotas.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Em produção (Render, por exemplo), DATA_DIR deve apontar para o disco persistente
// configurado no serviço (ex: /data), para os dados não serem perdidos a cada deploy.
// Localmente, sem essa variável definida, continua usando a pasta /data do projeto.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");

function filePathFor(collection) {
  return path.join(DATA_DIR, `${collection}.json`);
}

function ensureFile(collection) {
  const file = filePathFor(collection);
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, "[]\n", "utf-8");
  }
}

function readCollection(collection) {
  ensureFile(collection);
  const raw = fs.readFileSync(filePathFor(collection), "utf-8");
  try {
    return JSON.parse(raw || "[]");
  } catch (err) {
    throw new Error(
      `Falha ao ler data/${collection}.json — o arquivo pode estar corrompido: ${err.message}`
    );
  }
}

function writeCollection(collection, records) {
  ensureFile(collection);
  fs.writeFileSync(filePathFor(collection), JSON.stringify(records, null, 2) + "\n", "utf-8");
}

function newId() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

function findAll(collection) {
  return readCollection(collection);
}

function findById(collection, id) {
  return readCollection(collection).find((r) => r.id === id) || null;
}

function insert(collection, record) {
  const records = readCollection(collection);
  const withMeta = {
    id: newId(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...record,
  };
  records.push(withMeta);
  writeCollection(collection, records);
  return withMeta;
}

function update(collection, id, patch) {
  const records = readCollection(collection);
  const idx = records.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  // Remove chaves com valor undefined do patch, para não sobrescrever campos
  // existentes quando a rota só quis atualizar parte do registro.
  const patchLimpo = Object.fromEntries(
    Object.entries(patch || {}).filter(([, v]) => v !== undefined)
  );
  records[idx] = { ...records[idx], ...patchLimpo, id, updatedAt: nowIso() };
  writeCollection(collection, records);
  return records[idx];
}

function remove(collection, id) {
  const records = readCollection(collection);
  const next = records.filter((r) => r.id !== id);
  const removed = next.length !== records.length;
  if (removed) writeCollection(collection, next);
  return removed;
}

module.exports = {
  readCollection,
  writeCollection,
  findAll,
  findById,
  insert,
  update,
  remove,
  newId,
  nowIso,
  DATA_DIR,
};
