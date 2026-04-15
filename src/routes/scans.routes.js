// src/routes/scans.routes.js
// ============================================================
// RUTAS DE ESCANEOS — Nova App
// ============================================================
// POST /scan                    → registrar escaneo + recompensa automática
// GET  /scans/details/:userId   → historial de escaneos del usuario
// POST /qr/validate             → validar formato del QR sin registrar
// ============================================================

const express  = require('express');
const router   = express.Router();
const db       = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// ─── POST /scan ───────────────────────────────────────────
// Registra el escaneo y otorga recompensa si corresponde
// Acepta: { userId, placeId } o extrae userId del token
router.post('/scan', authenticateToken, (req, res) => {
  try {
    const userId  = req.body.userId  || req.body.user_id  || req.user.id;
    const placeId = req.body.placeId || req.body.place_id;

    if (!userId || !placeId) {
      return res.status(400).json({ success: false, error: 'userId y placeId son requeridos' });
    }

    // Verificar que el lugar existe y está activo
    const place = db.prepare('SELECT * FROM places WHERE id = ? AND is_active = 1').get(placeId);
    if (!place) {
      return res.status(404).json({ success: false, error: 'Lugar no encontrado o inactivo' });
    }

    // Verificar que el usuario existe
    const user = db.prepare('SELECT id, first_name, last_name, email FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }

    // Registrar el escaneo
    const scanResult = db.prepare(
      "INSERT INTO scans (user_id, place_id, created_at) VALUES (?, ?, datetime('now'))"
    ).run(userId, placeId);

    // ── Lógica de recompensas ─────────────────────────────
    let reward = null;

    if (place.has_reward === 1 && place.reward_name) {
      // Verificar si el usuario ya tiene recompensa de este lugar
      const existingReward = db.prepare(
        'SELECT * FROM user_rewards WHERE user_id = ? AND place_id = ?'
      ).get(userId, placeId);

      if (!existingReward) {
        // Primera visita → otorgar recompensa
        const rewardResult = db.prepare(`
          INSERT INTO user_rewards (user_id, place_id, reward_name, reward_description, reward_icon, is_redeemed, earned_at)
          VALUES (?, ?, ?, ?, ?, 0, datetime('now'))
        `).run(
          userId,
          placeId,
          place.reward_name,
          place.reward_description || '',
          place.reward_icon        || '🎁'
        );

        reward = {
          id:          rewardResult.lastInsertRowid,
          name:        place.reward_name,
          description: place.reward_description || '',
          icon:        place.reward_icon || '🎁',
          is_new:      true,
        };

        console.log(`🎁 Recompensa otorgada: usuario ${userId} → ${place.name}`);
      }
    }

    // Contar visitas totales a este lugar
    const visitCount = db.prepare(
      'SELECT COUNT(*) as c FROM scans WHERE user_id = ? AND place_id = ?'
    ).get(userId, placeId);

    console.log(`📱 Escaneo registrado: usuario ${userId} → ${place.name}`);

    return res.json({
      success: true,
      data: {
        scan_id:     scanResult.lastInsertRowid,
        place: {
          id:          place.id,
          name:        place.name,
          tipo:        place.tipo,
          lugar:       place.lugar,
          description: place.description,
          image_url:   place.image_url,
          rating:      place.rating,
        },
        reward,
        visit_count: visitCount.c,
        message:     reward
          ? `¡Felicidades! Ganaste: ${reward.name}`
          : `¡Visita registrada! Esta es tu visita #${visitCount.c} a ${place.name}`,
      },
    });

  } catch (error) {
    console.error('❌ Error en POST /scan:', error);
    return res.status(500).json({ success: false, error: 'Error al registrar escaneo' });
  }
});

// ─── GET /scans/details/:userId ───────────────────────────
// Historial completo de escaneos de un usuario con datos del lugar
router.get('/scans/details/:userId', authenticateToken, (req, res) => {
  try {
    const { userId } = req.params;

    // El usuario solo puede ver su propio historial (a menos que sea admin)
    if (req.user.id !== parseInt(userId) &&
        req.user.role !== 'admin_general' &&
        req.user.role !== 'user_general') {
      return res.status(403).json({ success: false, error: 'No tienes permiso para ver este historial' });
    }

    const scans = db.prepare(`
      SELECT
        s.id,
        s.created_at,
        p.id          as place_id,
        p.name        as place_name,
        p.tipo        as place_tipo,
        p.lugar       as place_lugar,
        p.image_url   as place_image,
        p.rating      as place_rating,
        p.has_reward,
        p.reward_name
      FROM scans s
      JOIN places p ON s.place_id = p.id
      WHERE s.user_id = ?
      ORDER BY s.created_at DESC
    `).all(userId);

    // Estadísticas rápidas
    const stats = {
      total:         scans.length,
      unique_places: new Set(scans.map(s => s.place_id)).size,
      hotels:        scans.filter(s => s.place_tipo === 'hotel').length,
      restaurants:   scans.filter(s => s.place_tipo === 'restaurant').length,
      bars:          scans.filter(s => s.place_tipo === 'bar').length,
    };

    return res.json({ success: true, data: scans, stats });

  } catch (error) {
    console.error('❌ Error en GET /scans/details/:userId:', error);
    return res.status(500).json({ success: false, error: 'Error al obtener historial' });
  }
});

// ─── POST /qr/validate ───────────────────────────────────
// Valida el formato del QR y retorna los datos del lugar sin registrar escaneo
// Acepta formatos: "PLACE:1", "PLACE:1:nombre", "1", o el id directo
router.post('/qr/validate', (req, res) => {
  try {
    const { qr_data } = req.body;

    if (!qr_data) {
      return res.status(400).json({ success: false, error: 'qr_data es requerido' });
    }

    // Extraer el placeId del QR — acepta múltiples formatos
    let placeId = null;

    if (typeof qr_data === 'string') {
      const upper = qr_data.toUpperCase().trim();

      if (upper.startsWith('PLACE:')) {
        // Formato PLACE:1 o PLACE:1:nombre
        placeId = parseInt(upper.split(':')[1]);
      } else if (/^\d+$/.test(qr_data.trim())) {
        // Solo un número
        placeId = parseInt(qr_data.trim());
      }
    } else if (typeof qr_data === 'number') {
      placeId = qr_data;
    }

    if (!placeId || isNaN(placeId)) {
      return res.status(400).json({
        success: false,
        error:   'Formato de QR no reconocido',
        hint:    'Formatos válidos: PLACE:1, PLACE:1:nombre, o un número',
      });
    }

    const place = db.prepare('SELECT * FROM places WHERE id = ? AND is_active = 1').get(placeId);

    if (!place) {
      return res.status(404).json({ success: false, error: 'Lugar no encontrado o inactivo' });
    }

    return res.json({
      success: true,
      data: {
        place_id:   place.id,
        name:       place.name,
        tipo:       place.tipo,
        lugar:      place.lugar,
        has_reward: place.has_reward === 1,
        reward_name: place.reward_name,
      },
    });

  } catch (error) {
    console.error('❌ Error en POST /qr/validate:', error);
    return res.status(500).json({ success: false, error: 'Error al validar QR' });
  }
});

module.exports = router;