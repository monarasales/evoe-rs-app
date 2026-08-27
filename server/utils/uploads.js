// Upload de currículos dos candidatos. Os arquivos ficam salvos em
// DATA_DIR/uploads/curriculos — o mesmo disco persistente usado pelo banco de
// dados em JSON (server/db.js), então sobrevivem a cada novo deploy no Render.
// Nunca vão para o repositório Git (a pasta "data/" já está no .gitignore).

const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { DATA_DIR } = require("../db");

const UPLOADS_DIR = path.join(DATA_DIR, "uploads", "curriculos");

function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

const EXTENSOES_PERMITIDAS = [".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png"];
const TAMANHO_MAXIMO_BYTES = 10 * 1024 * 1024; // 10MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      ensureUploadsDir();
      cb(null, UPLOADS_DIR);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${req.params.id}-${Date.now()}${ext}`);
  },
});

const uploadCurriculo = multer({
  storage,
  limits: { fileSize: TAMANHO_MAXIMO_BYTES },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!EXTENSOES_PERMITIDAS.includes(ext)) {
      return cb(new Error("Formato não permitido. Envie o currículo em PDF, DOC ou DOCX."));
    }
    cb(null, true);
  },
});

module.exports = { uploadCurriculo, UPLOADS_DIR, EXTENSOES_PERMITIDAS, TAMANHO_MAXIMO_BYTES };
