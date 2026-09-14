const express = require("express");
const db = require("../db");
const bcrypt = require("bcryptjs");
const { requireAuth, requireGestor } = require("../middleware/auth");

const router = express.Router();

/**
 * POST /api/admin/reset-test-data
 * Resets users and consultores collections with test data
 * Requires: Bearer token with admin role
 */
router.post("/reset-test-data", requireAuth, requireGestor, (req, res) => {
  try {
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
    db.writeCollection("users", users);

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
    db.writeCollection("consultores", consultores);

    res.json({
      ok: true,
      message: "Test data reset successfully",
      users: users.length,
      consultores: consultores.length,
    });
  } catch (error) {
    res.status(500).json({
      erro: "Failed to reset test data",
      details: error.message,
    });
  }
});

module.exports = router;
