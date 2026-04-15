// ============================================
// NOVA APP BACKEND - VERSIÓN CON LOGS DETALLADOS
// ✅ Logs para diagnóstico del error 500
// ============================================

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;

// JWT Config
const JWT_SECRET = process.env.JWT_SECRET || 'nova-app-secret-2025-change-in-production';
const JWT_EXPIRES_IN = '24h';

// Database
const dbPath = path.join(__dirname, 'nova_app.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log('✅ Base de datos conectada:', dbPath);

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ============================================
// HELPER FUNCTIONS
// ============================================

const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role || null,
      place_id: user.place_id || null
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

const authenticateToken = (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Token no proporcionado'
      });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        return res.status(403).json({
          success: false,
          error: 'Token inválido o expirado'
        });
      }
      req.user = user;
      next();
    });
  } catch (error) {
    console.error('❌ Error en autenticación:', error);
    return res.status(500).json({
      success: false,
      error: 'Error en autenticación'
    });
  }
};

const authorize = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'No autenticado'
      });
    }

    if (allowedRoles.length === 0) {
      return next();
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Acceso denegado. Requiere rol: ${allowedRoles.join(' o ')}`
      });
    }

    next();
  };
};

// ============================================
// HEALTH CHECK
// ============================================

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    version: '6.0.0',
    database: 'connected'
  });
});

// ============================================
// LOGIN - CON LOGS DETALLADOS PARA DIAGNÓSTICO
// ============================================

app.post('/login', async (req, res) => {
  console.log('🔍 =================================');
  console.log('🔍 INICIO LOGIN');
  console.log('🔍 =================================');
  
  try {
    const { email, password } = req.body;
    console.log('🔍 Email recibido:', email);
    console.log('🔍 Password recibido:', password ? '***' : 'NO ENVIADO');

    if (!email || !password) {
      console.log('❌ Falta email o password');
      return res.status(400).json({
        success: false,
        error: 'Email y contraseña son requeridos'
      });
    }

    console.log('🔍 Buscando usuario en BD...');
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    console.log('🔍 Usuario encontrado:', user ? `ID: ${user.id}, Email: ${user.email}` : 'NO ENCONTRADO');

    if (!user) {
      console.log('❌ Usuario no existe');
      return res.status(401).json({
        success: false,
        error: 'Credenciales inválidas'
      });
    }

    console.log('🔍 Hash del password en BD:', user.password);
    console.log('🔍 Comparando passwords...');
    
    const validPassword = await bcrypt.compare(password, user.password);
    console.log('🔍 Password válido:', validPassword);

    if (!validPassword) {
      console.log('❌ Password incorrecto');
      return res.status(401).json({
        success: false,
        error: 'Credenciales inválidas'
      });
    }

    console.log('🔍 Verificando is_active:', user.is_active);
    if (!user.is_active) {
      console.log('❌ Usuario inactivo');
      return res.status(403).json({
        success: false,
        error: 'Usuario inactivo'
      });
    }

    console.log('🔍 Actualizando last_login...');
    try {
      db.prepare('UPDATE users SET last_login = datetime("now") WHERE id = ?').run(user.id);
      console.log('✅ last_login actualizado');
    } catch (updateError) {
      console.error('⚠️ Error al actualizar last_login:', updateError);
      // Continuar aunque falle el update
    }

    console.log('🔍 Generando token...');
    const token = generateToken(user);
    console.log('✅ Token generado');

    const { password: _, ...userWithoutPassword } = user;

    console.log(`✅ Login exitoso: ${email} (${user.role || 'mobile'})`);
    console.log('🔍 =================================');

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          first_name: user.first_name,
          last_name: user.last_name,
          role: user.role,
          place_id: user.place_id,
          is_active: user.is_active
        },
        token: token
      }
    });

  } catch (error) {
    console.error('❌ ===============================');
    console.error('❌ ERROR CRÍTICO EN LOGIN');
    console.error('❌ ===============================');
    console.error('❌ Error:', error);
    console.error('❌ Mensaje:', error.message);
    console.error('❌ Stack:', error.stack);
    console.error('❌ ===============================');
    
    res.status(500).json({
      success: false,
      error: 'Error en autenticación'
    });
  }
});

// ============================================
// USERS ROUTES
// ============================================

app.get('/users', authenticateToken, authorize(['admin_general', 'user_general']), (req, res) => {
  try {
    const users = db.prepare(`
      SELECT 
        id, username, email, first_name, last_name, role, is_active,
        created_at, last_login, phone
      FROM users
      ORDER BY created_at DESC
    `).all();

    res.json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('❌ Error en GET /users:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener usuarios'
    });
  }
});

app.get('/users/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;

    const user = db.prepare(`
      SELECT 
        id, username, email, first_name, last_name, role, is_active,
        created_at, last_login, phone, place_id
      FROM users
      WHERE id = ?
    `).get(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('❌ Error en GET /users/:id:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener usuario'
    });
  }
});

// ============================================
// PLACES ROUTES
// ============================================

app.get('/places', (req, res) => {
  try {
    const places = db.prepare('SELECT * FROM places WHERE is_active = 1').all();

    const placesWithDetails = places.map(place => ({
      ...place,
      amenities: place.amenities ? JSON.parse(place.amenities) : [],
      has_reward: place.has_reward === 1
    }));

    res.json({
      success: true,
      data: placesWithDetails
    });
  } catch (error) {
    console.error('❌ Error en GET /places:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener lugares'
    });
  }
});

app.get('/places/:id', (req, res) => {
  try {
    const { id } = req.params;
    const place = db.prepare('SELECT * FROM places WHERE id = ?').get(id);

    if (!place) {
      return res.status(404).json({
        success: false,
        error: 'Lugar no encontrado'
      });
    }

    res.json({
      success: true,
      data: {
        ...place,
        amenities: place.amenities ? JSON.parse(place.amenities) : [],
        has_reward: place.has_reward === 1
      }
    });
  } catch (error) {
    console.error('❌ Error en GET /places/:id:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener lugar'
    });
  }
});

// ============================================
// STATS ROUTES
// ============================================

app.get('/stats/dashboard', authenticateToken, (req, res) => {
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

    const scansByDay = db.prepare(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
      FROM scans
      WHERE created_at >= datetime('now', '-30 days')
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `).all();

    const topPlaces = db.prepare(`
      SELECT 
        p.id, p.name, p.tipo, p.lugar,
        COUNT(s.id) as total_scans
      FROM places p
      LEFT JOIN scans s ON p.id = s.place_id
      WHERE p.is_active = 1
      GROUP BY p.id
      ORDER BY total_scans DESC
      LIMIT 10
    `).all();

    res.json({
      success: true,
      data: {
        stats: {
          users: totalUsers.count,
          places: totalPlaces.count,
          scans: totalScans.count,
          rewards: totalRewards.count
        },
        scansByDay: scansByDay,
        topPlaces: topPlaces,
        placesByType: placesByType.reduce((acc, item) => {
          acc[item.tipo] = item.count;
          return acc;
        }, {})
      }
    });
  } catch (error) {
    console.error('❌ Error en stats/dashboard:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener estadísticas'
    });
  }
});

