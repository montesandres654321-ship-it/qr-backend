// setup-database.js
// ============================================================
// NOVA APP — Configuración de Base de Datos
// ============================================================
// MODOS DE USO:
//
//   node setup-database.js            → recrea la BD desde cero (⚠️ borra datos)
//   node setup-database.js --preserve → mantiene datos existentes, solo agrega
//                                       columnas faltantes y verifica estructura
//
// SIEMPRE usar --preserve si ya tienes datos reales.
// ============================================================

require('dotenv').config();
const Database = require('better-sqlite3');
const bcrypt   = require('bcryptjs');
const fs       = require('fs');
const path     = require('path');

const DB_PATH  = process.env.DB_PATH || './nova_app.db';
const PRESERVE = process.argv.includes('--preserve');

console.log('\n🔨 NOVA APP — Configuración de Base de Datos');
console.log('='.repeat(55));
console.log(`📁 Ruta: ${path.resolve(DB_PATH)}`);
console.log(`🔒 Modo: ${PRESERVE ? 'PRESERVE (conserva datos)' : 'FRESH (crea desde cero)'}`);
console.log('='.repeat(55));

// ── Confirmar borrado si no es --preserve ─────────────────
if (!PRESERVE && fs.existsSync(DB_PATH)) {
  console.log('\n⚠️  ADVERTENCIA: Vas a eliminar la base de datos existente.');
  console.log('   Si quieres conservar los datos usa: node setup-database.js --preserve');
  console.log('   Continuando en 3 segundos... (Ctrl+C para cancelar)\n');
  const start = Date.now();
  while (Date.now() - start < 3000) { /* esperar */ }
  fs.unlinkSync(DB_PATH);
  console.log('🗑️  Base de datos anterior eliminada\n');
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

// ── CREAR O ACTUALIZAR TABLAS ─────────────────────────────
console.log('\n📊 Verificando tablas...\n');

// ── Tabla users ───────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name     TEXT,
    last_name      TEXT,
    username       TEXT    UNIQUE NOT NULL,
    email          TEXT    UNIQUE NOT NULL,
    password       TEXT,
    phone          TEXT,
    dob            TEXT,
    gender         TEXT,
    google_id      TEXT    UNIQUE,
    accepted_terms INTEGER DEFAULT 0,
    is_active      INTEGER DEFAULT 1,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login     DATETIME,
    role           TEXT    DEFAULT NULL,
    place_id       INTEGER DEFAULT NULL
  )
`);

const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);

if (!userCols.includes('role')) {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT NULL");
  console.log('   ✅ Columna role agregada a users');
} else {
  console.log('   ✓  users.role ya existe');
}

if (!userCols.includes('place_id')) {
  db.exec("ALTER TABLE users ADD COLUMN place_id INTEGER DEFAULT NULL");
  console.log('   ✅ Columna place_id agregada a users');
} else {
  console.log('   ✓  users.place_id ya existe');
}

if (!userCols.includes('google_id')) {
  db.exec("ALTER TABLE users ADD COLUMN google_id TEXT");
  console.log('   ✅ Columna google_id agregada a users');
} else {
  console.log('   ✓  users.google_id ya existe');
}

// ── Tabla places ──────────────────────────────────────────
// reward_stock: NULL = ilimitado, número = máximo de recompensas a otorgar
db.exec(`
  CREATE TABLE IF NOT EXISTS places (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    name                TEXT    NOT NULL,
    tipo                TEXT    NOT NULL CHECK(tipo IN ('hotel','restaurant','bar')),
    lugar               TEXT    NOT NULL,
    description         TEXT    NOT NULL,
    image_url           TEXT,
    rating              REAL    DEFAULT 0.0,
    address             TEXT,
    phone               TEXT,
    price_range         TEXT,
    amenities           TEXT,
    is_active           INTEGER DEFAULT 1,
    has_reward          INTEGER DEFAULT 0,
    reward_name         TEXT,
    reward_description  TEXT,
    reward_icon         TEXT    DEFAULT '🎁',
    reward_stock        INTEGER DEFAULT NULL,
    owner_id            INTEGER DEFAULT NULL,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

const placeCols = db.prepare("PRAGMA table_info(places)").all().map(c => c.name);

if (!placeCols.includes('owner_id')) {
  db.exec("ALTER TABLE places ADD COLUMN owner_id INTEGER DEFAULT NULL");
  console.log('   ✅ Columna owner_id agregada a places');
} else {
  console.log('   ✓  places.owner_id ya existe');
}

if (!placeCols.includes('updated_at')) {
  db.exec("ALTER TABLE places ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP");
  console.log('   ✅ Columna updated_at agregada a places');
} else {
  console.log('   ✓  places.updated_at ya existe');
}

// ── NUEVO: reward_stock ───────────────────────────────────
if (!placeCols.includes('reward_stock')) {
  db.exec("ALTER TABLE places ADD COLUMN reward_stock INTEGER DEFAULT NULL");
  console.log('   ✅ Columna reward_stock agregada a places (NULL = ilimitado)');
} else {
  console.log('   ✓  places.reward_stock ya existe');
}

// ── Tabla scans ───────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS scans (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    place_id   INTEGER NOT NULL,
    qr_code    TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE,
    FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE
  )
