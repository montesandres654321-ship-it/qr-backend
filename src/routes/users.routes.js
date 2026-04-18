// src/routes/users.routes.js
// ============================================================
// RUTAS DE USUARIOS — Nova App
// ============================================================
// NUEVOS:
//   PATCH /users/me/profile    → editar propio perfil (cualquier rol)
//   POST  /users/me/password   → cambiar propia contraseña (cualquier rol)
//
// EXISTENTES (sin cambios):
//   GET    /users, /users/:id, /admin/users, /admin/users/:id
//   PATCH  /admin/users/:id/toggle, /admin/users/:id/role, /admin/users/:id
//   POST   /admin/users/create
//   DELETE /admin/users/:id
//   GET    /api/admins/owners, /api/admins/owners/without-place
//   PATCH  /api/admins/:id/toggle
//   GET    /stats/dashboard
// ============================================================

const express   = require('express');
const bcrypt    = require('bcryptjs');
const router    = express.Router();
const db        = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const authorize = require('../middleware/authorize');

// ══════════════════════════════════════════════════════════
// NUEVOS ENDPOINTS — PERFIL PROPIO (cualquier rol autenticado)
// ══════════════════════════════════════════════════════════

// ─── PATCH /users/me/profile ──────────────────────────────
// Cualquier usuario autenticado puede editar SU propio perfil
// Solo acepta: first_name, last_name, phone
// El userId viene del token JWT — no puede editar a otro
router.patch('/users/me/profile', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const { first_name, last_name, phone } = req.body;

    if (first_name === undefined && last_name === undefined && phone === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere al menos un campo: first_name, last_name o phone',
      });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }

    const newFirstName = first_name !== undefined ? first_name.trim() : user.first_name;
    const newLastName  = last_name  !== undefined ? last_name.trim()  : user.last_name;
    const newPhone     = phone      !== undefined ? (phone.trim() || null) : user.phone;

    if (first_name !== undefined && !first_name.trim()) {
      return res.status(400).json({ success: false, error: 'El nombre no puede estar vacío' });
    }

    db.prepare(`
      UPDATE users SET first_name = ?, last_name = ?, phone = ? WHERE id = ?
    `).run(newFirstName, newLastName, newPhone, userId);

    const updated = db.prepare(
      'SELECT id, username, email, first_name, last_name, role, phone, place_id, is_active FROM users WHERE id = ?'
    ).get(userId);

    console.log(`✅ Perfil propio actualizado: ID:${userId} (${updated.email})`);

    return res.json({
      success: true,
      message: 'Perfil actualizado correctamente',
      data: updated,
    });
  } catch (error) {
    console.error('❌ Error en PATCH /users/me/profile:', error);
    return res.status(500).json({ success: false, error: 'Error al actualizar perfil' });
  }
});

// ─── POST /users/me/password ──────────────────────────────
// Cualquier usuario autenticado puede cambiar SU propia contraseña
// Requiere: current_password + new_password
router.post('/users/me/password', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere contraseña actual y nueva contraseña',
      });
    }

    if (new_password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'La nueva contraseña debe tener al menos 6 caracteres',
      });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }

    // Verificar contraseña actual
    const validPassword = bcrypt.compareSync(current_password, user.password);
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        error: 'La contraseña actual es incorrecta',
      });
    }

    // Hashear y guardar nueva contraseña
    const hashedPassword = await bcrypt.hash(new_password, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, userId);

    console.log(`✅ Contraseña cambiada: ID:${userId} (${user.email})`);

    return res.json({
      success: true,
      message: 'Contraseña actualizada exitosamente',
    });
  } catch (error) {
    console.error('❌ Error en POST /users/me/password:', error);
    return res.status(500).json({ success: false, error: 'Error al cambiar contraseña' });
  }
});

// ══════════════════════════════════════════════════════════
// ENDPOINTS EXISTENTES — SIN CAMBIOS
// ══════════════════════════════════════════════════════════

// ─── GET /users ───────────────────────────────────────────
router.get('/users', authenticateToken, authorize(['admin_general', 'user_general']), (req, res) => {
  try {
    const users = db.prepare(`
      SELECT id, username, email, first_name, last_name, role,
             is_active, created_at, last_login, phone, place_id
      FROM users ORDER BY created_at DESC
    `).all();
    return res.json({ success: true, data: users });
  } catch (error) {
    console.error('❌ Error en GET /users:', error);
    return res.status(500).json({ success: false, error: 'Error al obtener usuarios' });
  }
});