// ============================================
// ADMIN USERS - Gestión de usuarios móviles
// ============================================

app.get('/admin/users', authenticateToken, authorize(['admin_general', 'user_general']), (req, res) => {
  try {
    const users = db.prepare(`
      SELECT 
        u.id, u.first_name, u.last_name, u.username, u.email, u.phone,
        u.created_at, u.last_login, u.is_active, u.google_id, u.role,
        COUNT(DISTINCT s.id) as total_scans,
        COUNT(DISTINCT ur.id) as total_rewards,
        SUM(CASE WHEN ur.is_redeemed = 1 THEN 1 ELSE 0 END) as redeemed_rewards
      FROM users u
      LEFT JOIN scans s ON u.id = s.user_id
      LEFT JOIN user_rewards ur ON u.id = ur.user_id
      WHERE u.role IS NULL OR u.role NOT IN ('admin_general', 'user_general', 'user_place')
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `).all();

    res.json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener usuarios'
    });
  }
});

app.get('/admin/users/:id', authenticateToken, authorize(['admin_general', 'user_general']), (req, res) => {
  try {
    const { id } = req.params;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    const scans = db.prepare(`
      SELECT s.*, p.name as place_name, p.tipo, p.lugar
      FROM scans s
      JOIN places p ON s.place_id = p.id
      WHERE s.user_id = ?
      ORDER BY s.created_at DESC
    `).all(id);

    const rewards = db.prepare(`
      SELECT ur.*, p.name as place_name
      FROM user_rewards ur
      JOIN places p ON ur.place_id = p.id
      WHERE ur.user_id = ?
      ORDER BY ur.earned_at DESC
    `).all(id);

    const topPlaces = db.prepare(`
      SELECT 
        p.name, p.tipo, p.lugar,
        COUNT(*) as visit_count
      FROM scans s
      JOIN places p ON s.place_id = p.id
      WHERE s.user_id = ?
      GROUP BY p.id
      ORDER BY visit_count DESC
      LIMIT 5
    `).all(id);

    const { password: _, ...userWithoutPassword } = user;

    res.json({
      success: true,
      data: {
        user: userWithoutPassword,
        scans: scans,
        rewards: rewards,
        topPlaces: topPlaces,
        stats: {
          totalScans: scans.length,
          totalRewards: rewards.length,
          redeemedRewards: rewards.filter(r => r.is_redeemed === 1).length
        }
      }
    });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener detalle'
    });
  }
});

