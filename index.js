// index.js
// ============================================================
// NOVA APP BACKEND — Servidor Principal
// ============================================================
require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','PATCH'], allowedHeaders: ['Content-Type','Authorization'] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

const authRouter      = require('./src/routes/auth.routes');
const usersRouter     = require('./src/routes/users.routes');
const placesRouter    = require('./src/routes/places.routes');
const scansRouter     = require('./src/routes/scans.routes');
const rewardsRouter   = require('./src/routes/rewards.routes');
const analyticsRouter = require('./src/routes/analytics.routes');

// ── auth: /login, /register, /google-auth ────────────────
app.use('/', authRouter);

// ── users: /users, /admin/users, /stats/dashboard,
//           /api/admins/owners, etc. ─────────────────────
app.use('/', usersRouter);

// ── places: /places, /places/:id, /places/type/:type,
//            /my-place/stats, /my-place/scans, etc.
// CORRECCIÓN CRÍTICA: montado en '/places', no en '/'
// ─────────────────────────────────────────────────────────
app.use('/places', placesRouter);

// ── scans: /scan, /scans/details/:userId ─────────────────
app.use('/', scansRouter);

// ── rewards: /rewards/user/:userId ───────────────────────
app.use('/', rewardsRouter);

// ── analytics: /analytics/* ──────────────────────────────
app.use('/analytics', analyticsRouter);

// ── Error handler ────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌', err);
  res.status(500).json({ success: false, error: 'Error interno' });
});

// ── 404 ──────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, error: `${req.method} ${req.path} no encontrado` });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('\n🚀 NOVA APP BACKEND listo');
  console.log(`📡  http://localhost:${PORT}`);
  console.log(`🗄️   ${process.env.DB_PATH || './nova_app.db'}`);
  console.log('📱  /login  /scan  /places  /places/:id  /places/type/:type');
  console.log('🖥️   /admin/users  /stats/dashboard  /api/admins/owners');
  console.log('📊  /analytics/*\n');
});

process.on('SIGINT', () => {
  require('./src/config/database').close();
  process.exit(0);
});