// index.js
// ============================================================
// NOVA APP BACKEND — MAIN ENTRY
// ============================================================

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();

// ============================================================
// 🔐 VALIDACIÓN DE VARIABLES DE ENTORNO (FAIL-FAST)
// ============================================================

const REQUIRED_ENV = ['JWT_SECRET', 'CORS_ORIGIN'];

const missingEnv = REQUIRED_ENV.filter(v => !process.env[v]);

if (missingEnv.length > 0) {
  console.error('❌ Faltan variables de entorno:', missingEnv.join(', '));
  process.exit(1);
}

// ============================================================
// ⚙️ CONFIG BÁSICA
// ============================================================

app.use(express.json());

// ============================================================
// 🌐 CORS — CONFIGURACIÓN PROFESIONAL (FIX FLUTTER)
// ============================================================

const ALLOWED_ORIGINS = process.env.CORS_ORIGIN
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {

    // Permitir Postman / apps móviles
    if (!origin) return callback(null, true);

    // 🔥 CLAVE: permitir cualquier localhost en desarrollo (Flutter Web)
    if (process.env.NODE_ENV === 'development' && origin.startsWith('http://localhost')) {
      return callback(null, true);
    }

    // Lista blanca normal
    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS: origen no permitido → ${origin}`));
  },
  credentials: true
}));

// ============================================================
// 🚦 RATE LIMITING
// ============================================================

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'Demasiadas solicitudes. Intenta más tarde.'
    });
  }
});

app.use(globalLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'Demasiados intentos de login.'
    });
  }
});

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'Demasiados registros.'
    });
  }
});

// ============================================================
// 📦 IMPORTAR RUTAS
// ============================================================

const authRouter      = require('./src/routes/auth.routes');
const usersRouter     = require('./src/routes/users.routes');
const placesRouter    = require('./src/routes/places.routes');
const scansRouter     = require('./src/routes/scans.routes');
const rewardsRouter   = require('./src/routes/rewards.routes');
const analyticsRouter = require('./src/routes/analytics.routes');
const uploadRouter    = require('./src/routes/upload.routes');
const dashboardRouter = require('./src/routes/dashboard.routes');
const ownerRouter     = require('./src/routes/owner.routes');

// ============================================================
// 🔑 RATE LIMIT SOLO EN AUTH (ANTES DEL ROUTER)
// ============================================================

app.post('/login', authLimiter);
app.post('/users/login', authLimiter);
app.post('/users/register', registerLimiter);

// ============================================================
// 🛣️ REGISTRO DE RUTAS
// ============================================================

// Auth
app.use('/', authRouter);

// Core
app.use('/', usersRouter);
app.use('/', placesRouter);
app.use('/', scansRouter);
app.use('/', rewardsRouter);

// Analytics
app.use('/', analyticsRouter);

// Uploads
app.use('/', uploadRouter);

// Dashboard admin
app.use('/', dashboardRouter);

// Owner dashboard
app.use('/', ownerRouter);

// ============================================================
// ❌ ERROR HANDLER (CORS FIX INCLUIDO)
// ============================================================

app.use((err, req, res, next) => {
  console.error('❌', err);

  // 🔥 Importante: manejar CORS correctamente (NO 500)
  if (err.message && err.message.startsWith('CORS:')) {
    return res.status(403).json({
      success: false,
      error: err.message
    });
  }

  res.status(500).json({
    success: false,
    error: 'Error interno del servidor'
  });
});

// ============================================================
// 🚀 START SERVER
// ============================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log('\n🚀 NOVA APP BACKEND listo');
  console.log(`📡  http://localhost:${PORT}`);
  console.log(`🗄️   ${process.env.DB_PATH || './nova_app.db'}`);
  console.log('📱  /login  /scan  /places  /places/:id  /places/type/:type');
  console.log('🖥️   /admin/users  /users/me/profile  /users/me/password');
  console.log('📤  /admin/upload-image');
  console.log('📊  /analytics/*\n');
});