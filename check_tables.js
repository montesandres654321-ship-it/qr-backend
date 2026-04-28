const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./nova_app.db');

db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, rows) => {
  if (err) {
    console.error("ERROR:", err);
  } else {
    console.log("TABLAS:", rows);
  }
});