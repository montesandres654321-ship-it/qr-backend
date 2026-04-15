// src/routes/analytics.routes.js
// ============================================================
// CORRECCIONES:
//  1. rewards/stats: campos total_rewards, redeemed_rewards,
//     pending_rewards, redemption_rate, total_value
//     (alineados con lo que lee rewards_page.dart)
//  2. admins/users-with-details: subquery en lugar de JOIN
//     para que turistas con escaneos NO aparezcan en la lista
// ============================================================
const express = require('express');
const router  = express.Router();
const db      = require('../config/database');

// ── STATS GENERALES ───────────────────────────────────────
router.get('/stats/general', (req, res) => {
  try {
    const totalUsers   = db.prepare('SELECT COUNT(*) as c FROM users WHERE role IS NULL').get();
    const totalPlaces  = db.prepare('SELECT COUNT(*) as c FROM places WHERE is_active = 1').get();
    const totalScans   = db.prepare('SELECT COUNT(*) as c FROM scans').get();
    const totalRewards = db.prepare('SELECT COUNT(*) as c FROM user_rewards').get();
    const activeUsers  = db.prepare(`
      SELECT COUNT(DISTINCT user_id) as c FROM scans
      WHERE created_at >= datetime('now','-30 days')
    `).get();
    const placesByType = db.prepare(
      `SELECT tipo, COUNT(*) as count FROM places WHERE is_active = 1 GROUP BY tipo`
    ).all();

    res.json({
      success: true,
      stats: {
        totalUsers:   totalUsers.c,
        totalPlaces:  totalPlaces.c,
        totalScans:   totalScans.c,
        totalRewards: totalRewards.c,
        activeUsers:  activeUsers.c,
        placesByType: {
          hotel:      placesByType.find(p => p.tipo === 'hotel')?.count      || 0,
          restaurant: placesByType.find(p => p.tipo === 'restaurant')?.count || 0,
          bar:        placesByType.find(p => p.tipo === 'bar')?.count        || 0,
        },
      },
    });
  } catch (e) {
    console.error('❌ /analytics/stats/general:', e);
    res.status(500).json({ success: false, error: 'Error estadísticas generales' });
  }
});

// ── RECOMPENSAS STATS ─────────────────────────────────────
// CORRECCIÓN CRÍTICA: nombres alineados con rewards_page.dart
// rewards_page.dart lee: total_rewards, redeemed_rewards,
//   pending_rewards, redemption_rate, total_value
router.get('/rewards/stats', (req, res) => {
  try {
    const total    = db.prepare('SELECT COUNT(*) as c FROM user_rewards').get();
    const redeemed = db.prepare('SELECT COUNT(*) as c FROM user_rewards WHERE is_redeemed = 1').get();
    const pending  = db.prepare('SELECT COUNT(*) as c FROM user_rewards WHERE is_redeemed = 0').get();
    const today    = db.prepare(`SELECT COUNT(*) as c FROM user_rewards WHERE DATE(earned_at) = DATE('now')`).get();
    const week     = db.prepare(`SELECT COUNT(*) as c FROM user_rewards WHERE earned_at >= datetime('now','-7 days')`).get();
    const avgTime  = db.prepare(`
      SELECT AVG(julianday(redeemed_at) - julianday(earned_at)) as avg
      FROM user_rewards WHERE is_redeemed = 1
    `).get();
    const rate = total.c > 0 ? parseFloat((redeemed.c / total.c * 100).toFixed(2)) : 0;

    res.json({
      success: true,
      stats: {
        // ── Campos que lee rewards_page.dart ──────────
        total_rewards:    total.c,
        redeemed_rewards: redeemed.c,
        pending_rewards:  pending.c,
        redemption_rate:  rate,
        total_value:      0,
        // ── Campos adicionales de compatibilidad ──────
        total:      total.c,
        canjeadas:  redeemed.c,
        pendientes: pending.c,
        tasaCanje:  rate,
        hoy:        today.c,
        semana:     week.c,
        tiempoPromedioCanje: avgTime.avg ? parseFloat(avgTime.avg.toFixed(1)) : 0,
      },
    });
  } catch (e) {
    console.error('❌ /analytics/rewards/stats:', e);
    res.status(500).json({ success: false, error: 'Error estadísticas recompensas' });
  }
});

