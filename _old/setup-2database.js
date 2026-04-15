// setup-database.js
// Script para crear todas las tablas necesarias en nova_app.db

const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const db = new Database('./nova_app.db');

console.log('🔧 Iniciando configuración de base de datos...\n');

// ============================================
// CREAR TABLAS
// ============================================

console.log('📊 Creando tabla users...');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT,
    last_name TEXT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    phone TEXT,
    dob TEXT,
    gender TEXT,
    role TEXT DEFAULT NULL,
    place_id INTEGER,
    is_active INTEGER DEFAULT 1,
    accepted_terms INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    last_login TEXT,
    FOREIGN KEY (place_id) REFERENCES places(id)
  )
`);

console.log('📊 Creando tabla places...');
db.exec(`
  CREATE TABLE IF NOT EXISTS places (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    tipo TEXT NOT NULL,
    lugar TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    rating REAL DEFAULT 0.0,
    address TEXT,
    phone TEXT,
    price_range TEXT,
    amenities TEXT,
    has_reward INTEGER DEFAULT 0,
    reward_name TEXT,
    reward_description TEXT,
    reward_icon TEXT,
    owner_id INTEGER,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (owner_id) REFERENCES users(id)
  )
`);

console.log('📊 Creando tabla scans...');
db.exec(`
  CREATE TABLE IF NOT EXISTS scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    place_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (place_id) REFERENCES places(id)
  )
`);

console.log('📊 Creando tabla user_rewards...');
db.exec(`
  CREATE TABLE IF NOT EXISTS user_rewards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    place_id INTEGER NOT NULL,
    reward_name TEXT NOT NULL,
    reward_description TEXT,
    reward_icon TEXT,
    is_redeemed INTEGER DEFAULT 0,
    earned_at TEXT DEFAULT (datetime('now')),
    redeemed_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (place_id) REFERENCES places(id)
  )
`);

console.log('📊 Creando tabla admin_activity...');
db.exec(`
  CREATE TABLE IF NOT EXISTS admin_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id INTEGER,
    details TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (admin_id) REFERENCES users(id)
  )
`);

// ============================================
// CREAR ÍNDICES
// ============================================

console.log('\n📑 Creando índices...');

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
  CREATE INDEX IF NOT EXISTS idx_users_place_id ON users(place_id);
  
  CREATE INDEX IF NOT EXISTS idx_places_tipo ON places(tipo);
  CREATE INDEX IF NOT EXISTS idx_places_owner_id ON places(owner_id);
  CREATE INDEX IF NOT EXISTS idx_places_is_active ON places(is_active);
  
  CREATE INDEX IF NOT EXISTS idx_scans_user_id ON scans(user_id);
  CREATE INDEX IF NOT EXISTS idx_scans_place_id ON scans(place_id);
  CREATE INDEX IF NOT EXISTS idx_scans_created_at ON scans(created_at);
  
  CREATE INDEX IF NOT EXISTS idx_rewards_user_id ON user_rewards(user_id);
  CREATE INDEX IF NOT EXISTS idx_rewards_place_id ON user_rewards(place_id);
  CREATE INDEX IF NOT EXISTS idx_rewards_redeemed ON user_rewards(is_redeemed);
`);

// ============================================
// CREAR USUARIO ADMIN POR DEFECTO
// ============================================

console.log('\n👤 Creando usuario administrador...');

// Verificar si ya existe un admin
const existingAdmin = db.prepare('SELECT * FROM users WHERE email = ?').get('admin@nova.com');

if (!existingAdmin) {
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  
  db.prepare(`
    INSERT INTO users (
      first_name, last_name, username, email, password,
      role, is_active, accepted_terms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'Admin',
    'Sistema',
    'admin',
    'admin@nova.com',
    hashedPassword,
    'admin_general',
    1,
    1
  );
  
  console.log('✅ Usuario admin creado');
  console.log('   Email: admin@nova.com');
  console.log('   Password: admin123');
} else {
  console.log('ℹ️  Usuario admin ya existe');
}

// ============================================
// CREAR DATOS DE PRUEBA
// ============================================

console.log('\n🏨 Creando lugares de prueba...');

const placesCount = db.prepare('SELECT COUNT(*) as count FROM places').get();

if (placesCount.count === 0) {
  const places = [
    {
      name: 'Hotel Sol Caribe',
      tipo: 'hotel',
      lugar: 'Coveñas',
      description: 'Hermoso hotel frente al mar',
      rating: 4.5,
      amenities: JSON.stringify(['WiFi', 'Piscina', 'Restaurante']),
      has_reward: 1,
      reward_name: '10% de descuento',
      reward_icon: '🎁'
    },
    {
      name: 'Restaurante Mar Azul',
      tipo: 'restaurant',
      lugar: 'Coveñas',
      description: 'Comida típica del caribe',
      rating: 4.7,
      amenities: JSON.stringify(['WiFi', 'Aire Acondicionado']),
      has_reward: 1,
      reward_name: 'Postre gratis',
      reward_icon: '🍰'
    },
    {
      name: 'Bar Tropical',
      tipo: 'bar',
      lugar: 'Tolú',
      description: 'Cocteles y música en vivo',
      rating: 4.3,
      amenities: JSON.stringify(['WiFi', 'Música en vivo']),
      has_reward: 1,
      reward_name: '2x1 en cocteles',
      reward_icon: '🍹'
    }
  ];
  
  const insertPlace = db.prepare(`
    INSERT INTO places (
      name, tipo, lugar, description, rating, amenities,
      has_reward, reward_name, reward_icon
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  places.forEach(place => {
    insertPlace.run(
      place.name,
      place.tipo,
      place.lugar,
      place.description,
      place.rating,
      place.amenities,
      place.has_reward,
      place.reward_name,
      place.reward_icon
    );
  });
  
  console.log(`✅ ${places.length} lugares creados`);
} else {
  console.log(`ℹ️  Ya existen ${placesCount.count} lugares`);
}

// ============================================
// VERIFICACIÓN FINAL
// ============================================

console.log('\n🔍 Verificando estructura...');

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('📋 Tablas creadas:', tables.map(t => t.name).join(', '));

const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
const placeCount = db.prepare('SELECT COUNT(*) as count FROM places').get();

console.log('\n📊 Resumen:');
console.log(`   Usuarios: ${userCount.count}`);
console.log(`   Lugares: ${placeCount.count}`);

// Cerrar conexión
db.close();

console.log('\n✅ ¡Configuración completada exitosamente!\n');
console.log('🔐 Credenciales de acceso:');
console.log('   Email: admin@nova.com');
console.log('   Password: admin123\n');