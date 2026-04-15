// import-real-data.js
// ============================================================
// Importa los datos reales del otro equipo:
//   - 3 turistas (Julian x3)
//   - 13 escaneos reales (Nov 2025 → Mar 2026)
//   - 13 recompensas (todas canjeadas)
//
// IMPORTANTE: Los IDs de lugares del otro equipo NO coinciden
// con los de la BD actual. Este script hace el mapeo correcto.
//
// Mapeo de IDs (otro equipo → BD actual):
//   PLACE:1 (Hotel Plaza Central)   → busca por nombre en BD actual
//   PLACE:3 (Bar La Terraza)        → busca por nombre en BD actual
//   PLACE:4 (Hotel Costa Azul)      → busca por nombre en BD actual
//   PLACE:6 (mar y sol)             → busca por nombre en BD actual
//
// USO: node import-real-data.js
// ============================================================

require('dotenv').config();
const Database = require('better-sqlite3');
const bcrypt   = require('bcryptjs');
const path     = require('path');

const DB_PATH = process.env.DB_PATH || './nova_app.db';
const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

console.log('\n📦 IMPORTANDO DATOS REALES DEL OTRO EQUIPO');
console.log('='.repeat(55));

try {
  // ── PASO 1: Verificar lugares existentes ──────────────
  console.log('\n📍 Paso 1: Verificando lugares en BD actual...');
  const lugares = db.prepare('SELECT id, name, tipo FROM places WHERE is_active = 1').all();
  console.log(`   ${lugares.length} lugares encontrados:`);
  lugares.forEach(l => console.log(`   ID:${l.id} → ${l.name} (${l.tipo})`));

  // Función para encontrar un lugar por nombre parcial
  const findPlace = (namePart) => {
    const found = lugares.find(l =>
      l.name.toLowerCase().includes(namePart.toLowerCase())
    );
    return found ? found.id : null;
  };

  // Mapeo de lugares del otro equipo a la BD actual
  const placeMap = {
    1: findPlace('Plaza Central') || findPlace('Sol Caribe') || lugares.find(l => l.tipo === 'hotel')?.id,
    3: findPlace('Terraza') || findPlace('Brisa') || lugares.find(l => l.tipo === 'bar')?.id,
    4: findPlace('Costa Azul') || findPlace('Playa Dorada') || lugares.find(l => l.tipo === 'hotel' && l.id !== (findPlace('Plaza Central') || 1))?.id,
    6: findPlace('mar y sol') || findPlace('Mar Azul') || lugares.find(l => l.tipo === 'restaurant')?.id,
  };

  console.log('\n   Mapeo de IDs del otro equipo → BD actual:');
  Object.entries(placeMap).forEach(([old, newId]) => {
    const lugar = lugares.find(l => l.id === newId);
    console.log(`   PLACE:${old} → ID:${newId} (${lugar?.name || 'NO ENCONTRADO'})`);
  });

  // Verificar que todos los lugares fueron mapeados
  const unmapped = Object.entries(placeMap).filter(([, v]) => !v);
  if (unmapped.length > 0) {
    console.log(`\n⚠️  ATENCIÓN: ${unmapped.length} lugares no fueron mapeados.`);
    console.log('   Los escaneos de esos lugares se saltarán.');
  }

  // ── PASO 2: Importar turistas ─────────────────────────
  console.log('\n👥 Paso 2: Importando turistas reales...');

  const turistas = [
    {
      first_name: 'Julian', last_name: 'Álvarez',
      username: 'montesandres654321',
      email: 'montesandres654321@gmail.com',
      google_id: '111225129243883824521',
      password: null, role: null, // turista, sin acceso al panel
      created_at: '2025-11-13 04:10:49',
    },
    {
      first_name: 'julian', last_name: 'Álvarez',
      username: 'julian_jaam',
      email: 'jaam1156@gmail.com',
      password: '$2b$10$eAglRQEDE84K7Rct0EfyGewXq3y8Tty3dtJrUZegHTUDgqX.ws6su',
      phone: '+57 3142325858', dob: '2005-11-12', gender: 'Masculino',
      google_id: null, role: null,
      created_at: '2025-11-13 04:18:50',
    },
    {
      first_name: 'JULIAN', last_name: 'ALVAREZ',
      username: 'alvarezmontesjulian20',
      email: 'alvarezmontesjulian20@gmail.com',
      google_id: '100332674880815939925',
      password: null, role: null,
      created_at: '2025-11-13 14:31:11',
    },
  ];

  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users
      (first_name, last_name, username, email, password, phone, dob, gender,
       google_id, role, place_id, is_active, accepted_terms, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,NULL,NULL,1,1,?)
  `);

  const userIdMap = {}; // email → nuevo id en BD actual

  turistas.forEach(t => {
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(t.email);
    if (existing) {
      console.log(`   ⏭️  ${t.email} ya existe (ID:${existing.id})`);
      userIdMap[t.email] = existing.id;
      return;
    }

    const result = insertUser.run(
      t.first_name, t.last_name, t.username, t.email,
      t.password || null, t.phone || null, t.dob || null, t.gender || null,
      t.google_id || null, t.created_at
    );
    userIdMap[t.email] = result.lastInsertRowid;
    console.log(`   ✅ Turista creado: ${t.email} → ID:${result.lastInsertRowid}`);
  });

  // Mapeo de IDs del otro equipo → IDs en BD actual
  const userEmailMap = {
    2: 'montesandres654321@gmail.com',
    3: 'jaam1156@gmail.com',
    4: 'alvarezmontesjulian20@gmail.com',
  };

  const getUserId = (oldId) => userIdMap[userEmailMap[oldId]];

  // ── PASO 3: Importar escaneos ─────────────────────────
  console.log('\n📱 Paso 3: Importando 13 escaneos reales...');

  const escaneos = [
    { id:1,  user:2, place:1, qr:'PLACE:1', date:'2025-11-13 04:13:50' },
    { id:2,  user:3, place:3, qr:'PLACE:3', date:'2025-11-13 04:20:31' },
    { id:3,  user:4, place:1, qr:'PLACE:1', date:'2025-11-13 15:02:22' },
    { id:4,  user:4, place:3, qr:'PLACE:3', date:'2025-11-13 15:02:48' },
    { id:5,  user:4, place:4, qr:'PLACE:4', date:'2025-11-13 15:03:36' },
    { id:6,  user:4, place:6, qr:'PLACE:6', date:'2025-11-13 15:03:57' },
    { id:7,  user:3, place:4, qr:'PLACE:4', date:'2025-11-13 20:24:09' },
    { id:8,  user:4, place:1, qr:'PLACE:1', date:'2025-11-25 22:21:13' },
    { id:9,  user:4, place:1, qr:'PLACE:1', date:'2025-11-25 22:21:40' },
    { id:10, user:4, place:1, qr:'PLACE:1', date:'2026-03-09 14:20:36' },
    { id:11, user:4, place:1, qr:'PLACE:1', date:'2026-03-13 14:44:57' },
    { id:12, user:4, place:3, qr:'PLACE:3', date:'2026-03-13 14:46:57' },
    { id:13, user:4, place:1, qr:'PLACE:1', date:'2026-03-13 15:30:06' },
  ];

  const insertScan = db.prepare(`
    INSERT INTO scans (user_id, place_id, qr_code, created_at)
    VALUES (?,?,?,?)
  `);

  let scansOk = 0, scansFailed = 0;
  escaneos.forEach(s => {
    const newUserId  = getUserId(s.user);
    const newPlaceId = placeMap[s.place];

    if (!newUserId || !newPlaceId) {
      console.log(`   ⚠️  Escaneo #${s.id} saltado — user:${newUserId} place:${newPlaceId}`);
      scansFailed++;
      return;
    }

    insertScan.run(newUserId, newPlaceId, s.qr, s.date);
    scansOk++;
  });

  console.log(`   ✅ ${scansOk} escaneos importados, ${scansFailed} saltados`);

  // ── PASO 4: Importar recompensas ──────────────────────
  console.log('\n🎁 Paso 4: Importando 13 recompensas reales...');

  const recompensas = [
    { user:2, place:1, name:'Desayuno gratis', desc:'Desayuno buffet', icon:'☕', earned:'2025-11-13 04:13:50', redeemed:'2025-11-13 04:15:14' },
    { user:3, place:3, name:'Copa gratis',     desc:'Una copa de la casa', icon:'🍹', earned:'2025-11-13 04:20:31', redeemed:'2025-11-13 04:21:48' },
    { user:4, place:1, name:'Desayuno gratis', desc:'Desayuno buffet', icon:'☕', earned:'2025-11-13 15:02:22', redeemed:'2025-11-13 20:11:38' },
    { user:4, place:3, name:'Copa gratis',     desc:'Una copa de la casa', icon:'🍹', earned:'2025-11-13 15:02:48', redeemed:'2025-11-13 20:11:56' },
    { user:4, place:4, name:'Masaje gratis',   desc:'Masaje 30 minutos', icon:'💆', earned:'2025-11-13 15:03:36', redeemed:'2025-11-13 20:11:51' },
    { user:4, place:6, name:'cafe',            desc:'delicioso', icon:'☕', earned:'2025-11-13 15:03:57', redeemed:'2025-11-13 20:11:46' },
    { user:3, place:4, name:'Masaje gratis',   desc:'Masaje 30 minutos', icon:'💆', earned:'2025-11-13 20:24:09', redeemed:'2025-11-13 20:25:09' },
    { user:4, place:1, name:'Desayuno gratis', desc:'Desayuno buffet', icon:'☕', earned:'2025-11-13 15:02:22', redeemed:'2025-11-13 20:11:38' },
    { user:4, place:1, name:'Desayuno gratis', desc:'Desayuno buffet', icon:'☕', earned:'2025-11-25 22:21:13', redeemed:'2026-03-09 14:19:28' },
    { user:4, place:1, name:'Desayuno gratis', desc:'Desayuno buffet', icon:'☕', earned:'2026-03-09 14:20:36', redeemed:'2026-03-11 13:46:11' },
    { user:4, place:1, name:'Desayuno gratis', desc:'Desayuno buffet', icon:'☕', earned:'2026-03-13 14:44:57', redeemed:'2026-03-13 14:45:55' },
    { user:4, place:3, name:'Copa gratis',     desc:'Una copa de la casa', icon:'🍹', earned:'2026-03-13 14:46:57', redeemed:'2026-03-13 14:48:12' },
    { user:4, place:1, name:'Desayuno gratis', desc:'Desayuno buffet', icon:'☕', earned:'2026-03-13 15:30:06', redeemed:'2026-03-16 17:37:42' },
  ];

  const insertReward = db.prepare(`
    INSERT INTO user_rewards
      (user_id, place_id, reward_name, reward_description, reward_icon,
       is_redeemed, earned_at, redeemed_at)
    VALUES (?,?,?,?,?,1,?,?)
  `);

  let rewardsOk = 0, rewardsFailed = 0;
  recompensas.forEach(r => {
    const newUserId  = getUserId(r.user);
    const newPlaceId = placeMap[r.place];
    if (!newUserId || !newPlaceId) { rewardsFailed++; return; }
    insertReward.run(newUserId, newPlaceId, r.name, r.desc, r.icon, r.earned, r.redeemed);
    rewardsOk++;
  });

  console.log(`   ✅ ${rewardsOk} recompensas importadas, ${rewardsFailed} saltadas`);

  // ── RESUMEN FINAL ─────────────────────────────────────
  const totals = {
    users:   db.prepare('SELECT COUNT(*) as c FROM users').get().c,
    places:  db.prepare('SELECT COUNT(*) as c FROM places').get().c,
    scans:   db.prepare('SELECT COUNT(*) as c FROM scans').get().c,
    rewards: db.prepare('SELECT COUNT(*) as c FROM user_rewards').get().c,
  };

  console.log('\n' + '='.repeat(55));
  console.log('✅ IMPORTACIÓN COMPLETADA');
  console.log('='.repeat(55));
  console.log(`   👥 Usuarios totales:    ${totals.users}`);
  console.log(`   📍 Lugares:             ${totals.places}`);
  console.log(`   📱 Escaneos:            ${totals.scans}`);
  console.log(`   🎁 Recompensas:         ${totals.rewards}`);
  console.log('\n🚀 Ahora corre: node index.js\n');

} catch (error) {
  console.error('\n❌ Error en importación:', error.message);
  console.error(error.stack);
} finally {
  db.close();
}