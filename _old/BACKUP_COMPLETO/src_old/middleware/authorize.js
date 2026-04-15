// src/middleware/authorize.js
// Middleware para verificar roles de usuario

const authorize = (allowedRoles = []) => {
  return (req, res, next) => {
    try {
      // req.user viene del authenticateToken middleware
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'No autenticado'
        });
      }
      
      const userRole = req.user.role;
      
      // Si no hay roles especificados, permitir a todos los autenticados
      if (allowedRoles.length === 0) {
        return next();
      }
      
      // Verificar si el rol del usuario está en los roles permitidos
      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({
          success: false,
          error: `Acceso denegado. Requiere rol: ${allowedRoles.join(' o ')}`
        });
      }
      
      next();
    } catch (error) {
      console.error('❌ Error en authorize middleware:', error);
      return res.status(500).json({
        success: false,
        error: 'Error en autorización'
      });
    }
  };
};

module.exports = authorize;