// src/routes/scans.routes.js
// ============================================================
// FIX: has_reward == 1 (no ===) para compatibilidad boolean/int
// ============================================================

const express  = require('express');
const router   = express.Router();
const db       = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// ─── POST /scan ───────────────────────────────────────────
router.post('/scan', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id; // SIEMPRE del token JWT — nunca del body del cliente
    const placeId = req.body.placeId || req.body.place_id;

    if (!userId || !placeId) {
      return res.status(400).json({ success: false, error: 'userId y placeId son requeridos' });
    }

    const place = db.prepare('SELECT * FROM places WHERE id = ? AND is_active = 1').get(placeId);
    if (!place) {
      return res.status(404).json({ success: false, error: 'Lugar no encontrado o inactivo' });
    }

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

    // FIX: usar == en vez de === para que funcione con true, 1, "1"
    if ((place.has_reward == 1 || place.has_reward === true) && place.reward_name) {
      // Verificar stock si es limitado
      let stockOk = true;
      if (place.reward_stock !== null && place.reward_stock !== undefined) {
        const givenCount = db.prepare(
          'SELECT COUNT(*) as c FROM user_rewards WHERE place_id = ?'
        ).get(placeId);
        if (givenCount.c >= place.reward_stock) {
          stockOk = false;
          console.log(`⚠️ Stock agotado para lugar ${placeId}: ${givenCount.c}/${place.reward_stock}`);
        }
      }

      if (stockOk) {
        // Verificar si el usuario ya tiene recompensa de este lugar
        const existingReward = db.prepare(
          'SELECT * FROM user_rewards WHERE user_id = ? AND place_id = ?'
        ).get(userId, placeId);

        if (!existingReward) {
          const rewardResult = db.prepare(`
            INSERT INTO user_rewards (user_id, place_id, reward_name, reward_description, reward_icon, is_redeemed, earned_at)
            VALUES (?, ?, ?, ?, ?, 0, datetime('now'))
          `).run(
            userId, placeId,
            place.reward_name,
            place.reward_description || '',
            place.reward_icon || '🎁'
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
    }

    const visitCount = db.prepare(
      'SELECT COUNT(*) as c FROM scans WHERE user_id = ? AND place_id = ?'
    ).get(userId, placeId);

    console.log(`📱 Escaneo registrado: usuario ${userId} → ${place.name} (has_reward: ${place.has_reward}, reward_name: ${place.reward_name})`);

    return res.json({
      success: true,
      data: {
        scan_id: scanResult.lastInsertRowid,
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
        message: reward
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
router.get('/scans/details/:userId', authenticateToken, (req, res) => {
  try {
    const { userId } = req.params;

    if (req.user.id !== parseInt(userId) &&
        req.user.role !== 'admin_general' &&
        req.user.role !== 'user_general') {
      return res.status(403).json({ success: false, error: 'No tienes permiso' });
    }

    const scans = db.prepare(`
      SELECT
        s.id, s.created_at,
        p.id as place_id, p.name as place_name,
        p.tipo as place_tipo, p.lugar as place_lugar,
        p.image_url as place_image, p.rating as place_rating,
        p.has_reward, p.reward_name
      FROM scans s
      JOIN places p ON s.place_id = p.id
      WHERE s.user_id = ?
      ORDER BY s.created_at DESC
    `).all(userId);

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
router.post('/qr/validate', (req, res) => {
  try {
    const { qr_data, qrData } = req.body;
    const data = qr_data || qrData;

    if (!data) {
      return res.status(400).json({ success: false, error: 'qr_data es requerido' });
    }

    let placeId = null;
    if (typeof data === 'string') {
      const upper = data.toUpperCase().trim();
      if (upper.startsWith('PLACE:')) {
        placeId = parseInt(upper.split(':')[1]);
      } else if (/^\d+$/.test(data.trim())) {
        placeId = parseInt(data.trim());
      }
    } else if (typeof data === 'number') {
      placeId = data;
    }

    if (!placeId || isNaN(placeId)) {
      return res.status(400).json({ success: false, error: 'Formato QR no reconocido' });
    }

    const place = db.prepare('SELECT * FROM places WHERE id = ? AND is_active = 1').get(placeId);
    if (!place) {
      return res.status(404).json({ success: false, error: 'Lugar no encontrado' });
    }

    return res.json({
      success: true,
      data: {
        place_id:    place.id,
        name:        place.name,
        tipo:        place.tipo,
        lugar:       place.lugar,
        has_reward:  place.has_reward == 1 || place.has_reward === true,
        reward_name: place.reward_name,
      },
    });

  } catch (error) {
    console.error('❌ Error en POST /qr/validate:', error);
    return res.status(500).json({ success: false, error: 'Error al validar QR' });
  }
});

module.exports = router;