`);
console.log('   ✓  scans OK');

// ── Tabla user_rewards ────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS user_rewards (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id            INTEGER NOT NULL,
    place_id           INTEGER NOT NULL,
    reward_name        TEXT    NOT NULL,
    reward_description TEXT,
    reward_icon        TEXT    DEFAULT '🎁',
    is_redeemed        INTEGER DEFAULT 0,
    earned_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    redeemed_at        DATETIME,
    FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE,
    FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE
  )
`);
console.log('   ✓  user_rewards OK');

// ── Tabla admin_activity ──────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS admin_activity (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id    INTEGER NOT NULL,
    action      TEXT    NOT NULL,
    target_type TEXT,
    target_id   INTEGER,
    details     TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);
console.log('   ✓  admin_activity OK');

// ── ÍNDICES ───────────────────────────────────────────────
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  CREATE INDEX IF NOT EXISTS idx_users_role     ON users(role);
  CREATE INDEX IF NOT EXISTS idx_users_place_id ON users(place_id);
  CREATE INDEX IF NOT EXISTS idx_places_tipo    ON places(tipo);
  CREATE INDEX IF NOT EXISTS idx_places_active  ON places(is_active);
  CREATE INDEX IF NOT EXISTS idx_places_owner   ON places(owner_id);
  CREATE INDEX IF NOT EXISTS idx_scans_user     ON scans(user_id);
  CREATE INDEX IF NOT EXISTS idx_scans_place    ON scans(place_id);
  CREATE INDEX IF NOT EXISTS idx_scans_date     ON scans(created_at);
  CREATE INDEX IF NOT EXISTS idx_rewards_user   ON user_rewards(user_id);
  CREATE INDEX IF NOT EXISTS idx_rewards_place  ON user_rewards(place_id);
