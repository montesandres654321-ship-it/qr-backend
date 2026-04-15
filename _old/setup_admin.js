// setup_admin.js - Script para configurar el sistema de roles y admin

const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs'); // ✅ Tu proyecto usa bcryptjs, no bcrypt

const DB_PATH = './nova_app.db';

console.log('🚀 CONFIGURACIÓN DE SISTEMA DE ROLES Y ADMIN\n');
console.log('=' .repeat(80));

const db = new Database(DB_PATH);

try {
  // ============================================
  // 1. VERIFICAR ESTRUCTURA ACTUAL
  // ============================================
  console.log('\n📋 PASO 1: Verificando estructura de tabla users...\n');
  
  const columns = db.prepare("PRAGMA table_info(users)").all();
  const hasRole = columns.some(col => col.name === 'role');
  const hasPlaceId = columns.some(col => col.name === 'place_id');

  console.log('Columnas actuales:');
  columns.forEach(col => {
    const marker = (col.name === 'role' || col.name === 'place_id') ? '✅' : '  ';
    console.log(`   ${marker} ${col.name} (${col.type})`);
  });

  // ============================================
  // 2. AGREGAR COLUMNAS SI NO EXISTEN
  // ============================================
  console.log('\n📋 PASO 2: Agregando columnas necesarias...\n');

  if (!hasRole) {
    console.log('   ➕ Agregando columna "role"...');
    db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user_place'");
    console.log('   ✅ Columna "role" agregada');
  } else {
    console.log('   ℹ️  Columna "role" ya existe');
  }

  if (!hasPlaceId) {
    console.log('   ➕ Agregando columna "place_id"...');
    db.exec("ALTER TABLE users ADD COLUMN place_id INTEGER DEFAULT NULL");
    console.log('   ✅ Columna "place_id" agregada');
  } else {
    console.log('   ℹ️  Columna "place_id" ya existe');
  }

  // ============================================
  // 3. CREAR ÍNDICES
  // ============================================
  console.log('\n📋 PASO 3: Creando índices para rendimiento...\n');
  
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_users_place_id ON users(place_id);
  `);
  console.log('   ✅ Índices creados');

  // ============================================
  // 4. BUSCAR O CREAR ADMIN
  // ============================================
  console.log('\n📋 PASO 4: Configurando usuario administrador...\n');

  // Buscar admin existente
  let admin = db.prepare("SELECT * FROM users WHERE email = 'admin@nova.com'").get();

  if (admin) {
    console.log('   ℹ️  Admin existente encontrado:');
    console.log(`      - ID: ${admin.id}`);
    console.log(`      - Email: ${admin.email}`);
    console.log(`      - Username: ${admin.username}`);
    
    // Actualizar rol
    db.prepare(`
      UPDATE users 
      SET role = 'admin_general', 
          place_id = NULL,
          first_name = COALESCE(first_name, 'Administrador'),
          last_name = COALESCE(last_name, 'Principal')
      WHERE email = 'admin@nova.com'
    `).run();
    
    console.log('   ✅ Rol actualizado a "admin_general"');
    
    // Resetear contraseña
    const newPassword = 'admin123';
    const passwordHash = bcrypt.hashSync(newPassword, 10);
    
    db.prepare(`
      UPDATE users 
      SET password = ? 
      WHERE email = 'admin@nova.com'
    `).run(passwordHash);
    
    console.log('   ✅ Contraseña reseteada a: admin123');

  } else {
    console.log('   ⚠️  No se encontró admin, creando uno nuevo...');
    
    const passwordHash = bcrypt.hashSync('admin123', 10);
    
    const result = db.prepare(`
      INSERT INTO users (
        username, email, password, first_name, last_name,
        role, place_id, is_active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, 1, datetime('now'))
    `).run(
      'admin',
      'admin@nova.com',
      passwordHash,
      'Administrador',
      'Principal',
      'admin_general'
    );
    
    console.log('   ✅ Nuevo admin creado con ID:', result.lastInsertRowid);
  }

  // ============================================
  // 5. ACTUALIZAR USUARIOS NORMALES
  // ============================================
  console.log('\n📋 PASO 5: Actualizando usuarios normales...\n');

  const normalUsers = db.prepare(`
    UPDATE users 
    SET role = COALESCE(role, 'user_place'),
        place_id = COALESCE(place_id, NULL)
    WHERE email != 'admin@nova.com'
  `).run();

  console.log(`   ✅ ${normalUsers.changes} usuarios actualizados`);

  // ============================================
  // 6. VERIFICAR RESULTADO
  // ============================================
  console.log('\n📋 PASO 6: Verificando configuración final...\n');

  const users = db.prepare(`
    SELECT 
      id, username, email, first_name, last_name, 
      role, place_id, is_active
    FROM users
    ORDER BY id
  `).all();

  console.log('   Usuarios configurados:');
  console.log('   ' + '─'.repeat(78));
  console.log('   ID | Username | Email | Role | Place | Active');
  console.log('   ' + '─'.repeat(78));
  
  users.forEach(u => {
    const roleDisplay = u.role || 'NULL';
    const placeDisplay = u.place_id || 'NULL';
    const activeDisplay = u.is_active ? '✅' : '❌';
    console.log(`   ${u.id} | ${u.username} | ${u.email} | ${roleDisplay} | ${placeDisplay} | ${activeDisplay}`);
  });
  
  console.log('   ' + '─'.repeat(78));

  // ============================================
  // 7. RESUMEN FINAL
  // ============================================
  const adminFinal = db.prepare("SELECT * FROM users WHERE role = 'admin_general'").get();

  console.log('\n' + '='.repeat(80));
  console.log('✅ CONFIGURACIÓN COMPLETADA EXITOSAMENTE!');
  console.log('='.repeat(80));
  console.log('\n📋 CREDENCIALES DEL DASHBOARD:\n');
  console.log('   ┌─────────────────────────────────────────┐');
  console.log('   │  📧 Email: admin@nova.com              │');
  console.log('   │  🔑 Contraseña: admin123               │');
  console.log('   │  👤 Usuario: ' + (adminFinal?.username || 'admin').padEnd(26) + '│');
  console.log('   │  🎭 Rol: admin_general                  │');
  console.log('   └─────────────────────────────────────────┘');
  console.log('\n🚀 Próximo paso: Ejecutar el backend\n');
  console.log('   node index.js\n');
  console.log('='.repeat(80) + '\n');

  db.close();

} catch (error) {
  console.error('\n❌ ERROR:', error.message);
  console.error('\nDetalles:', error);
  db.close();
  process.exit(1);
}