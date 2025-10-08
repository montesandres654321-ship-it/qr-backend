const express = require("express");
const bodyParser = require("body-parser");
const Database = require("better-sqlite3");
const QRCode = require("qrcode");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcryptjs");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// DB
const db = new Database(path.join(__dirname, "scans.db"));

// ==================== INICIALIZACIÓN BD MEJORADA ====================
function initializeDatabase() {
  try {
    console.log('🔄 Inicializando base de datos...');
    
    // ELIMINAR TABLAS EXISTENTES PARA RECREARLAS (COMENTA ESTO SI QUIERES MANTENER DATOS)
    try {
      db.prepare("DROP TABLE IF EXISTS scans").run();
      db.prepare("DROP TABLE IF EXISTS users").run();
      db.prepare("DROP TABLE IF EXISTS places").run();
      console.log('🗑️ Tablas existentes eliminadas');
    } catch (error) {
      console.log('ℹ️ No hay tablas existentes para eliminar');
    }

    // Crear tabla users CON TODAS LAS COLUMNAS NECESARIAS
    console.log('📝 Creando tabla users...');
    db.prepare(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT,
        last_name TEXT,
        username TEXT UNIQUE,
        email TEXT UNIQUE,
        password TEXT,
        dob TEXT,
        gender TEXT,
        phone TEXT,
        accepted_terms INTEGER DEFAULT 0,
        google_uid TEXT UNIQUE,
        google_photo_url TEXT,
        auth_provider TEXT DEFAULT 'email',
        created_at DATETIME DEFAULT (datetime('now','localtime'))
      )
    `).run();
    console.log('✅ Tabla users creada');

    // Crear tabla places
    console.log('📝 Creando tabla places...');
    db.prepare(`
      CREATE TABLE places (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lugar TEXT NOT NULL,
        tipo TEXT NOT NULL,
        name TEXT NOT NULL
      )
    `).run();
    console.log('✅ Tabla places creada');

    // Crear tabla scans
    console.log('📝 Creando tabla scans...');
    db.prepare(`
      CREATE TABLE scans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        place_id INTEGER NOT NULL,
        qrCode TEXT,
        timestamp INTEGER,
        created_at DATETIME DEFAULT (datetime('now','localtime')),
        FOREIGN KEY(place_id) REFERENCES places(id)
      )
    `).run();
    console.log('✅ Tabla scans creada');

    // Insertar datos de ejemplo en places
    console.log('📝 Insertando datos de ejemplo...');
    const placeCount = db.prepare("SELECT COUNT(*) as count FROM places").get();
    if (placeCount.count === 0) {
      const seed = db.prepare("INSERT INTO places (id, lugar, tipo, name) VALUES (?, ?, ?, ?)");
      
      const samplePlaces = [
        [1, "Coveñas", "hotel", "Hotel Sol Caribe"],
        [2, "Coveñas", "restaurant", "Restaurante Mar Azul"],
        [3, "Coveñas", "bar", "Bar Arena Blanca"],
        [4, "Santiago de Tolú", "hotel", "Hotel Playa Azul"],
        [5, "Santiago de Tolú", "restaurant", "Restaurante Tropical"],
        [6, "Santiago de Tolú", "bar", "Bar El Faro"],
        [7, "San Antero", "hotel", "Hotel Costa Verde"],
        [8, "San Antero", "restaurant", "Restaurante El Pescador"],
        [9, "San Antero", "bar", "Bar La Ola"],
        [10, "San Bernardo del Viento", "hotel", "Hotel Brisas del Mar"],
        [11, "San Bernardo del Viento", "restaurant", "Restaurante Coral"],
        [12, "San Bernardo del Viento", "bar", "Bar Arena Dorada"],
        [13, "Moñitos", "hotel", "Hotel Paraíso"],
        [14, "Moñitos", "restaurant", "Restaurante Bahía"],
        [15, "Moñitos", "bar", "Bar Sunset"],
        [16, "San Bernardo e Isla Fuerte", "hotel", "Hotel Isla Fuerte"],
        [17, "San Bernardo e Isla Fuerte", "restaurant", "Restaurante Mar de Plata"],
        [18, "San Bernardo e Isla Fuerte", "bar", "Bar Caribeño"]
      ];
      
      samplePlaces.forEach(place => seed.run(...place));
      console.log("✅ " + samplePlaces.length + " lugares de ejemplo insertados");
    }

    // Verificar la estructura final
    console.log('🔍 Verificando estructura final...');
    const usersColumns = db.prepare("PRAGMA table_info(users)").all();
    console.log('📋 Columnas de users:', usersColumns.map(col => col.name));
    
    console.log('🎉 Base de datos inicializada correctamente');

  } catch (error) {
    console.error('❌ Error crítico inicializando la base de datos:', error);
    throw error;
  }
}

// ==================== ENDPOINTS ====================

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ 
    success: true, 
    message: "✅ API funcionando correctamente",
    timestamp: new Date().toISOString(),
    database: "SQLite"
  });
});

// Listar lugares
app.get("/places", (req, res) => {
  try {
    const rows = db.prepare("SELECT id, lugar, tipo, name FROM places ORDER BY id").all();
    res.json({ success: true, places: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Generar QR para un lugar
app.get("/generate/:placeId", async (req, res) => {
  try {
    const placeId = parseInt(req.params.placeId, 10);
    const place = db.prepare("SELECT * FROM places WHERE id = ?").get(placeId);
    
    if (!place) {
      return res.status(404).json({ success: false, error: "Lugar no encontrado" });
    }

    const payload = `PLACE:${placeId}`;
    const buffer = await QRCode.toBuffer(payload, { 
      type: "png", 
      width: 400
    });
    
    res.set("Content-Type", "image/png");
    res.send(buffer);
  } catch (error) {
    console.error("Error generando QR:", error);
    res.status(500).json({ success: false, error: "Error al generar QR" });
  }
});

// Registrar usuario
app.post("/users/register", (req, res) => {
  try {
    const {
      firstName = "",
      lastName = "",
      username = "",
      email = "",
      password = "",
      dob = "",
      gender = "",
      phone = "",
      accepted_terms = 0,
    } = req.body;

    console.log('📥 Registro de usuario:', { username, email });

    if (!username || !email || !password) {
      return res.status(400).json({ success: false, error: "username, email y password son requeridos" });
    }

    // Verificar si el correo ya existe
    const existingEmail = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (existingEmail) {
      return res.status(400).json({ success: false, error: "El correo ya está en uso" });
    }

    // Verificar si el username ya existe
    const existingUsername = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
    if (existingUsername) {
      return res.status(400).json({ success: false, error: "El nombre de usuario ya existe" });
    }

    const hashed = bcrypt.hashSync(password, 10);
    const info = db.prepare(`
      INSERT INTO users (first_name, last_name, username, email, password, dob, gender, phone, accepted_terms, auth_provider)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'email')
    `).run(firstName, lastName, username, email, hashed, dob, gender, phone, accepted_terms ? 1 : 0);

    const user = db.prepare(`
      SELECT id, first_name, last_name, username, email, dob, gender, phone, accepted_terms, auth_provider, created_at 
      FROM users WHERE id = ?
    `).get(info.lastInsertRowid);
    
    console.log('✅ Usuario registrado:', user.id);
    res.json({ success: true, user });
  } catch (error) {
    console.error("Error en registro:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Login tradicional
app.post("/users/login", (req, res) => {
  try {
    const { email = "", password = "" } = req.body;
    
    console.log('📥 Login attempt:', email);

    if (!email || !password) {
      return res.status(400).json({ success: false, error: "email y password son requeridos" });
    }

    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ success: false, error: "Usuario / contraseña inválidos" });
    }

    // Eliminar password del response
    const { password: _, ...userWithoutPassword } = user;
    
    console.log('✅ Login exitoso:', user.email);
    res.json({ success: true, user: userWithoutPassword });
  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ AUTENTICACIÓN CON GOOGLE - COMPLETAMENTE FUNCIONAL
app.post("/users/google-auth", (req, res) => {
  try {
    const { uid, google_uid, email, name, photoUrl } = req.body;
    
    console.log('📥 Datos recibidos de Google:', { uid, google_uid, email, name });
    
    // ✅ ACEPTAR TANTO uid COMO google_uid
    const googleUid = google_uid || uid;
    
    if (!googleUid || !email) {
      return res.status(400).json({ 
        success: false, 
        error: "google_uid/uid y email son requeridos" 
      });
    }

    // Buscar usuario por email o uid de Google
    let user = db.prepare("SELECT * FROM users WHERE email = ? OR google_uid = ?").get(email, googleUid);
    
    console.log('👤 Usuario encontrado:', user ? `Sí (ID: ${user.id})` : 'No');
    
    if (!user) {
      // Crear nuevo usuario con Google
      const names = name ? name.split(' ') : ['', ''];
      const firstName = names[0] || '';
      const lastName = names.length > 1 ? names.slice(1).join(' ') : '';
      const username = email.split('@')[0] + '_google';
      
      // Verificar que el username no exista
      let finalUsername = username;
      let counter = 1;
      while (db.prepare("SELECT id FROM users WHERE username = ?").get(finalUsername)) {
        finalUsername = `${username}${counter}`;
        counter++;
      }

      console.log('🆕 Creando nuevo usuario Google:', finalUsername);
      
      const info = db.prepare(`
        INSERT INTO users (first_name, last_name, username, email, google_uid, google_photo_url, auth_provider)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(firstName, lastName, finalUsername, email, googleUid, photoUrl, 'google');
      
      user = db.prepare(`
        SELECT id, first_name, last_name, username, email, google_photo_url, auth_provider, created_at 
        FROM users WHERE id = ?
      `).get(info.lastInsertRowid);
      
      console.log('✅ Nuevo usuario Google creado:', user.id);
    } else {
      // Actualizar datos de Google si el usuario ya existe
      console.log('🔄 Actualizando usuario existente:', user.id);
      db.prepare(`
        UPDATE users SET google_uid = ?, google_photo_url = ?, auth_provider = ? WHERE id = ?
      `).run(googleUid, photoUrl, 'google', user.id);
      
      // Obtener usuario actualizado
      user = db.prepare(`
        SELECT id, first_name, last_name, username, email, google_photo_url, auth_provider, created_at 
        FROM users WHERE id = ?
      `).get(user.id);
    }

    // Eliminar password del response por seguridad
    const { password, ...userWithoutPassword } = user;
    
    console.log('✅ Login Google exitoso para:', user.email);
    
    res.json({ 
      success: true, 
      user: userWithoutPassword,
      message: `Bienvenido ${user.first_name || user.username}`
    });
    
  } catch (error) {
    console.error("❌ Error en google-auth:", error);
    
    // Manejar error de duplicado único
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ 
        success: false, 
        error: "El correo ya está registrado con otro método de autenticación" 
      });
    }
    
    res.status(500).json({ success: false, error: error.message });
  }
});