// ── RECOMPENSAS POR DÍA ───────────────────────────────────
router.get('/rewards/by-day', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const data = db.prepare(`
      SELECT DATE(earned_at) as date, COUNT(*) as count
      FROM user_rewards
      WHERE earned_at >= datetime('now', '-${days} days')
      GROUP BY DATE(earned_at) ORDER BY date ASC
    `).all();
    res.json({ success: true, data, period: `${days} días` });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Error recompensas por día' });
  }
});

// ── RECOMPENSAS TOP LUGARES ───────────────────────────────
router.get('/rewards/top-places', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const places = db.prepare(`
      SELECT p.id, p.name, p.tipo, p.lugar,
        COUNT(ur.id) as total_rewards,
        SUM(CASE WHEN ur.is_redeemed = 1 THEN 1 ELSE 0 END) as redeemed,
        SUM(CASE WHEN ur.is_redeemed = 0 THEN 1 ELSE 0 END) as pending
      FROM places p
      INNER JOIN user_rewards ur ON p.id = ur.place_id
      WHERE p.is_active = 1
      GROUP BY p.id ORDER BY total_rewards DESC LIMIT ?
    `).all(limit);
    res.json({ success: true, places });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Error top lugares recompensas' });
  }
});

// ── RECOMPENSAS POR TIPO ──────────────────────────────────
router.get('/rewards/by-type', (req, res) => {
  try {
    const data = db.prepare(`
      SELECT p.tipo,
        COUNT(ur.id) as total,
        SUM(CASE WHEN ur.is_redeemed = 1 THEN 1 ELSE 0 END) as canjeadas,
        SUM(CASE WHEN ur.is_redeemed = 0 THEN 1 ELSE 0 END) as pendientes
      FROM places p
      INNER JOIN user_rewards ur ON p.id = ur.place_id
      WHERE p.is_active = 1 GROUP BY p.tipo
    `).all();
    const result = {
      hotel:      { total: 0, canjeadas: 0, pendientes: 0 },
      restaurant: { total: 0, canjeadas: 0, pendientes: 0 },
      bar:        { total: 0, canjeadas: 0, pendientes: 0 },
    };
    data.forEach(i => {
      if (result[i.tipo]) {
        result[i.tipo] = { total: i.total, canjeadas: i.canjeadas, pendientes: i.pendientes };
      }
    });
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Error recompensas por tipo' });
  }
});

// ── ESCANEOS POR DÍA ──────────────────────────────────────
router.get('/scans/by-day', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const data = db.prepare(`
      SELECT DATE(created_at) as date,
        COUNT(*) as count,
        COUNT(DISTINCT user_id) as unique_users
      FROM scans
      WHERE created_at >= datetime('now', '-${days} days')
      GROUP BY DATE(created_at) ORDER BY date ASC
    `).all();
    res.json({ success: true, data, period: `${days} días` });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Error escaneos por día' });
  }
});

// ── ESCANEOS POR HORA ─────────────────────────────────────
router.get('/scans/by-hour', (req, res) => {
  try {
    const data = db.prepare(`
      SELECT CAST(strftime('%H', created_at) AS INTEGER) as hour,
        COUNT(*) as count
      FROM scans
      WHERE created_at >= datetime('now', '-30 days')
      GROUP BY hour ORDER BY hour ASC
    `).all();
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Error escaneos por hora' });
  }
});

// ── ESCANEOS TOP LUGARES ──────────────────────────────────
router.get('/scans/top-places', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const places = db.prepare(`
      SELECT p.id, p.name, p.tipo, p.lugar, p.rating,
        COUNT(s.id) as total_scans,
        COUNT(DISTINCT s.user_id) as unique_visitors
      FROM places p
      INNER JOIN scans s ON p.id = s.place_id
      WHERE p.is_active = 1
      GROUP BY p.id ORDER BY total_scans DESC LIMIT ?
    `).all(limit);
    res.json({ success: true, places });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Error top lugares escaneos' });
  }
});

