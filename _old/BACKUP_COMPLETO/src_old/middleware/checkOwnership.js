// src/middleware/checkOwnership.js
// Middleware para verificar que el usuario es propietario del lugar

const Database = require('better-sqlite3');
const db = new Database('./nova_app.db');

const checkPlaceOwnership = (req, res, next) => {
  try {
    const placeId = req.params.id || req.body.place_id;
    const userId = req.user.id;
    const userRole = req.user.role;
    
    // Admin general siempre tiene acceso
    if (userRole === 'admin_general') {
      return next();
    }
    
    // Si es user_place, verificar que el lugar le pertenece
    if (userRole === 'user_place') {
      const place = db.prepare('SELECT * FROM places WHERE id = ?').get(placeId);
      
      if (!place) {
        return res.status(404).json({
          success: false,
          error: 'Lugar no encontrado'
        });
      }
      
      if (place.owner_id !== userId) {
        return res.status(403).json({
          success: false,
          error: 'No tienes permiso para acceder a este lugar'
        });
      }
      
      return next();
    }
    
    // Otros roles no tienen acceso
    return res.status(403).json({
      success: false,
      error: 'Acceso denegado'
    });
  } catch (error) {
    console.error('❌ Error en checkOwnership middleware:', error);
    return res.status(500).json({
      success: false,
      error: 'Error en verificación de permisos'
    });
  }
};

module.exports = checkPlaceOwnership;