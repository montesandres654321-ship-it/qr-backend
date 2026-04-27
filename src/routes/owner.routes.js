// src/routes/owner.routes.js
// ============================================================
// OWNER STATS — Nova App
// GET /owner/stats
// Requiere: user_place
// Devuelve KPIs completos del lugar asignado en una sola llamada
// ============================================================

const express  = require('express');
const router   = express.Router();
const db       = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const authorize = require('../middleware/authorize');

// ─── GET /owner/stats ──────────────────────────────────────
// checkOwnership no aplica: el place_id se extrae del token JWT
// (req.user.place_id), nunca de params ni body del cliente.
// authorize(['user_place']) garantiza el rol; el JWT garantiza
// que place_id corresponde al dueño autenticado.
router.get(
  '/owner/stats',
  authenticateToken,
  authorize(['user_place']),
  (req, res) => {
    try {
      const placeId = req.user.place_id;

      // user_place sin lugar asignado → inconsistencia de datos
      if (!placeId) {
        return res.status(403).json({
          success: false,
          error: 'Tu cuenta no tiene un lugar asignado. Contacta al administrador.',
        });
      }

      // ── 1. KPIs escalares ────────────────────────────────
      // Único round-trip a la BD: 6 contadores + conversionRate.
      // NULLIF(totalScans, 0) evita división por cero cuando el
      // lugar no tiene scans aún. ROUND(..., 1) da un decimal.
      const kpis = db.prepare(`
        SELECT
          (SELECT COUNT(*)
             FROM scans
            WHERE place_id = ?)                                           AS totalScans,

          (SELECT COUNT(*)
             FROM scans
            WHERE place_id = ?
              AND DATE(created_at) = DATE('now'))                         AS scansToday,

          (SELECT COUNT(DISTINCT user_id)
             FROM scans
            WHERE place_id = ?)                                           AS uniqueVisitors,

          (SELECT COUNT(*)
             FROM user_rewards
            WHERE place_id = ?)                                           AS totalRewards,

          (SELECT COUNT(*)
             FROM user_rewards
            WHERE place_id = ?
              AND is_redeemed = 1)                                        AS redeemedRewards,

          (SELECT COUNT(*)
             FROM user_rewards
            WHERE place_id = ?
              AND is_redeemed = 0)                                        AS pendingRewards,

          ROUND(
            CAST(
              (SELECT COUNT(DISTINCT user_id) FROM scans WHERE place_id = ?)
            AS REAL) /
            NULLIF(
              (SELECT COUNT(*) FROM scans WHERE place_id = ?),
            0) * 100
          , 1)                                                            AS conversionRate
      `).get(
        placeId, // totalScans
        placeId, // scansToday
        placeId, // uniqueVisitors
        placeId, // totalRewards
        placeId, // redeemedRewards
        placeId, // pendingRewards
        placeId, // conversionRate numerador
        placeId  // conversionRate denominador (NULLIF)
      );

      // ── 2. Escaneos por día — 7 días siempre completos ───
      // CTE recursiva genera el calendario completo del período.
      // LEFT JOIN garantiza count = 0 en días sin actividad.
      // El frontend siempre recibe exactamente 7 puntos para graficar.
      const scansByDay = db.prepare(`
        WITH RECURSIVE calendar(d) AS (
          SELECT DATE('now', '-6 days')
          UNION ALL
          SELECT DATE(d, '+1 day') FROM calendar WHERE d < DATE('now')
        )
        SELECT
          c.d                  AS date,
          COALESCE(agg.cnt, 0) AS count
        FROM calendar c
        LEFT JOIN (
          SELECT
            DATE(created_at) AS day,
            COUNT(*)         AS cnt
          FROM scans
          WHERE place_id = ?
            AND created_at >= datetime('now', '-6 days', 'start of day')
          GROUP BY DATE(created_at)
        ) agg ON c.d = agg.day
        ORDER BY c.d ASC
      `).all(placeId);

      // ── 3. Actividad reciente — últimos 10 scans ─────────
      // rewardEarned: EXISTS verifica si el usuario tiene una
      // recompensa de este lugar (la relación es user+place,
      // no hay FK directa entre scans y user_rewards).
      // better-sqlite3 devuelve CASE como 0/1 → se convierte a bool.
      const rawActivity = db.prepare(`
        SELECT
          u.first_name || ' ' || u.last_name AS userName,
          s.created_at                        AS timestamp,
          CASE
            WHEN EXISTS (
              SELECT 1
                FROM user_rewards
               WHERE user_id  = s.user_id
                 AND place_id = s.place_id
            ) THEN 1 ELSE 0
          END                                 AS rewardEarned
        FROM scans s
        INNER JOIN users u ON s.user_id = u.id
        WHERE s.place_id = ?
        ORDER BY s.created_at DESC
        LIMIT 10
      `).all(placeId);

      // ── Respuesta ─────────────────────────────────────────
      return res.status(200).json({
        success: true,
        data: {
          totalScans:      kpis.totalScans,
          scansToday:      kpis.scansToday,
          uniqueVisitors:  kpis.uniqueVisitors,
          totalRewards:    kpis.totalRewards,
          redeemedRewards: kpis.redeemedRewards,
          pendingRewards:  kpis.pendingRewards,
          conversionRate:  kpis.conversionRate ?? 0.0,
          scansByDay,
          recentActivity: rawActivity.map(row => ({
            userName:     row.userName,
            timestamp:    row.timestamp,
            rewardEarned: row.rewardEarned === 1,
          })),
          meta: {
            generatedAt: new Date().toISOString(),
            timezone:    'UTC',
          },
        },
      });

    } catch (error) {
      console.error('❌ GET /owner/stats:', error);
      return res.status(500).json({
        success: false,
        error: 'Error al obtener estadísticas del lugar',
      });
    }
  }
);

module.exports = router;