// ─── GET /users/:id ───────────────────────────────────────
router.get('/users/:id', authenticateToken, (req, res) => {
  try {
    const user = db.prepare(`
      SELECT id, username, email, first_name, last_name, role,
             is_active, created_at, last_login, phone, place_id
      FROM users WHERE id = ?
    `).get(req.params.id);

    if (!user) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    return res.json({ success: true, data: user });
  } catch (error) {
    console.error('❌ Error en GET /users/:id:', error);
    return res.status(500).json({ success: false, error: 'Error al obtener usuario' });
  }
});

// ─── GET /admin/users ─────────────────────────────────────
router.get('/admin/users', authenticateToken, authorize(['admin_general', 'user_general']), (req, res) => {
  try {
    const users = db.prepare(`
      SELECT
        u.id, u.first_name, u.last_name, u.username, u.email, u.phone,
        u.created_at, u.last_login, u.is_active, u.google_id, u.role,
        COUNT(DISTINCT s.id)  as total_scans,
        COUNT(DISTINCT ur.id) as total_rewards,
        SUM(CASE WHEN ur.is_redeemed = 1 THEN 1 ELSE 0 END) as redeemed_rewards
      FROM users u
      LEFT JOIN scans s         ON u.id = s.user_id
      LEFT JOIN user_rewards ur ON u.id = ur.user_id
      WHERE u.role IS NULL
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `).all();

    return res.json({ success: true, data: users });
  } catch (error) {
    console.error('❌ Error en GET /admin/users:', error);
    return res.status(500).json({ success: false, error: 'Error al obtener usuarios' });
  }
});

// ─── GET /admin/users/:id ─────────────────────────────────
router.get('/admin/users/:id', authenticateToken, authorize(['admin_general', 'user_general']), (req, res) => {
  try {
    const { id } = req.params;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });

    const scans = db.prepare(`
      SELECT s.*, p.name as place_name, p.tipo, p.lugar
      FROM scans s JOIN places p ON s.place_id = p.id
      WHERE s.user_id = ? ORDER BY s.created_at DESC
    `).all(id);

    const rewards = db.prepare(`
      SELECT ur.*, p.name as place_name
      FROM user_rewards ur JOIN places p ON ur.place_id = p.id
      WHERE ur.user_id = ? ORDER BY ur.earned_at DESC
    `).all(id);

    const topPlaces = db.prepare(`
      SELECT p.name, p.tipo, p.lugar, COUNT(*) as visit_count
      FROM scans s JOIN places p ON s.place_id = p.id
      WHERE s.user_id = ? GROUP BY p.id
      ORDER BY visit_count DESC LIMIT 5
    `).all(id);

    const { password: _, ...userWithoutPassword } = user;

    return res.json({
      success: true,
      data: {
        user: userWithoutPassword,
        scans,
        rewards,
        topPlaces,
        stats: {
          totalScans:      scans.length,
          totalRewards:    rewards.length,
          redeemedRewards: rewards.filter(r => r.is_redeemed === 1).length,
        },
      },
    });
  } catch (error) {
    console.error('❌ Error en GET /admin/users/:id:', error);
    return res.status(500).json({ success: false, error: 'Error al obtener detalle' });
  }
});

// ─── PATCH /admin/users/:id/toggle ───────────────────────
router.patch('/admin/users/:id/toggle', authenticateToken, authorize(['admin_general']), (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });

    const newStatus = user.is_active === 1 ? 0 : 1;
    db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(newStatus, req.params.id);

    return res.json({
      success: true,
      data: {
        message:   `Usuario ${newStatus === 1 ? 'activado' : 'desactivado'}`,
        is_active: newStatus,
      },
    });
  } catch (error) {
    console.error('❌ Error en toggle usuario:', error);
    return res.status(500).json({ success: false, error: 'Error al cambiar estado' });
  }
});

