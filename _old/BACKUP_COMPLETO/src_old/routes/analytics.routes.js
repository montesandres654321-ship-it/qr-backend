// src/routes/analytics.routes.js
// Rutas de analytics para dashboard

const express = require('express');
const Database = require('better-sqlite3');
const router = express.Router();

const db = new Database('./nova_app.db');

// ============================================
// ESTADÍSTICAS GENERALES
// ============================================
router.get('/stats/general', (req, res) => {
  try {
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users WHERE role IS NULL').get();
    const totalPlaces = db.prepare('SELECT COUNT(*) as count FROM places WHERE is_active = 1').get();
    const totalScans = db.prepare('SELECT COUNT(*) as count FROM scans').get();
    const totalRewards = db.prepare('SELECT COUNT(*) as count FROM user_rewards').get();
    
    const placesByType = db.prepare(`
      SELECT tipo, COUNT(*) as count
      FROM places
      WHERE is_active = 1
      GROUP BY tipo
    `).all();
    
    const activeUsers = db.prepare(`
      SELECT COUNT(DISTINCT user_id) as count 
      FROM scans 
      WHERE created_at >= datetime('now', '-30 days')
    `).get();
    
    res.json({
      success: true,
      stats: {
        totalUsers: totalUsers.count,
        totalPlaces: totalPlaces.count,
        totalScans: totalScans.count,
        totalRewards: totalRewards.count,
        activeUsers: activeUsers.count,
        placesByType: {
          hotel: placesByType.find(p => p.tipo === 'hotel')?.count || 0,
          restaurant: placesByType.find(p => p.tipo === 'restaurant')?.count || 0,
          bar: placesByType.find(p => p.tipo === 'bar')?.count || 0
        }
      }
    });
  } catch (error) {
    console.error('❌ Error en stats/general:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener estadísticas'
    });
  }
});

// ============================================
// ESTADÍSTICAS DE RECOMPENSAS
// ============================================
router.get('/rewards/stats', (req, res) => {
  try {
    const total = db.prepare('SELECT COUNT(*) as count FROM user_rewards').get();
    const redeemed = db.prepare('SELECT COUNT(*) as count FROM user_rewards WHERE is_redeemed = 1').get();
    const pending = db.prepare('SELECT COUNT(*) as count FROM user_rewards WHERE is_redeemed = 0').get();
    
    const today = db.prepare(`
      SELECT COUNT(*) as count 
      FROM user_rewards 
      WHERE DATE(earned_at) = DATE('now')
    `).get();
    
    const thisWeek = db.prepare(`
      SELECT COUNT(*) as count 
      FROM user_rewards 
      WHERE earned_at >= datetime('now', '-7 days')
    `).get();
    
    const avgRedeemTime = db.prepare(`
      SELECT AVG(
        julianday(redeemed_at) - julianday(earned_at)
      ) as avg_days
      FROM user_rewards 
      WHERE is_redeemed = 1
    `).get();
    
    const redeemRate = total.count > 0 
      ? (redeemed.count / total.count * 100).toFixed(2)
      : 0;
    
    res.json({
      success: true,
      stats: {
        total: total.count,
        canjeadas: redeemed.count,
        pendientes: pending.count,
        hoy: today.count,
        semana: thisWeek.count,
        tasaCanje: parseFloat(redeemRate),
        tiempoPromedioCanje: avgRedeemTime.avg_days 
          ? parseFloat(avgRedeemTime.avg_days.toFixed(1))
          : 0
      }
    });
  } catch (error) {
    console.error('❌ Error en rewards/stats:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener estadísticas de recompensas'
    });
  }
});

router.get('/rewards/by-day', (req, res) => {
  try {
    const { days = 30 } = req.query;
    
    const data = db.prepare(`
      SELECT 
        DATE(earned_at) as date,
        COUNT(*) as count
      FROM user_rewards
      WHERE earned_at >= datetime('now', '-${days} days')
      GROUP BY DATE(earned_at)
      ORDER BY date ASC
    `).all();
    
    res.json({
      success: true,
      data: data,
      period: `${days} días`
    });
  } catch (error) {
    console.error('❌ Error en rewards/by-day:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener recompensas por día'
    });
  }
});

