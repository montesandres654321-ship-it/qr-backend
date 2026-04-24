// src/routes/auth.routes.js
// ============================================================
// FIX: Google auth ahora separa turistas (role NULL) de admins
// FIX: /login devuelve token y user en nivel raíz para app móvil
// ============================================================

const express  = require('express');
const bcrypt   = require('bcryptjs');
const router   = express.Router();
const db       = require('../config/database');
const { authenticateToken, generateToken } = require('../middleware/auth');

// ─── Helper: respuesta de login ───────────────────────────
// Devuelve token y user tanto en raíz como en data para compatibilidad
const loginResponse = (user, token) => ({
  success: true,
  token,
  user: {
    id:         user.id,
    email:      user.email,
    username:   user.username,
    first_name: user.first_name,
    last_name:  user.last_name,
    role:       user.role       || null,
    place_id:   user.place_id   || null,
    is_active:  user.is_active,
  },
  // También en data para compatibilidad con dashboard
  data: {
    token,
    user: {
      id:         user.id,
      email:      user.email,
      username:   user.username,
      first_name: user.first_name,
      last_name:  user.last_name,
      role:       user.role       || null,
      place_id:   user.place_id   || null,
      is_active:  user.is_active,
    },
  },
});

// ─── POST /login ─────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email y contraseña son requeridos' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email);

    if (!user) {
      return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
    }

    // Si el usuario fue creado con Google (sin password), no puede hacer login manual
    if (!user.password && user.google_id) {
      return res.status(401).json({
        success: false,
        error: 'Esta cuenta fue creada con Google. Usa "Continuar con Google" para ingresar.',
      });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
    }

    db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);
    const token = generateToken(user);
    console.log(`✅ Login: ${email} (${user.role || 'turista'})`);

    return res.json(loginResponse(user, token));

  } catch (error) {
    console.error('❌ Error en /login:', error);
    return res.status(500).json({ success: false, error: 'Error en autenticación' });
  }
});

// ─── POST /users/login (alias compatibilidad) ────────────
router.post('/users/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email y contraseña son requeridos' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email);

    if (!user) {
      return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
    }

    if (!user.password && user.google_id) {
      return res.status(401).json({
        success: false,
        error: 'Esta cuenta fue creada con Google. Usa "Continuar con Google".',
      });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
    }

    db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);
    const token = generateToken(user);

    return res.json(loginResponse(user, token));

  } catch (error) {
    console.error('❌ Error en /users/login:', error);
    return res.status(500).json({ success: false, error: 'Error en autenticación' });
  }
});

// ─── POST /users/register ────────────────────────────────
router.post('/users/register', async (req, res) => {
  try {
    const { firstName, first_name, lastName, last_name, username, email, password, phone, dob, gender } = req.body;

    const fName = firstName || first_name;
    const lName = lastName || last_name;

    if (!email || !password || !username) {
      return res.status(400).json({ success: false, error: 'Email, contraseña y usuario son requeridos' });
    }

    // Verificar que no exista un turista (role NULL) con ese email o username
    const existingTourist = db.prepare(
      'SELECT id FROM users WHERE (email = ? OR username = ?) AND role IS NULL'
    ).get(email, username);

    if (existingTourist) {
      return res.status(409).json({ success: false, error: 'Email o nombre de usuario ya está en uso' });
    }

    // Verificar si existe un admin con ese email — permitir registro como turista separado
    const existingAdmin = db.prepare(
      'SELECT id FROM users WHERE email = ? AND role IS NOT NULL'
    ).get(email);

    if (existingAdmin) {
      // El email ya lo usa un admin — verificar solo por username
      const usernameConflict = db.prepare(
        'SELECT id FROM users WHERE username = ? AND role IS NULL'
      ).get(username);

      if (usernameConflict) {
        return res.status(409).json({ success: false, error: 'Nombre de usuario ya está en uso' });
      }
    }

    const hashed = await bcrypt.hash(password, 10);

    const result = db.prepare(`
      INSERT INTO users (first_name, last_name, username, email, password, phone, dob, gender, role, is_active, accepted_terms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, 1)
    `).run(fName || '', lName || '', username, email, hashed, phone || null, dob || null, gender || null);

    const newUser = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    const token   = generateToken(newUser);

    console.log(`✅ Nuevo turista registrado: ${email}`);
    return res.status(201).json(loginResponse(newUser, token));

  } catch (error) {
    console.error('❌ Error en /users/register:', error);
    return res.status(500).json({ success: false, error: 'Error al registrar usuario' });
  }
});

