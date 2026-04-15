// src/middleware/checkOwnership.js
// ============================================================
// FIX: usa require('../config/database') — no new Database()
// ============================================================
const db = require('../config/database'); // ← FIX

const checkPlaceOwnership = (req, res, next) => {
  try {
    const placeId = req.params.id || req.body.place_id;
    const userId  = req.user.id;
    const userRole = req.user.role;

    if (userRole === 'admin_general') return next();

    if (userRole === 'user_place') {
      const place = db.prepare('SELECT * FROM places WHERE id = ?').get(placeId);
      if (!place) {
        return res.status(404).json({ success: false, error: 'Lugar no encontrado' });
      }
      if (place.owner_id !== userId) {
        return res.status(403).json({ success: false, error: 'No tienes permiso para acceder a este lugar' });
      }
      return next();
    }

    return res.status(403).json({ success: false, error: 'Acceso denegado' });
  } catch (error) {
    console.error('❌ checkOwnership:', error);
    return res.status(500).json({ success: false, error: 'Error en verificación de permisos' });
  }
};

module.exports = checkPlaceOwnership;