`);
console.log('   ✓  índices OK');

// ── ADMIN ─────────────────────────────────────────────────
console.log('\n👤 Verificando usuario administrador...\n');

const existingAdmin = db.prepare("SELECT * FROM users WHERE email = 'admin@nova.com'").get();

if (existingAdmin) {
  db.prepare("UPDATE users SET role = 'admin_general', place_id = NULL WHERE email = 'admin@nova.com'").run();
  console.log('   ✓  Admin existente — rol verificado (admin_general)');

  if (!PRESERVE) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare("UPDATE users SET password = ? WHERE email = 'admin@nova.com'").run(hash);
    console.log('   ✅ Contraseña reseteada a: admin123');
  }
} else {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare(`
    INSERT INTO users (first_name, last_name, username, email, password, role, is_active, accepted_terms)
    VALUES (?, ?, ?, ?, ?, ?, 1, 1)
  `).run('Admin', 'Sistema', 'admin', 'admin@nova.com', hash, 'admin_general');
  console.log('   ✅ Admin creado: admin@nova.com / admin123 (rol: admin_general)');
}

// ── DATOS DE EJEMPLO (solo si places está vacía) ──────────
const placesCount = db.prepare('SELECT COUNT(*) as c FROM places').get().c;

if (placesCount === 0) {
  console.log('\n🏨 Creando lugares del Golfo de Morrosquillo...\n');

  const insert = db.prepare(`
    INSERT INTO places (name, tipo, lugar, description, image_url, rating,
      address, phone, price_range, amenities, has_reward, reward_name,
      reward_description, reward_icon, reward_stock)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const lugares = [
    ['Hotel Sol Caribe',       'hotel',      'Coveñas',    'Hotel frente al mar con piscina y vista al Golfo',        'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400', 4.5, 'Av. Principal #123, Coveñas',    '+57 300 111 2233', '$$$',  '["WiFi","Piscina","Restaurante","Spa"]',          1, 'Desayuno gratis',  'Desayuno buffet para 2 personas', '☕', 50],
    ['Restaurante Mar Azul',   'restaurant', 'Tolú',       'Mariscos frescos del Golfo con vista al malecón',         'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400', 4.8, 'Malecón Turístico #56, Tolú',     '+57 300 222 3344', '$$',   '["Terraza","Vista al Mar","WiFi","Bar"]',          1, 'Postre gratis',    'Postre del día de cortesía',      '🍰', 30],
    ['Bar La Brisa',           'bar',        'Coveñas',    'Cocteles artesanales con música en vivo',                 'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=400', 4.3, 'Calle del Mar #8, Coveñas',       '+57 300 333 4455', '$$',   '["Música en Vivo","Terraza","Happy Hour"]',        1, 'Coctel gratis',    'Un coctel de la casa',            '🍹', 40],
    ['Hotel Playa Dorada',     'hotel',      'San Onofre', 'Hotel boutique en la playa con servicio personalizado',   'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=400', 4.6, 'Playa Rincón del Mar, San Onofre','+57 300 444 5566', '$$$',  '["Playa Privada","WiFi","Restaurante","Tours"]',   1, '10% de descuento', 'Descuento en próxima estadía',    '💰', null],
    ['El Corral del Golfo',    'restaurant', 'Coveñas',    'Gastronomía tradicional del Caribe colombiano',           'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400', 4.7, 'Carrera 5 #12-40, Coveñas',       '+57 300 555 6677', '$$',   '["WiFi","Aire Acondicionado","Parqueadero"]',      1, 'Bebida gratis',    'Agua o jugo de cortesía',         '🥤', 60],
    ['Hotel Náutico',          'hotel',      'Tolú',       'Hotel de lujo con marina y deportes acuáticos',           'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400', 4.7, 'Puerto Náutico s/n, Tolú',        '+57 300 666 7788', '$$$$', '["Marina","WiFi","Spa","Restaurante","Gym"]',      1, 'Tour acuático',    'Tour en lancha por el Golfo',     '⛵', 20],
    ['Restaurante La Bahía',   'restaurant', 'San Onofre', 'Cocina de mar con recetas ancestrales de Rincón del Mar', 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400', 4.6, 'Rincón del Mar, San Onofre',      '+57 300 777 8899', '$$',   '["Vista al Mar","WiFi","Música Vallenata"]',       1, 'Ceviche gratis',   'Ceviche de camarón de la casa',   '🦐', 35],
    ['Bar Puesta del Sol',     'bar',        'Tolú',       'El mejor lugar para ver el atardecer en el Golfo',        'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=400', 4.4, 'Malecón de Tolú, frente al mar',  '+57 300 888 9900', '$$',   '["Terraza","Vista al Golfo","Cocteles"]',          1, 'Shot gratis',      'Un shot de cortesía al atardecer','🌅', 45],
  ];

  lugares.forEach(l => insert.run(...l));
  console.log(`   ✅ ${lugares.length} lugares del Golfo creados`);
} else {
  console.log(`\n   ℹ️  Ya existen ${placesCount} lugares — no se crean nuevos`);
}

// ── VERIFICACIÓN FINAL ────────────────────────────────────
const counts = {
  users:   db.prepare('SELECT COUNT(*) as c FROM users').get().c,
  places:  db.prepare('SELECT COUNT(*) as c FROM places').get().c,
  scans:   db.prepare('SELECT COUNT(*) as c FROM scans').get().c,
  rewards: db.prepare('SELECT COUNT(*) as c FROM user_rewards').get().c,
};

const adminCheck  = db.prepare("SELECT id, email, role FROM users WHERE email = 'admin@nova.com'").get();
const colsNow     = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
const placeColsNow = db.prepare("PRAGMA table_info(places)").all().map(c => c.name);

console.log('\n' + '='.repeat(55));
console.log('✅ BASE DE DATOS LISTA');
console.log('='.repeat(55));
console.log(`\n📊 Registros:`);
console.log(`   👥 Usuarios:    ${counts.users}`);
console.log(`   🏨 Lugares:     ${counts.places}`);
console.log(`   📱 Escaneos:    ${counts.scans}`);
console.log(`   🎁 Recompensas: ${counts.rewards}`);
console.log(`\n🔍 Columnas críticas en users:`);
console.log(`   role         → ${colsNow.includes('role')     ? '✅ existe' : '❌ FALTA'}`);
console.log(`   place_id     → ${colsNow.includes('place_id') ? '✅ existe' : '❌ FALTA'}`);
console.log(`\n🔍 Columnas críticas en places:`);
console.log(`   owner_id     → ${placeColsNow.includes('owner_id')     ? '✅ existe' : '❌ FALTA'}`);
console.log(`   reward_stock → ${placeColsNow.includes('reward_stock') ? '✅ existe' : '❌ FALTA'}`);
console.log(`\n👤 Admin:`);
console.log(`   Email: admin@nova.com`);
console.log(`   Role:  ${adminCheck?.role || '❌ SIN ROL'}`);
console.log(`\n🚀 Siguiente paso: node index.js`);
console.log('='.repeat(55) + '\n');

db.close();