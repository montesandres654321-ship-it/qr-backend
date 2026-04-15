// src/middleware/authorize.js
// ============================================================
// CONTROL DE ROLES — Nova App
// ============================================================
// Roles del sistema:
//   admin_general → CRUD completo, acceso total
//   user_general  → solo lectura, ve todo el panel
//   user_place    → solo datos de SU lugar (filtrado por place_id)
//   null          → turista (app móvil, sin acceso al panel)
//
// Uso:
//   router.post('/places', authenticateToken, authorize(['admin_general']), handler)
//   router.get('/users',   authenticateToken, authorize(['admin_general','user_general']), handler)
// ============================================================

const authorize = (allowedRoles = []) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error:   'No autenticado',
        });
      }

      if (allowedRoles.length === 0) return next();

      const { role: userRole, email: userEmail } = req.user;

      if (!userRole) {
        console.warn(`⚠️  [ROLES] ${userEmail} sin rol → requiere: ${allowedRoles.join(' o ')}`);
        return res.status(403).json({
          success: false,
          error:   'Acceso denegado. Se requiere rol de administrador.',
        });
      }

      if (!allowedRoles.includes(userRole)) {
        console.warn(`⚠️  [ROLES] ${userEmail} (${userRole}) → requiere: ${allowedRoles.join(' o ')}`);
        return res.status(403).json({
          success: false,
          error:   `Acceso denegado. Requiere: ${allowedRoles.join(' o ')}`,
          yourRole: userRole,
        });
      }

      next();

    } catch (error) {
      console.error('❌ Error en authorize:', error);
      return res.status(500).json({ success: false, error: 'Error en autorización' });
    }
  };
};

module.exports = authorize;