router.get('/rewards/top-places', (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const places = db.prepare(`
      SELECT 
        p.id,
        p.name,
        p.tipo,
        p.lugar,
        COUNT(ur.id) as total_rewards,
        SUM(CASE WHEN ur.is_redeemed = 1 THEN 1 ELSE 0 END) as redeemed,
        SUM(CASE WHEN ur.is_redeemed = 0 THEN 1 ELSE 0 END) as pending
      FROM places p
      INNER JOIN user_rewards ur ON p.id = ur.place_id
      WHERE p.is_active = 1
      GROUP BY p.id
      ORDER BY total_rewards DESC
      LIMIT ?
    `).all(parseInt(limit));
    
    res.json({
      success: true,
      places: places
    });
  } catch (error) {
    console.error('❌ Error en rewards/top-places:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener top lugares'
    });
  }
});

router.get('/rewards/by-type', (req, res) => {
  try {
    const data = db.prepare(`
      SELECT 
        p.tipo,
        COUNT(ur.id) as total,
        SUM(CASE WHEN ur.is_redeemed = 1 THEN 1 ELSE 0 END) as canjeadas,
        SUM(CASE WHEN ur.is_redeemed = 0 THEN 1 ELSE 0 END) as pendientes
      FROM places p
      INNER JOIN user_rewards ur ON p.id = ur.place_id
      WHERE p.is_active = 1
      GROUP BY p.tipo
    `).all();
    
    const result = {
      hotel: { total: 0, canjeadas: 0, pendientes: 0 },
      restaurant: { total: 0, canjeadas: 0, pendientes: 0 },
      bar: { total: 0, canjeadas: 0, pendientes: 0 }
    };
    
    data.forEach(item => {
      if (result[item.tipo]) {
        result[item.tipo] = {
          total: item.total,
          canjeadas: item.canjeadas,
          pendientes: item.pendientes
        };
      }
    });
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('❌ Error en rewards/by-type:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener recompensas por tipo'
    });
  }
});