// ── USUARIOS STATS ────────────────────────────────────────
router.get('/users/stats', (req, res) => {
  try {
    const total    = db.prepare('SELECT COUNT(*) as c FROM users WHERE role IS NULL').get();
    const active   = db.prepare(`
      SELECT COUNT(DISTINCT user_id) as c FROM scans
      WHERE created_at >= datetime('now', '-30 days')
    `).get();
    const newMonth = db.prepare(`
      SELECT COUNT(*) as c FROM users
      WHERE created_at >= datetime('now', 'start of month') AND role IS NULL
    `).get();
    const byMonth  = db.prepare(`
      SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as count
      FROM users
      WHERE role IS NULL AND created_at >= datetime('now', '-6 months')
      GROUP BY month ORDER BY month ASC
    `).all();
    res.json({
      success: true,
      stats: { total: total.c, active: active.c, newThisMonth: newMonth.c, byMonth },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Error estadísticas usuarios' });
  }
});

// ── LUGARES STATS ─────────────────────────────────────────
router.get('/places/stats', (req, res) => {
  try {
    const total      = db.prepare('SELECT COUNT(*) as c FROM places WHERE is_active = 1').get();
    const withOwner  = db.prepare('SELECT COUNT(*) as c FROM places WHERE owner_id IS NOT NULL AND is_active = 1').get();
    const withReward = db.prepare('SELECT COUNT(*) as c FROM places WHERE has_reward = 1 AND is_active = 1').get();
    const byType     = db.prepare('SELECT tipo, COUNT(*) as count FROM places WHERE is_active = 1 GROUP BY tipo').all();
    const avgRating  = db.prepare('SELECT AVG(rating) as avg FROM places WHERE is_active = 1 AND rating > 0').get();
    res.json({
      success: true,
      stats: {
        total: total.c,
        withOwner: withOwner.c,
        withoutOwner: total.c - withOwner.c,
        withReward: withReward.c,
        byType: {
          hotel:      byType.find(p => p.tipo === 'hotel')?.count      || 0,
          restaurant: byType.find(p => p.tipo === 'restaurant')?.count || 0,
          bar:        byType.find(p => p.tipo === 'bar')?.count        || 0,
        },
        avgRating: avgRating.avg ? parseFloat(avgRating.avg.toFixed(2)) : 0,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Error estadísticas lugares' });
  }
});

// ── ADMINS CON DETALLES ───────────────────────────────────
// CORRECCIÓN: subquery en lugar de JOIN con scans/rewards
// El JOIN anterior traía turistas que tenían escaneos en algún lugar
router.get('/admins/users-with-details', (req, res) => {
  try {
    const users = db.prepare(`
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.username,
        u.email,
        u.phone,
        u.role,
        u.place_id,
        u.is_active,
        u.created_at,
        u.last_login,
        p.name  AS place_name,
        p.tipo  AS place_type,
        p.lugar AS place_location,
        (SELECT COUNT(*) FROM scans       s  WHERE s.place_id  = p.id) AS total_scans,
        (SELECT COUNT(*) FROM user_rewards ur WHERE ur.place_id = p.id) AS total_rewards
      FROM users u
      LEFT JOIN places p ON u.place_id = p.id
      WHERE u.role IN ('admin_general', 'user_general', 'user_place')
      ORDER BY
        CASE u.role
          WHEN 'admin_general' THEN 1
          WHEN 'user_general'  THEN 2
          WHEN 'user_place'    THEN 3
        END,
        u.created_at DESC
    `).all();

    res.json({ success: true, data: users, total: users.length });
  } catch (e) {
    console.error('❌ /analytics/admins/users-with-details:', e);
    res.status(500).json({ success: false, error: 'Error al obtener usuarios con detalles' });
  }
});

// ── PROPIETARIOS SIN LUGAR ────────────────────────────────
router.get('/admins/owners-without-place', (req, res) => {
  try {
    const owners = db.prepare(`
      SELECT id, first_name, last_name, username, email, phone, created_at
      FROM users
      WHERE role = 'user_place'
        AND (place_id IS NULL
          OR place_id NOT IN (SELECT id FROM places WHERE is_active = 1))
      ORDER BY created_at DESC
    `).all();
    res.json({ success: true, data: owners, total: owners.length });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Error propietarios sin lugar' });
  }
});

module.exports = router;