// ─── POST /admin/users/create ─────────────────────────────
router.post('/admin/users/create', authenticateToken, authorize(['admin_general']), async (req, res) => {
  try {
    const { first_name, last_name, email, password, username, role, place_id } = req.body;

    if (!email || !password || !username || !role) {
      return res.status(400).json({ success: false, error: 'Email, contraseña, usuario y rol son requeridos' });
    }

    const validRoles = ['admin_general', 'user_general', 'user_place'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ success: false, error: 'Rol inválido' });
    }

    if (role === 'user_place' && !place_id) {
      return res.status(400).json({ success: false, error: 'place_id es requerido para user_place' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);
    if (existing) {
      return res.status(409).json({ success: false, error: 'Email o usuario ya en uso' });
    }

    const hashed      = await bcrypt.hash(password, 10);
    const finalPlaceId = role === 'user_place' ? place_id : null;

    const result = db.prepare(`
      INSERT INTO users (first_name, last_name, username, email, password, role, place_id, is_active, accepted_terms)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)
    `).run(first_name || '', last_name || '', username, email, hashed, role, finalPlaceId);

    const newUser = db.prepare(
      'SELECT id, username, email, first_name, last_name, role, place_id, is_active FROM users WHERE id = ?'
    ).get(result.lastInsertRowid);

    console.log(`✅ Usuario del panel creado: ${email} (${role})`);
    return res.status(201).json({ success: true, data: newUser });

  } catch (error) {
    console.error('❌ Error en POST /admin/users/create:', error);
    return res.status(500).json({ success: false, error: 'Error al crear usuario' });
  }
});

// ─── PATCH /admin/users/:id/role ─────────────────────────
router.patch('/admin/users/:id/role', authenticateToken, authorize(['admin_general']), (req, res) => {
  try {
    const { role, place_id } = req.body;
    const { id } = req.params;

    const validRoles = ['admin_general', 'user_general', 'user_place'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ success: false, error: 'Rol inválido' });
    }

    if (role === 'user_place' && !place_id) {
      return res.status(400).json({ success: false, error: 'place_id requerido para user_place' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });

    db.prepare('UPDATE users SET role = ?, place_id = ? WHERE id = ?')
      .run(role, role === 'user_place' ? place_id : null, id);

    return res.json({ success: true, message: `Rol actualizado a ${role}` });
  } catch (error) {
    console.error('❌ Error en PATCH /admin/users/:id/role:', error);
    return res.status(500).json({ success: false, error: 'Error al cambiar rol' });
  }
});

// ─── PATCH /admin/users/:id ───────────────────────────────
router.patch('/admin/users/:id', authenticateToken, authorize(['admin_general']), (req, res) => {
  try {
    const { id } = req.params;
    const { first_name, last_name, phone } = req.body;

    if (first_name === undefined && last_name === undefined && phone === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere al menos un campo: first_name, last_name o phone',
      });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }

    const newFirstName = first_name !== undefined ? first_name.trim() : user.first_name;
    const newLastName  = last_name  !== undefined ? last_name.trim()  : user.last_name;
    const newPhone     = phone      !== undefined ? (phone.trim() || null) : user.phone;

    if (first_name !== undefined && !first_name.trim()) {
      return res.status(400).json({ success: false, error: 'El nombre no puede estar vacío' });
    }
    if (last_name !== undefined && !last_name.trim()) {
      return res.status(400).json({ success: false, error: 'El apellido no puede estar vacío' });
    }

    db.prepare(`
      UPDATE users SET first_name = ?, last_name = ?, phone = ? WHERE id = ?
    `).run(newFirstName, newLastName, newPhone, id);

    const updated = db.prepare(
      'SELECT id, username, email, first_name, last_name, role, phone, place_id, is_active FROM users WHERE id = ?'
    ).get(id);

    console.log(`✅ Usuario actualizado: ID:${id} (${updated.email})`);

    return res.json({
      success: true,
      message: 'Usuario actualizado correctamente',
      data: updated,
    });
  } catch (error) {
    console.error('❌ Error en PATCH /admin/users/:id:', error);
    return res.status(500).json({ success: false, error: 'Error al actualizar usuario' });
  }
});

// ─── DELETE /admin/users/:id ──────────────────────────────
router.delete('/admin/users/:id', authenticateToken, authorize(['admin_general']), (req, res) => {
  try {
    const { id } = req.params;
    const targetId = parseInt(id);

    if (req.user.id === targetId) {
      return res.status(400).json({
        success: false,
        error: 'No puedes desactivar tu propia cuenta',
      });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }

    if (user.is_active === 0) {
      return res.status(400).json({
        success: false,
        error: 'El usuario ya está desactivado',
      });
    }

    if (user.role === 'admin_general') {
      const activeAdmins = db.prepare(
        "SELECT COUNT(*) as c FROM users WHERE role = 'admin_general' AND is_active = 1"
      ).get();

      if (activeAdmins.c <= 1) {
        return res.status(400).json({
          success: false,
          error: 'No se puede desactivar el único administrador general activo del sistema',
        });
      }
    }

    db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(targetId);

    const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ')
      || user.username;

    console.log(`⚠️  Usuario desactivado: ID:${targetId} (${user.email}) por admin ID:${req.user.id}`);

    return res.json({
      success: true,
      message: `Usuario "${displayName}" desactivado. Su historial se conserva.`,
      data: { id: targetId, is_active: 0 },
    });
  } catch (error) {
    console.error('❌ Error en DELETE /admin/users/:id:', error);
    return res.status(500).json({ success: false, error: 'Error al desactivar usuario' });
  }
});

