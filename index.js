// index.js
// ============================================================
// NOVA APP BACKEND — MAIN ENTRY
// ============================================================
// FIX: montaje correcto de rutas con prefijos
// ============================================================

require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Logging ──────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

// ── Rate limiting (opcional) ─────────────────────────────
try {
  const rateLimit = require('express-rate-limit');
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20,
    handler: (_, res) => res.status(429).json({ success: false, error: 'Demasiados intentos' }) });
  app.post('/login', authLimiter);
  app.post('/users/login', authLimiter);
  app.post('/users/register', rateLimit({ windowMs: 15 * 60 * 1000, max: 10,
    handler: (_, res) => res.status(429).json({ success: false, error: 'Demasiados registros' }) }));
} catch (e) { /* sin rate-limit */ }

// ── Importar rutas ───────────────────────────────────────
const authRouter      = require('./src/routes/auth.routes');
const usersRouter     = require('./src/routes/users.routes');
const placesRouter    = require('./src/routes/places.routes');
const scansRouter     = require('./src/routes/scans.routes');
const rewardsRouter   = require('./src/routes/rewards.routes');
const analyticsRouter = require('./src/routes/analytics.routes');
const uploadRouter    = require('./src/routes/upload.routes');
const dashboardRouter = require('./src/routes/dashboard.routes');
const ownerRouter     = require('./src/routes/owner.routes');

// ══════════════════════════════════════════════════════════
// MONTAJE DE RUTAS
// ══════════════════════════════════════════════════════════

// Auth: /login, /users/login, /users/register, /users/google-auth, /health
app.use('/', authRouter);

// Users: /users, /users/:id, /users/me/profile, /users/me/password,
//        /admin/users/*, /api/admins/*, /stats/dashboard
app.use('/', usersRouter);

// Places: montado en /places → rutas internas son /, /:id, /type/:type, /my-place/*
app.use('/places', placesRouter);

// Scans: /scan, /scans/details/:userId, /qr/validate
app.use('/', scansRouter);

// Rewards: /rewards/user/:userId, /rewards/:id/redeem, /rewards/place/:placeId, /admin/rewards
app.use('/', rewardsRouter);

// Analytics: montado en /analytics → rutas internas son /stats/general, /rewards/stats, etc.
app.use('/analytics', analyticsRouter);

// Upload: /admin/upload-image
app.use('/', uploadRouter);

// Dashboard summary: /dashboard/summary
app.use('/', dashboardRouter);

// Owner stats: /owner/stats
app.use('/', ownerRouter);

// ── Error handler ────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌', err);
  res.status(500).json({ success: false, error: 'Error interno del servidor' });
});

// ── 404 ──────────────────────────────────────────────────
app.use((req, res) => {
  console.log(`⚠️  404: ${req.method} ${req.path}`);
  res.status(404).json({ success: false, error: `${req.method} ${req.path} no encontrado` });
});

// ── Start ────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n🚀 NOVA APP BACKEND listo');
  console.log(`📡  http://localhost:${PORT}`);
  console.log(`🗄️   ${process.env.DB_PATH || './nova_app.db'}`);
  console.log('📱  /login  /scan  /places  /places/:id  /places/type/:type');
  console.log('🖥️   /admin/users  /users/me/profile  /users/me/password');
  console.log('📊  /analytics/*  /dashboard/summary  /owner/stats');
  console.log('📤  /admin/upload-image\n');
});

process.on('SIGINT', () => {
  try { require('./src/config/database').close(); } catch (e) {}
  process.exit(0);
});