// Actualizar perfil de usuario
app.put("/users/update/:id", (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const {
      first_name = "",
      last_name = "",
      username = "",
      email = "",
      phone = ""
    } = req.body;

    console.log('📥 Actualizando perfil usuario:', userId);

    // Verificar que el usuario existe
    const existingUser = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
    if (!existingUser) {
      return res.status(404).json({ success: false, error: "Usuario no encontrado" });
    }

    // Verificar si el username ya existe en otro usuario
    const existingUsername = db.prepare("SELECT id FROM users WHERE username = ? AND id != ?").get(username, userId);
    if (existingUsername) {
      return res.status(400).json({ success: false, error: "El nombre de usuario ya está en uso" });
    }

    // Verificar si el email ya existe en otro usuario
    const existingEmail = db.prepare("SELECT id FROM users WHERE email = ? AND id != ?").get(email, userId);
    if (existingEmail) {
      return res.status(400).json({ success: false, error: "El correo ya está en uso" });
    }

    // Actualizar usuario
    db.prepare(`
      UPDATE users 
      SET first_name = ?, last_name = ?, username = ?, email = ?, phone = ?
      WHERE id = ?
    `).run(first_name, last_name, username, email, phone, userId);

    // Obtener usuario actualizado
    const updatedUser = db.prepare(`
      SELECT id, first_name, last_name, username, email, dob, gender, phone, accepted_terms, auth_provider, created_at 
      FROM users WHERE id = ?
    `).get(userId);

    console.log('✅ Perfil actualizado:', userId);
    res.json(updatedUser);

  } catch (error) {
    console.error("Error actualizando usuario:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Cambiar contraseña
app.post("/users/change-password", (req, res) => {
  try {
    const { userId, oldPassword, newPassword } = req.body;

    console.log('📥 Cambio de contraseña usuario:', userId);

    if (!userId || !oldPassword || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        error: "userId, oldPassword y newPassword son requeridos" 
      });
    }

    // Verificar que el usuario existe
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: "Usuario no encontrado" });
    }

    // Verificar que no sea usuario de Google
    if (user.auth_provider === 'google') {
      return res.status(400).json({ 
        success: false, 
        error: "Los usuarios de Google no pueden cambiar contraseña desde aquí" 
      });
    }

    // Verificar contraseña actual
    if (!bcrypt.compareSync(oldPassword, user.password)) {
      return res.status(401).json({ success: false, error: "Contraseña actual incorrecta" });
    }

    // Validar nueva contraseña
    if (newPassword.length < 6) {
      return res.status(400).json({ 
        success: false, 
        error: "La nueva contraseña debe tener al menos 6 caracteres" 
      });
    }

    // Hashear y actualizar nueva contraseña
    const newHashedPassword = bcrypt.hashSync(newPassword, 10);
    db.prepare("UPDATE users SET password = ? WHERE id = ?").run(newHashedPassword, userId);

    console.log('✅ Contraseña actualizada usuario:', userId);
    res.json({ 
      success: true, 
      message: "Contraseña actualizada correctamente" 
    });

  } catch (error) {
    console.error("Error cambiando contraseña:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Registrar escaneo
app.post("/scan", (req, res) => {
  try {
    const { userId, placeId, qrCode } = req.body;
    
    console.log('📥 Registro de escaneo:', { userId, placeId });

    if (!userId || !placeId || !qrCode) {
      return res.status(400).json({ success: false, error: "userId, placeId y qrCode son requeridos" });
    }

    // Verificar que el lugar existe
    const place = db.prepare("SELECT id, lugar, tipo, name FROM places WHERE id = ?").get(placeId);
    if (!place) {
      return res.status(404).json({ success: false, error: "Lugar no encontrado" });
    }

    const info = db.prepare(`
      INSERT INTO scans (user_id, place_id, qrCode, timestamp) 
      VALUES (?, ?, ?, ?)
    `).run(userId, placeId, qrCode, Date.now());

    const countRow = db.prepare("SELECT COUNT(*) as total FROM scans WHERE place_id = ?").get(placeId);

    console.log('✅ Escaneo registrado:', info.lastInsertRowid);
    res.json({
      success: true,
      scanId: info.lastInsertRowid,
      place: place,
      totalScans: countRow.total,
      message: `Escaneo registrado para ${place.name} en ${place.lugar}`
    });

  } catch (error) {
    console.error("Error registrando escaneo:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ CORREGIDO: Listar escaneos por usuario específico
app.get("/scans/details/:userId", (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    
    console.log('📊 Solicitando escaneos para usuario:', userId);

    if (!userId || isNaN(userId)) {
      return res.status(400).json({ success: false, error: "ID de usuario inválido" });
    }

    const rows = db.prepare(`
      SELECT 
        s.id AS scan_id,
        u.id AS user_id,
        u.first_name || ' ' || u.last_name AS nombre,
        u.email,
        p.lugar,
        p.tipo,
        p.name AS local,
        s.created_at
      FROM scans s
      JOIN users u ON s.user_id = u.id
      JOIN places p ON s.place_id = p.id
      WHERE s.user_id = ?
      ORDER BY s.id DESC
    `).all(userId);

    console.log('📊 Enviando historial de escaneos para usuario', userId + ':', rows.length, 'registros');
    res.json({ success: true, scans: rows });
  } catch (error) {
    console.error("Error en /scans/details/:userId:", error);
    res.status(500).json({ success: false, error: "Error al obtener los detalles de los escaneos" });
  }
});

// ✅ MANTENER endpoint original para compatibilidad (opcional)
app.get("/scans/details", (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT 
        s.id AS scan_id,
        u.id AS user_id,
        u.first_name || ' ' || u.last_name AS nombre,
        u.email,
        p.lugar,
        p.tipo,
        p.name AS local,
        s.created_at
      FROM scans s
      JOIN users u ON s.user_id = u.id
      JOIN places p ON s.place_id = p.id
      ORDER BY s.id DESC
    `).all();

    console.log('📊 Enviando historial completo de escaneos:', rows.length, 'registros');
    res.json({ success: true, scans: rows });
  } catch (error) {
    console.error("Error en /scans/details:", error);
    res.status(500).json({ success: false, error: "Error al obtener los detalles de los escaneos" });
  }
});

// ==================== INICIAR SERVIDOR ====================
initializeDatabase();

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🚀 Backend ejecutándose en http://localhost:${PORT}`);
  console.log(`📍 Endpoints disponibles:`);
  console.log(`   GET  /health - Verificar estado`);
  console.log(`   GET  /places - Listar lugares`);
  console.log(`   GET  /generate/:id - Generar QR`);
  console.log(`   POST /users/register - Registrar usuario`);
  console.log(`   POST /users/login - Login tradicional`);
  console.log(`   POST /users/google-auth - Login con Google ✅`);
  console.log(`   PUT  /users/update/:id - Actualizar perfil`);
  console.log(`   POST /users/change-password - Cambiar contraseña`);
  console.log(`   POST /scan - Registrar escaneo`);
  console.log(`   GET  /scans/details/:userId - Historial escaneos por usuario ✅`);
  console.log(`   GET  /scans/details - Historial completo (todos los usuarios)`);
  console.log(`\n🔧 CORRECCIONES IMPLEMENTADAS:`);
  console.log(`   ✅ Escaneos filtrados por usuario`);
  console.log(`   ✅ Protección cambio contraseña para Google`);
  console.log(`   ✅ Endpoint específico por usuario: /scans/details/:userId`);
});