// ─── GET /api/admins/owners ───────────────────────────────
router.get('/api/admins/owners', authenticateToken, authorize(['admin_general', 'user_general']), (req, res) => {
  try {
    const owners = db.prepare(`
      SELECT u.id, u.first_name, u.last_name, u.username, u.email,
             u.phone, u.role, u.place_id, u.is_active, u.created_at, u.last_login,
             p.name as place_name, p.tipo as place_tipo, p.lugar as place_lugar
      FROM users u
      LEFT JOIN places p ON u.place_id = p.id
      WHERE u.role IN ('admin_general', 'user_general', 'user_place')
      ORDER BY
        CASE u.role
          WHEN 'admin_general' THEN 1
          WHEN 'user_general'  THEN 2
          WHEN 'user_place'    THEN 3
        END, u.created_at DESC
    `).all();

    return res.json({ success: true, data: owners });
  } catch (error) {
    console.error('❌ Error en GET /api/admins/owners:', error);
    return res.status(500).json({ success: false, error: 'Error al obtener propietarios' });
  }
});

// ─── PATCH /api/admins/:id/toggle ────────────────────────
router.patch('/api/admins/:id/toggle', authenticateToken, authorize(['admin_general']), (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });

    const newStatus = user.is_active === 1 ? 0 : 1;
    db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(newStatus, req.params.id);

    return res.json({
      success: true,
      data: { message: `Usuario ${newStatus === 1 ? 'activado' : 'desactivado'}`, is_active: newStatus },
    });
  } catch (error) {
    console.error('❌ Error en toggle admin:', error);
    return res.status(500).json({ success: false, error: 'Error al cambiar estado' });
  }
});

// ─── GET /api/admins/owners/without-place ────────────────
router.get('/api/admins/owners/without-place', authenticateToken, authorize(['admin_general']), (req, res) => {
  try {
    const owners = db.prepare(`
      SELECT u.id, u.first_name, u.last_name, u.username, u.email, u.phone, u.created_at
      FROM users u
      WHERE u.role = 'user_place'
        AND (u.place_id IS NULL OR u.place_id NOT IN (SELECT id FROM places WHERE is_active = 1))
        AND u.is_active = 1
      ORDER BY u.created_at DESC
    `).all();

    return res.json({ success: true, data: owners, total: owners.length });
  } catch (error) {
    console.error('❌ Error en /api/admins/owners/without-place:', error);
    return res.status(500).json({ success: false, error: 'Error al obtener propietarios sin lugar' });
  }
});

// ─── GET /stats/dashboard ─────────────────────────────────
router.get('/stats/dashboard', authenticateToken, (req, res) => {
  try {
    const totalUsers   = db.prepare("SELECT COUNT(*) as c FROM users WHERE role IS NULL").get();
    const totalPlaces  = db.prepare("SELECT COUNT(*) as c FROM places WHERE is_active = 1").get();
    const totalScans   = db.prepare("SELECT COUNT(*) as c FROM scans").get();
    const totalRewards = db.prepare("SELECT COUNT(*) as c FROM user_rewards").get();

    const placesByType = db.prepare(`
      SELECT tipo, COUNT(*) as count FROM places WHERE is_active = 1 GROUP BY tipo
    `).all();

    const scansByDay = db.prepare(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM scans
      GROUP BY DATE(created_at) ORDER BY date ASC
    `).all();

    const topPlaces = db.prepare(`
      SELECT p.id, p.name, p.tipo, p.lugar, COUNT(s.id) as total_scans
      FROM places p LEFT JOIN scans s ON p.id = s.place_id
      WHERE p.is_active = 1
      GROUP BY p.id ORDER BY total_scans DESC LIMIT 10
    `).all();

    return res.json({
      success: true,
      data: {
        stats: {
          users:   totalUsers.c,
          places:  totalPlaces.c,
          scans:   totalScans.c,
          rewards: totalRewards.c,
        },
        scansByDay,
        topPlaces,
        placesByType: placesByType.reduce((acc, item) => {
          acc[item.tipo] = item.count;
          return acc;
        }, {}),
      },
    });
  } catch (error) {
    console.error('❌ Error en /stats/dashboard:', error);
    return res.status(500).json({ success: false, error: 'Error al obtener estadísticas' });
  }
});

module.exports = router;