// ─── POST /users/google-auth ─────────────────────────────
// FIX: Solo busca turistas (role NULL) para evitar conflicto con admins
router.post('/users/google-auth', async (req, res) => {
  try {
    const { google_uid, uid, email, name, photoUrl } = req.body;
    const googleId = google_uid || uid;

    if (!googleId || !email) {
      return res.status(400).json({ success: false, error: 'Datos de Google incompletos' });
    }

    // FIX: Buscar SOLO turistas (role IS NULL) — no admins del dashboard
    let user = db.prepare(
      'SELECT * FROM users WHERE (google_id = ? OR email = ?) AND role IS NULL'
    ).get(googleId, email);

    if (user) {
      // Actualizar google_id si no lo tenía
      if (!user.google_id) {
        db.prepare('UPDATE users SET google_id = ?, last_login = datetime("now") WHERE id = ?')
          .run(googleId, user.id);
      } else {
        db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);
      }
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    } else {
      // No existe turista con ese email — crear nuevo
      // (No importa si hay un admin con el mismo email, son usuarios separados)
      const nameParts = (name || '').split(' ');
      const firstName = nameParts[0] || '';
      const lastName  = nameParts.slice(1).join(' ') || '';
      const username  = email.split('@')[0] + '_g' + Date.now().toString().slice(-4);

      const result = db.prepare(`
        INSERT INTO users (first_name, last_name, username, email, google_id, role, is_active, accepted_terms)
        VALUES (?, ?, ?, ?, ?, NULL, 1, 1)
      `).run(firstName, lastName, username, email, googleId);

      user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
      console.log(`✅ Nuevo turista Google: ${email} (separado de admin si existe)`);
    }

    const token = generateToken(user);
    console.log(`✅ Google auth: ${email} (turista ID:${user.id})`);
    return res.json(loginResponse(user, token));

  } catch (error) {
    console.error('❌ Error en /users/google-auth:', error);
    return res.status(500).json({ success: false, error: 'Error en autenticación con Google' });
  }
});

// ─── POST /users/change-password ─────────────────────────
router.post('/users/change-password', authenticateToken, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const userId = req.user.id;

    if (!current_password || !new_password) {
      return res.status(400).json({ success: false, error: 'Contraseñas requeridas' });
    }

    if (new_password.length < 6) {
      return res.status(400).json({ success: false, error: 'Mínimo 6 caracteres' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });

    const valid = await bcrypt.compare(current_password, user.password);
    if (!valid) return res.status(401).json({ success: false, error: 'Contraseña actual incorrecta' });

    const hashed = await bcrypt.hash(new_password, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, userId);

    return res.json({ success: true, message: 'Contraseña actualizada' });

  } catch (error) {
    console.error('❌ Error en /users/change-password:', error);
    return res.status(500).json({ success: false, error: 'Error al cambiar contraseña' });
  }
});

// ─── PUT /users/update/:id ───────────────────────────────
router.put('/users/update/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { first_name, last_name, username, email, phone } = req.body;

    if (req.user.id !== parseInt(id) && req.user.role !== 'admin_general') {
      return res.status(403).json({ success: false, error: 'Sin permiso' });
    }

    if (!first_name || !email || !username) {
      return res.status(400).json({ success: false, error: 'Campos requeridos' });
    }

    const conflict = db.prepare(
      'SELECT id FROM users WHERE (email = ? OR username = ?) AND id != ?'
    ).get(email, username, id);

    if (conflict) return res.status(409).json({ success: false, error: 'Email o usuario ya en uso' });

    db.prepare(`
      UPDATE users SET first_name = ?, last_name = ?, username = ?, email = ?, phone = ? WHERE id = ?
    `).run(first_name, last_name || '', username, email, phone || null, id);

    const updated = db.prepare('SELECT id, first_name, last_name, username, email, phone, role, place_id FROM users WHERE id = ?').get(id);
    return res.json({ success: true, data: updated });

  } catch (error) {
    console.error('❌ Error en PUT /users/update/:id:', error);
    return res.status(500).json({ success: false, error: 'Error al actualizar' });
  }
});

// ─── GET /health ─────────────────────────────────────────
router.get('/health', (req, res) => {
  res.json({ status: 'OK', version: '1.0.0', timestamp: new Date().toISOString(), database: 'connected' });
});

module.exports = router;