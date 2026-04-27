// index.js
// ============================================================
// NOVA APP BACKEND — Servidor Principal
// ============================================================
// CAMBIO: agregado uploadRouter para POST /admin/upload-image
// ============================================================
require('dotenv').config();

// ── Validación de arranque ────────────────────────────────
// Fallar rápido y claro antes de cargar cualquier módulo.
const REQUIRED_ENV = ['JWT_SECRET', 'CORS_ORIGIN'];
const missingVars  = REQUIRED_ENV.filter(k => !process.env[k]);
if (missingVars.length > 0) {
  console.error(`\n❌ Variables de entorno faltantes: ${missingVars.join(', ')}`);
  console.error('📄 Copia .env.example → .env y completa los valores\n');
  process.exit(1);
}

const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const rateLimit  = require('express-rate-limit');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── CORS seguro ───────────────────────────────────────────
// Orígenes permitidos definidos en CORS_ORIGIN (separados por coma).
// Requests sin origin header (Postman, apps móviles) pasan siempre.
const ALLOWED_ORIGINS = process.env.CORS_ORIGIN
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origen no permitido → ${origin}`));
  },
  methods:        ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Rate limiting ─────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  limit:    100,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, error: 'Demasiadas solicitudes. Intenta en 15 minutos.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit:    10,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, error: 'Demasiados intentos de login. Intenta en 15 minutos.' },
});

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit:    5,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, error: 'Demasiados intentos de registro. Intenta en 15 minutos.' },
});

// Global: aplica a todas las rutas
app.use(globalLimiter);

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
const uploadRouter    = require('./src/routes/upload.routes');
const dashboardRouter = require('./src/routes/dashboard.routes');
const ownerRouter     = require('./src/routes/owner.routes');

// ── Límites específicos — deben ir ANTES de los routers ──
app.post('/login',          authLimiter);
app.post('/users/login',    authLimiter);
app.post('/users/register', registerLimiter);

// ── auth: /login, /register, /google-auth ────────────────
app.use('/', authRouter);

// ── users: /users, /admin/users, /users/me/profile,
//           /users/me/password, /stats/dashboard,
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

// ── upload: /admin/upload-image ──────────────────────────
app.use('/', uploadRouter);

// ── dashboard: /dashboard/summary ────────────────────────
app.use('/', dashboardRouter);

// ── owner: /owner/stats ───────────────────────────────────
app.use('/', ownerRouter);

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
  console.log('🖥️   /admin/users  /users/me/profile  /users/me/password');
  console.log('📤  /admin/upload-image');
  console.log('📊  /analytics/*\n');
});

process.on('SIGINT', () => {
  require('./src/config/database').close();
  process.exit(0);
});