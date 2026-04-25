// src/routes/dashboard.routes.js
// ============================================================
// DASHBOARD SUMMARY — Nova App
// GET /dashboard/summary
// Requiere: admin_general o user_general
// Devuelve todos los KPIs del panel en una sola llamada
// ============================================================
// v2 — mejoras sin romper compatibilidad:
//   scansByDay   → CTE recursiva: siempre 7 días, sin huecos
//   topPlaces    → + conversionRate (% visitantes únicos)
//   recentActivity → + campo `type` (alias explícito de placeType)
//   meta         → generatedAt + timezone para debug de caché
// ============================================================

const express   = require('express');
const router    = express.Router();
const db        = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const authorize = require('../middleware/authorize');

// ─── GET /dashboard/summary ───────────────────────────────
router.get(
  '/dashboard/summary',
  authenticateToken,
  authorize(['admin_general', 'user_general']),
  (req, res) => {
    try {

      // ── 1. KPIs escalares ────────────────────────────────
      // Un único round-trip a la BD para los 5 conteos.
      //
      // pendingRewards: is_redeemed = 0 → recompensa ganada
      //   (scan exitoso) pero aún no canjeada en el lugar.
      //   Cuando el propietario la marca como canjeada pasa a 1.
      //
      // Preparado para filtros futuros: añadir subqueries aquí
      //   sin modificar la estructura de la respuesta.
      const kpis = db.prepare(`
        SELECT
          (SELECT COUNT(*) FROM users        WHERE role IS NULL AND is_active = 1) AS totalUsers,
          (SELECT COUNT(*) FROM scans)                                              AS totalScans,
          (SELECT COUNT(*) FROM scans        WHERE DATE(created_at) = DATE('now')) AS scansToday,
          (SELECT COUNT(*) FROM places       WHERE is_active = 1)                  AS activePlaces,
          (SELECT COUNT(*) FROM user_rewards WHERE is_redeemed = 0)                AS pendingRewards
      `).get();

      // ── 2. Top 5 lugares por escaneos ────────────────────
      // conversionRate: % de escaneos que provienen de
      //   visitantes únicos. Ej: 80 = 80 usuarios distintos
      //   de cada 100 scans → buen indicador de alcance real.
      const topPlaces = db.prepare(`
        SELECT
          p.id,
          p.name,
          p.tipo,
          p.lugar,
          p.rating,
          COUNT(s.id)               AS totalScans,
          COUNT(DISTINCT s.user_id) AS uniqueVisitors,
          ROUND(
            CAST(COUNT(DISTINCT s.user_id) AS REAL) /
            NULLIF(COUNT(s.id), 0) * 100
          , 1)                      AS conversionRate
        FROM places p
        INNER JOIN scans s ON p.id = s.place_id
        WHERE p.is_active = 1
        GROUP BY p.id
        ORDER BY totalScans DESC
        LIMIT 5
      `).all();

      // ── 3. Escaneos por día — 7 días siempre completos ───
      // FIX UX: versión anterior solo devolvía días con datos.
      // La CTE recursiva genera el calendario de los últimos 7
      // días y el LEFT JOIN garantiza count: 0 en días vacíos.
      // El frontend recibe siempre 7 puntos para graficar.
      //
      // Para extender a N días: pasar ?days=N y leer
      //   const days = Math.min(parseInt(req.query.days) || 7, 90)
      //   y sustituir los dos '-6 days' por `-${days - 1} days`
      const scansByDay = db.prepare(`
        WITH RECURSIVE calendar(d) AS (
          SELECT DATE('now', '-6 days')
          UNION ALL
          SELECT DATE(d, '+1 day') FROM calendar WHERE d < DATE('now')
        )
        SELECT
          c.d                           AS date,
          COALESCE(agg.count, 0)        AS count,
          COALESCE(agg.uniqueUsers, 0)  AS uniqueUsers
        FROM calendar c
        LEFT JOIN (
          SELECT
            DATE(created_at)          AS day,
            COUNT(*)                  AS count,
            COUNT(DISTINCT user_id)   AS uniqueUsers
          FROM scans
          WHERE created_at >= datetime('now', '-6 days', 'start of day')
          GROUP BY DATE(created_at)
        ) agg ON c.d = agg.day
        ORDER BY c.d ASC
      `).all();

      // ── 4. Actividad reciente — últimos 10 escaneos ──────
      // `type` es alias explícito de placeType para UI que
      //   necesite el nombre corto sin el prefijo "place".
      //   Ambos campos se mantienen por compatibilidad.
      const recentActivity = db.prepare(`
        SELECT
          s.id,
          s.created_at                        AS timestamp,
          u.first_name || ' ' || u.last_name  AS userName,
          u.username,
          p.name                              AS placeName,
          p.tipo                              AS placeType,
          p.tipo                              AS type,
          p.lugar                             AS placeLocation
        FROM scans s
        INNER JOIN users  u ON s.user_id  = u.id
        INNER JOIN places p ON s.place_id = p.id
        ORDER BY s.created_at DESC
        LIMIT 10
      `).all();

      // ── Respuesta ─────────────────────────────────────────
      return res.status(200).json({
        success: true,
        data: {
          totalUsers:     kpis.totalUsers,
          totalScans:     kpis.totalScans,
          scansToday:     kpis.scansToday,
          activePlaces:   kpis.activePlaces,
          pendingRewards: kpis.pendingRewards,
          topPlaces,
          scansByDay,
          recentActivity,
          meta: {
            generatedAt: new Date().toISOString(),
            timezone:    'UTC',
          },
        },
      });

    } catch (error) {
      console.error('❌ GET /dashboard/summary:', error);
      return res.status(500).json({
        success: false,
        error: 'Error al obtener resumen del dashboard',
      });
    }
  }
);

module.exports = router;
