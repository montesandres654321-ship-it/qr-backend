javascript
// src/config/database.js
const Database = require('better-sqlite3');
const path = require('path');

// Configuración de la base de datos
const dbPath = path.join(__dirname, '../../nova_app.db');
const db = new Database(dbPath);

// Configurar SQLite para mejor rendimiento
db.pragma('journal_mode = WAL'); // Write-Ahead Logging
db.pragma('foreign_keys = ON');   // Activar llaves foráneas

console.log('✅ Base de datos conectada:', dbPath);

module.exports = db;