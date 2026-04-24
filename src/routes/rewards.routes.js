// src/routes/rewards.routes.js
// ============================================================
// FIX: user_place puede canjear recompensas de SU lugar
// NUEVO: GET /rewards/place/:placeId — recompensas de un lugar
// ============================================================

const express   = require('express');
const router    = express.Router();
const db        = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const authorize = require('../middleware/authorize');

// ─── GET /rewards/user/:userId ────────────────────────────
router.get('/rewards/user/:userId', authenticateToken, (req, res) => {
  try {
    const { userId } = req.params;

    if (req.user.id !== parseInt(userId) &&
        req.user.role !== 'admin_general' &&
        req.user.role !== 'user_general') {
      return res.status(403).json({ success: false, error: 'Acceso denegado' });
    }

    const rewards = db.prepare(`
      SELECT
        ur.id, ur.reward_name, ur.reward_description, ur.reward_icon,
        ur.is_redeemed, ur.earned_at, ur.redeemed_at,
        p.id as place_id, p.name as place_name, p.tipo as place_tipo,
        p.lugar as place_lugar, p.image_url as place_image
      FROM user_rewards ur
      JOIN places p ON ur.place_id = p.id
      WHERE ur.user_id = ?
      ORDER BY ur.earned_at DESC
    `).all(userId);

    const stats = {
      total:    rewards.length,
      pending:  rewards.filter(r => r.is_redeemed === 0).length,
      redeemed: rewards.filter(r => r.is_redeemed === 1).length,
    };

    return res.json({ success: true, data: rewards, stats });
  } catch (error) {
    console.error('❌ Error en GET /rewards/user/:userId:', error);
    return res.status(500).json({ success: false, error: 'Error al obtener recompensas' });
  }
});

// ─── GET /rewards/place/:placeId ──────────────────────────
// NUEVO: Recompensas de un lugar específico (para el propietario)
router.get('/rewards/place/:placeId', authenticateToken, (req, res) => {
  try {
    const { placeId } = req.params;

    // Verificar permisos: admin, secretaría, o propietario del lugar
    if (req.user.role === 'user_place' && req.user.place_id !== parseInt(placeId)) {
      return res.status(403).json({ success: false, error: 'No tienes acceso a este lugar' });
    }

    if (!req.user.role && req.user.role !== 'admin_general' && req.user.role !== 'user_general') {
      return res.status(403).json({ success: false, error: 'Acceso denegado' });
    }

    const rewards = db.prepare(`
      SELECT
        ur.id, ur.user_id, ur.reward_name, ur.reward_description, ur.reward_icon,
        ur.is_redeemed, ur.earned_at, ur.redeemed_at,
        u.first_name, u.last_name, u.email as user_email, u.username,
        p.id as place_id, p.name as place_name
      FROM user_rewards ur
      JOIN users u ON ur.user_id = u.id
      JOIN places p ON ur.place_id = p.id
      WHERE ur.place_id = ?
      ORDER BY ur.earned_at DESC
    `).all(placeId);

    const pending = rewards.filter(r => r.is_redeemed === 0);
    const redeemed = rewards.filter(r => r.is_redeemed === 1);

    return res.json({
      success: true,
      data: rewards,
      pending,
      stats: {
        total: rewards.length,
        pending: pending.length,
        redeemed: redeemed.length,
      },
    });
  } catch (error) {
    console.error('❌ Error en GET /rewards/place/:placeId:', error);
    return res.status(500).json({ success: false, error: 'Error al obtener recompensas del lugar' });
  }
});

// ─── PATCH /rewards/:id/redeem ────────────────────────────
// FIX: ahora permite admin_general, user_place (de su lugar), Y el turista dueño
router.patch('/rewards/:id/redeem', authenticateToken, (req, res) => {
  try {
    const reward = db.prepare('SELECT * FROM user_rewards WHERE id = ?').get(req.params.id);

    if (!reward) {
      return res.status(404).json({ success: false, error: 'Recompensa no encontrada' });
    }

    if (reward.is_redeemed === 1) {
      return res.status(400).json({ success: false, error: 'Esta recompensa ya fue canjeada' });
    }

    // Verificar permisos:
    // 1. El turista dueño de la recompensa
    // 2. Admin general
    // 3. Propietario del lugar (user_place) donde se ganó la recompensa
    const isOwner = reward.user_id === req.user.id;
    const isAdmin = req.user.role === 'admin_general';
    const isPlaceOwner = req.user.role === 'user_place' && req.user.place_id === reward.place_id;

    if (!isOwner && !isAdmin && !isPlaceOwner) {
      return res.status(403).json({ success: false, error: 'No tienes permiso para canjear esta recompensa' });
    }

    db.prepare(`
      UPDATE user_rewards
      SET is_redeemed = 1, redeemed_at = datetime('now')
      WHERE id = ?
    `).run(req.params.id);

    // Obtener datos para el log
    const place = db.prepare('SELECT name FROM places WHERE id = ?').get(reward.place_id);
    const user = db.prepare('SELECT first_name, email FROM users WHERE id = ?').get(reward.user_id);
    console.log(`🎁 Recompensa canjeada: ID:${req.params.id} — ${reward.reward_name} → ${user?.first_name || user?.email} en ${place?.name}`);

    return res.json({ success: true, message: '¡Recompensa canjeada exitosamente!' });

  } catch (error) {
    console.error('❌ Error en PATCH /rewards/:id/redeem:', error);
    return res.status(500).json({ success: false, error: 'Error al canjear recompensa' });
  }
});

// ─── GET /admin/rewards ───────────────────────────────────
router.get('/admin/rewards', authenticateToken, authorize(['admin_general', 'user_general']), (req, res) => {
  try {
    const rewards = db.prepare(`
      SELECT
        ur.id, ur.reward_name, ur.reward_description, ur.reward_icon,
        ur.is_redeemed, ur.earned_at, ur.redeemed_at,
        u.id as user_id, u.first_name, u.last_name, u.email as user_email,
        p.id as place_id, p.name as place_name, p.tipo as place_tipo,
        p.lugar as place_lugar
      FROM user_rewards ur
      JOIN users u ON ur.user_id = u.id
      JOIN places p ON ur.place_id = p.id
      ORDER BY ur.earned_at DESC
      LIMIT 500
    `).all();

    const stats = {
      total:    rewards.length,
      pending:  rewards.filter(r => r.is_redeemed === 0).length,
      redeemed: rewards.filter(r => r.is_redeemed === 1).length,
    };

    return res.json({ success: true, data: rewards, stats });
  } catch (error) {
    console.error('❌ Error en GET /admin/rewards:', error);
    return res.status(500).json({ success: false, error: 'Error al obtener recompensas' });
  }
});

module.exports = router;