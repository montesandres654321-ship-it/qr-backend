// src/config/database.js
// ============================================================
// INSTANCIA ÚNICA DE SQLITE — Nova App
// ============================================================
// REGLA: Ningún otro archivo puede hacer new Database()
// Todos importan desde aquí:
//   const db = require('../config/database');
// ============================================================

require('dotenv').config();
const Database = require('better-sqlite3');
const path     = require('path');

const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, '../../nova_app.db');

const db = new Database(dbPath);

// Rendimiento y consistencia
db.pragma('journal_mode = WAL');   // Write-Ahead Logging
db.pragma('foreign_keys = ON');    // Validar FK siempre
db.pragma('synchronous = NORMAL'); // Balance seguridad/velocidad

console.log('✅ Base de datos conectada:', dbPath);

module.exports = db;