const db = require("../db");

/** Carrega o usuário logado (a partir da sessão) e anexa em req.user / req.consultor.
 * Deve rodar em todas as rotas /api (exceto /api/auth/login). */
function attachUser(req, res, next) {
  if (!req.session || !req.session.userId) return next();
  const user = db.findById("users", req.session.userId);
  if (!user) return next();
  const consultor = db.findById("consultores", user.consultorId);
  req.user = { id: user.id, username: user.username, consultorId: user.consultorId };
  req.consultor = consultor;
  next();
}

function requireAuth(req, res, next) {
  if (!req.user || !req.consultor) {
    return res.status(401).json({ erro: "Não autenticado. Faça login para continuar." });
  }
  next();
}

function requireGestor(req, res, next) {
  if (!req.consultor || req.consultor.perfil !== "Gestor") {
    return res.status(403).json({ erro: "Apenas usuários com perfil Gestor podem executar esta ação." });
  }
  next();
}

// Supervisora tem o mesmo nível de acesso do Gestor em algumas áreas operacionais
// (ex: solicitar comissão da equipe), mas a aprovação final/pagamento continua só
// com o Gestor (requireGestor).
function requireGestorOuSupervisora(req, res, next) {
  if (!req.consultor || (req.consultor.perfil !== "Gestor" && req.consultor.perfil !== "Supervisora")) {
    return res.status(403).json({ erro: "Apenas Gestor ou Supervisora podem executar esta ação." });
  }
  next();
}

module.exports = { attachUser, requireAuth, requireGestor, requireGestorOuSupervisora };
