// src/routes/rewards.routes.js
// ============================================================
// RUTAS DE RECOMPENSAS — Nova App
// ============================================================
// GET   /rewards/user/:userId   → recompensas del usuario (app móvil)
// PATCH /rewards/:id/redeem     → canjear recompensa
// GET   /admin/rewards          → todas las recompensas (admin)
// ============================================================

const express   = require('express');
const router    = express.Router();
const db        = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const authorize = require('../middleware/authorize');

// ─── GET /rewards/user/:userId ────────────────────────────
// Historial de recompensas del turista — usado por la app móvil
router.get('/rewards/user/:userId', authenticateToken, (req, res) => {
  try {
    const { userId } = req.params;

    // Solo el propio usuario o admins pueden ver las recompensas
    if (req.user.id !== parseInt(userId) &&
        req.user.role !== 'admin_general' &&
        req.user.role !== 'user_general') {
      return res.status(403).json({ success: false, error: 'Acceso denegado' });
    }

    const rewards = db.prepare(`
      SELECT
        ur.id,
        ur.reward_name,
        ur.reward_description,
        ur.reward_icon,
        ur.is_redeemed,
        ur.earned_at,
        ur.redeemed_at,
        p.id         as place_id,
        p.name       as place_name,
        p.tipo       as place_tipo,
        p.lugar      as place_lugar,
        p.image_url  as place_image
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

// ─── PATCH /rewards/:id/redeem ────────────────────────────
// Canjear una recompensa — app móvil
router.patch('/rewards/:id/redeem', authenticateToken, (req, res) => {
  try {
    const reward = db.prepare('SELECT * FROM user_rewards WHERE id = ?').get(req.params.id);

    if (!reward) {
      return res.status(404).json({ success: false, error: 'Recompensa no encontrada' });
    }

    // Solo el dueño de la recompensa puede canjearla
    if (reward.user_id !== req.user.id && req.user.role !== 'admin_general') {
      return res.status(403).json({ success: false, error: 'No tienes permiso para canjear esta recompensa' });
    }

    if (reward.is_redeemed === 1) {
      return res.status(400).json({ success: false, error: 'Esta recompensa ya fue canjeada' });
    }

    db.prepare(`
      UPDATE user_rewards
      SET is_redeemed = 1, redeemed_at = datetime('now')
      WHERE id = ?
    `).run(req.params.id);

    return res.json({ success: true, message: '¡Recompensa canjeada exitosamente!' });

  } catch (error) {
    console.error('❌ Error en PATCH /rewards/:id/redeem:', error);
    return res.status(500).json({ success: false, error: 'Error al canjear recompensa' });
  }
});

// ─── GET /admin/rewards ───────────────────────────────────
// Vista administrativa de todas las recompensas
router.get('/admin/rewards', authenticateToken, authorize(['admin_general', 'user_general']), (req, res) => {
  try {
    const rewards = db.prepare(`
      SELECT
        ur.id,
        ur.reward_name,
        ur.reward_description,
        ur.reward_icon,
        ur.is_redeemed,
        ur.earned_at,
        ur.redeemed_at,
        u.id         as user_id,
        u.first_name,
        u.last_name,
        u.email      as user_email,
        p.id         as place_id,
        p.name       as place_name,
        p.tipo       as place_tipo,
        p.lugar      as place_lugar
      FROM user_rewards ur
      JOIN users  u ON ur.user_id  = u.id
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