// ============================================
// ESTADÍSTICAS DE ESCANEOS
// ============================================
router.get('/scans/by-day', (req, res) => {
  try {
    const { days = 30 } = req.query;
    
    const data = db.prepare(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count,
        COUNT(DISTINCT user_id) as unique_users
      FROM scans
      WHERE created_at >= datetime('now', '-${days} days')
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `).all();
    
    res.json({
      success: true,
      data: data,
      period: `${days} días`
    });
  } catch (error) {
    console.error('❌ Error en scans/by-day:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener escaneos por día'
    });
  }
});

router.get('/scans/by-hour', (req, res) => {
  try {
    const data = db.prepare(`
      SELECT 
        CAST(strftime('%H', created_at) AS INTEGER) as hour,
        COUNT(*) as count
      FROM scans
      WHERE created_at >= datetime('now', '-30 days')
      GROUP BY hour
      ORDER BY hour ASC
    `).all();
    
    res.json({
      success: true,
      data: data
    });
  } catch (error) {
    console.error('❌ Error en scans/by-hour:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener escaneos por hora'
    });
  }
});

router.get('/scans/top-places', (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const places = db.prepare(`
      SELECT 
        p.id,
        p.name,
        p.tipo,
        p.lugar,
        p.rating,
        COUNT(s.id) as total_scans,
        COUNT(DISTINCT s.user_id) as unique_visitors
      FROM places p
      INNER JOIN scans s ON p.id = s.place_id
      WHERE p.is_active = 1
      GROUP BY p.id
      ORDER BY total_scans DESC
      LIMIT ?
    `).all(parseInt(limit));
    
    res.json({
      success: true,
      places: places
    });
  } catch (error) {
    console.error('❌ Error en scans/top-places:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener top lugares escaneados'
    });
  }
});

// ============================================
// ESTADÍSTICAS DE USUARIOS
// ============================================
router.get('/users/stats', (req, res) => {
  try {
    const totalUsers = db.prepare(`
      SELECT COUNT(*) as count 
      FROM users 
      WHERE role IS NULL
    `).get();
    
    const activeUsers = db.prepare(`
      SELECT COUNT(DISTINCT user_id) as count 
      FROM scans 
      WHERE created_at >= datetime('now', '-30 days')
    `).get();
    
    const newThisMonth = db.prepare(`
      SELECT COUNT(*) as count 
      FROM users 
      WHERE created_at >= datetime('now', 'start of month')
      AND role IS NULL
    `).get();
    
    const usersByMonth = db.prepare(`
      SELECT 
        strftime('%Y-%m', created_at) as month,
        COUNT(*) as count
      FROM users
      WHERE role IS NULL
      AND created_at >= datetime('now', '-6 months')
      GROUP BY month
      ORDER BY month ASC
    `).all();
    
    res.json({
      success: true,
      stats: {
        total: totalUsers.count,
        active: activeUsers.count,
        newThisMonth: newThisMonth.count,
        byMonth: usersByMonth
      }
    });
  } catch (error) {
    console.error('❌ Error en users/stats:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener estadísticas de usuarios'
    });
  }
});

// ============================================
// ESTADÍSTICAS DE LUGARES
// ============================================
router.get('/places/stats', (req, res) => {
  try {
    const total = db.prepare('SELECT COUNT(*) as count FROM places WHERE is_active = 1').get();
    const withOwner = db.prepare('SELECT COUNT(*) as count FROM places WHERE owner_id IS NOT NULL AND is_active = 1').get();
    const withoutOwner = db.prepare('SELECT COUNT(*) as count FROM places WHERE owner_id IS NULL AND is_active = 1').get();
    const withReward = db.prepare('SELECT COUNT(*) as count FROM places WHERE has_reward = 1 AND is_active = 1').get();
    
    const byType = db.prepare(`
      SELECT tipo, COUNT(*) as count
      FROM places
      WHERE is_active = 1
      GROUP BY tipo
    `).all();
    
    const avgRating = db.prepare(`
      SELECT AVG(rating) as avg
      FROM places
      WHERE is_active = 1 AND rating > 0
    `).get();
    
    const avgRatingByType = db.prepare(`
      SELECT tipo, AVG(rating) as avg_rating
      FROM places
      WHERE is_active = 1 AND rating > 0
      GROUP BY tipo
    `).all();
    
    res.json({
      success: true,
      stats: {
        total: total.count,
        withOwner: withOwner.count,
        withoutOwner: withoutOwner.count,
        withReward: withReward.count,
        byType: {
          hotel: byType.find(p => p.tipo === 'hotel')?.count || 0,
          restaurant: byType.find(p => p.tipo === 'restaurant')?.count || 0,
          bar: byType.find(p => p.tipo === 'bar')?.count || 0
        },
        avgRating: avgRating.avg ? parseFloat(avgRating.avg.toFixed(2)) : 0,
        avgRatingByType: avgRatingByType.reduce((acc, item) => {
          acc[item.tipo] = parseFloat(item.avg_rating.toFixed(2));
          return acc;
        }, {})
      }
    });
  } catch (error) {
    console.error('❌ Error en places/stats:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener estadísticas de lugares'
    });
  }
});

// ============================================
// USUARIOS CON DETALLES (PARA TAB ADMINISTRADORES)
// ============================================
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
        p.name as place_name,
        p.tipo as place_type,
        p.lugar as place_location,
        p.rating as place_rating,
        COUNT(DISTINCT s.id) as total_scans,
        COUNT(DISTINCT s.user_id) as unique_visitors,
        COUNT(DISTINCT ur.id) as total_rewards
      FROM users u
      LEFT JOIN places p ON u.place_id = p.id
      LEFT JOIN scans s ON p.id = s.place_id
      LEFT JOIN user_rewards ur ON p.id = ur.place_id
      WHERE u.role IN ('admin_general', 'user_general', 'user_place')
      GROUP BY u.id
      ORDER BY 
        CASE u.role
          WHEN 'admin_general' THEN 1
          WHEN 'user_general' THEN 2
          WHEN 'user_place' THEN 3
        END,
        u.created_at DESC
    `).all();
    
    res.json({
      success: true,
      users: users,
      total: users.length
    });
  } catch (error) {
    console.error('❌ Error en admins/users-with-details:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener usuarios con detalles'
    });
  }
});

// ============================================
// PROPIETARIOS SIN LUGAR ASIGNADO
// ============================================
router.get('/admins/owners-without-place', (req, res) => {
  try {
    const owners = db.prepare(`
      SELECT 
        id,
        first_name,
        last_name,
        username,
        email,
        phone,
        created_at
      FROM users
      WHERE role = 'user_place'
      AND (place_id IS NULL OR place_id NOT IN (SELECT id FROM places WHERE is_active = 1))
      ORDER BY created_at DESC
    `).all();
    
    res.json({
      success: true,
      owners: owners,
      total: owners.length
    });
  } catch (error) {
    console.error('❌ Error en admins/owners-without-place:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener propietarios sin lugar'
    });
  }
});

module.exports = router;