app.patch('/admin/users/:id/toggle', authenticateToken, authorize(['admin_general']), (req, res) => {
  try {
    const { id } = req.params;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    const newStatus = user.is_active === 1 ? 0 : 1;
    db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(newStatus, id);

    res.json({
      success: true,
      data: {
        message: `Usuario ${newStatus === 1 ? 'activado' : 'desactivado'}`,
        is_active: newStatus
      }
    });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al cambiar estado'
    });
  }
});

// ============================================
// OWNERS ROUTES
// ============================================

app.get('/api/admins/owners', authenticateToken, authorize(['admin_general', 'user_general']), (req, res) => {
  try {
    const owners = db.prepare(`
      SELECT 
        u.id, u.first_name, u.last_name, u.username, u.email, u.phone,
        u.role, u.place_id, u.is_active, u.created_at, u.last_login
      FROM users u
      WHERE u.role IN ('admin_general', 'user_general', 'user_place')
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
      data: owners
    });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener propietarios'
    });
  }
});

app.patch('/api/admins/:id/toggle', authenticateToken, authorize(['admin_general']), (req, res) => {
  try {
    const { id } = req.params;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    const newStatus = user.is_active === 1 ? 0 : 1;
    db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(newStatus, id);

    res.json({
      success: true,
      data: {
        message: `Usuario ${newStatus === 1 ? 'activado' : 'desactivado'}`,
        is_active: newStatus
      }
    });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al cambiar estado'
    });
  }
});

app.get('/api/admins/owners/without-place', authenticateToken, authorize(['admin_general']), (req, res) => {
  try {
    const owners = db.prepare(`
      SELECT 
        u.id, u.first_name, u.last_name, u.username, u.email, u.phone,
        u.role, u.is_active, u.created_at
      FROM users u
      WHERE u.role = 'user_place'
      AND (u.place_id IS NULL OR u.place_id NOT IN (SELECT id FROM places WHERE is_active = 1))
      AND u.is_active = 1
      ORDER BY u.created_at DESC
    `).all();

    res.json({
      success: true,
      data: owners
    });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener propietarios sin lugar'
    });
  }
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('🚀 ================================');
  console.log('✅ NOVA APP BACKEND v6.0.0 - LOGS ACTIVADOS');
  console.log('🚀 ================================');
  console.log(`📡 Servidor: http://localhost:${PORT}`);
  console.log(`🗄️  Base de datos: ${dbPath}`);
  console.log(`🔐 JWT Secret: configurado`);
  console.log('🚀 ================================');
  console.log('');
  console.log('✅ Endpoints configurados:');
  console.log('   POST   /login (CON LOGS DETALLADOS)');
  console.log('   GET    /health');
  console.log('   GET    /users');
  console.log('   GET    /places');
  console.log('   GET    /stats/dashboard');
  console.log('   GET    /admin/users');
  console.log('   GET    /api/admins/owners');
  console.log('   PATCH  /api/admins/:id/toggle');
  console.log('   GET    /api/admins/owners/without-place');
  console.log('');
  console.log('✅ Formato de respuesta unificado');
  console.log('✅ Servidor listo');
  console.log('');
});

process.on('SIGINT', () => {
  console.log('\n\n🛑 Cerrando servidor...');
  db.close();
  process.exit(0);
});