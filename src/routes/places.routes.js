// src/routes/places.routes.js
// ============================================================
// RUTAS DE LUGARES — Nova App
// ============================================================
// GET    /places                    → todos los lugares activos (público)
// GET    /places/type/:type         → filtrar por hotel/restaurant/bar
// GET    /places/my-place/stats     → estadísticas del lugar propio (user_place)
// GET    /places/my-place/scans     → escaneos del lugar propio (user_place)
// GET    /places/my-place/visitors  → visitantes del lugar propio (user_place)
// PATCH  /places/my-place/reward    → editar SOLO recompensa (user_place)
// PATCH  /places/my-place           → editar info + recompensa (user_place) ← ACTUALIZADO
// GET    /places/:id                → detalle de un lugar (público)
// POST   /places                    → crear lugar (admin_general)
// PUT    /places/:id                → editar lugar completo (admin_general)
// DELETE /places/:id                → desactivar lugar (admin_general)
//
// ⚠️  ORDEN CRÍTICO: /my-place/* y /type/:type deben ir ANTES de /:id
//     De lo contrario Express captura 'my-place' y 'type' como ids
// ============================================================

const express        = require('express');
const router         = express.Router();
const db             = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const authorize      = require('../middleware/authorize');
const checkOwnership = require('../middleware/checkOwnership');

// ─── Helper: parsear place ────────────────────────────────
const parsePlace = (place) => ({
  ...place,
  amenities:    place.amenities  ? JSON.parse(place.amenities) : [],
  has_reward:   place.has_reward === 1,
  reward_stock: place.reward_stock ?? null,
});

// ─── GET /places ──────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const { tipo } = req.query;
    const validTypes = ['hotel', 'restaurant', 'bar'];

    let places;
    if (tipo && validTypes.includes(tipo.toLowerCase())) {
      places = db.prepare(
        'SELECT * FROM places WHERE tipo = ? AND is_active = 1 ORDER BY rating DESC'
      ).all(tipo.toLowerCase());
    } else {
      places = db.prepare('SELECT * FROM places WHERE is_active = 1 ORDER BY rating DESC').all();
    }

    return res.json({ success: true, data: places.map(parsePlace) });
  } catch (error) {
    console.error('❌ Error en GET /places:', error);
    return res.status(500).json({ success: false, error: 'Error al obtener lugares' });
  }
});

// ─── GET /places/type/:type ───────────────────────────────
router.get('/type/:type', (req, res) => {
  try {
    const { type } = req.params;
    const validTypes = ['hotel', 'restaurant', 'bar'];

    if (!validTypes.includes(type.toLowerCase())) {
      return res.status(400).json({ success: false, error: 'Tipo inválido. Use: hotel, restaurant, bar' });
    }

    const places = db.prepare(
      'SELECT * FROM places WHERE tipo = ? AND is_active = 1 ORDER BY rating DESC'
    ).all(type.toLowerCase());

    return res.json({ success: true, data: places.map(parsePlace) });

  } catch (error) {
    console.error('❌ Error en GET /places/type/:type:', error);
    return res.status(500).json({ success: false, error: 'Error al obtener lugares' });
  }
});

// ─── GET /places/my-place/stats ───────────────────────────
router.get('/my-place/stats',
  authenticateToken,
  authorize(['admin_general', 'user_general', 'user_place']),
  (req, res) => {
    try {
      const placeId = req.user.role === 'user_place' ? req.user.place_id : req.query.place_id;

      if (!placeId) {
        return res.status(400).json({ success: false, error: 'place_id requerido' });
      }

      const totalScans     = db.prepare('SELECT COUNT(*) as c FROM scans WHERE place_id = ?').get(placeId);
      const uniqueVisitors = db.prepare('SELECT COUNT(DISTINCT user_id) as c FROM scans WHERE place_id = ?').get(placeId);
      const totalRewards   = db.prepare('SELECT COUNT(*) as c FROM user_rewards WHERE place_id = ?').get(placeId);
      const redeemed       = db.prepare('SELECT COUNT(*) as c FROM user_rewards WHERE place_id = ? AND is_redeemed = 1').get(placeId);

      const lastScans = db.prepare(`
        SELECT DATE(created_at) as date, COUNT(*) as count
        FROM scans WHERE place_id = ?
        AND created_at >= datetime('now', '-30 days')
        GROUP BY DATE(created_at) ORDER BY date ASC
      `).all(placeId);

      return res.json({
        success: true,
        data: {
          totalScans:      totalScans.c,
          uniqueVisitors:  uniqueVisitors.c,
          totalRewards:    totalRewards.c,
          redeemedRewards: redeemed.c,
          scansByDay:      lastScans,
        },
      });

    } catch (error) {
      console.error('❌ Error en /my-place/stats:', error);
      return res.status(500).json({ success: false, error: 'Error al obtener estadísticas' });
    }
  }
);

// ─── GET /places/my-place/scans ───────────────────────────
router.get('/my-place/scans',
  authenticateToken,
  authorize(['admin_general', 'user_general', 'user_place']),
  (req, res) => {
    try {
      const placeId = req.user.role === 'user_place' ? req.user.place_id : req.query.place_id;

      if (!placeId) return res.status(400).json({ success: false, error: 'place_id requerido' });

      const scans = db.prepare(`
        SELECT s.*, u.first_name, u.last_name, u.username, u.email
        FROM scans s JOIN users u ON s.user_id = u.id
        WHERE s.place_id = ?
        ORDER BY s.created_at DESC LIMIT 100
      `).all(placeId);

      return res.json({ success: true, data: scans });

    } catch (error) {
      console.error('❌ Error en /my-place/scans:', error);
      return res.status(500).json({ success: false, error: 'Error al obtener escaneos' });
    }
  }
);

// ─── GET /places/my-place/visitors ────────────────────────
router.get('/my-place/visitors',
  authenticateToken,
  authorize(['admin_general', 'user_general', 'user_place']),
  (req, res) => {
    try {
      const placeId = req.user.role === 'user_place' ? req.user.place_id : req.query.place_id;

      if (!placeId) return res.status(400).json({ success: false, error: 'place_id requerido' });

      const visitors = db.prepare(`
        SELECT u.id, u.first_name, u.last_name, u.username, u.email,
               COUNT(s.id) as visit_count,
               MAX(s.created_at) as last_visit
        FROM users u JOIN scans s ON u.id = s.user_id
        WHERE s.place_id = ?
        GROUP BY u.id ORDER BY visit_count DESC
      `).all(placeId);

      return res.json({ success: true, data: visitors, total: visitors.length });

    } catch (error) {
      console.error('❌ Error en /my-place/visitors:', error);
      return res.status(500).json({ success: false, error: 'Error al obtener visitantes' });
    }
  }
);

// ─── PATCH /places/my-place/reward ────────────────────────
// El propietario edita SOLO la recompensa (endpoint dedicado)
router.patch('/my-place/reward',
  authenticateToken,
  authorize(['user_place']),
  (req, res) => {
    try {
      const placeId = req.user.place_id;

      if (!placeId) {
        return res.status(400).json({
          success: false,
          error: 'Tu usuario no tiene un lugar asignado. Contacta al administrador.',
        });
      }

      const { reward_name, reward_description, reward_icon, reward_stock } = req.body;

      if (
        reward_name       === undefined &&
        reward_description === undefined &&
        reward_icon        === undefined &&
        reward_stock       === undefined
      ) {
        return res.status(400).json({
          success: false,
          error: 'Se requiere al menos un campo: reward_name, reward_description, reward_icon o reward_stock',
        });
      }

      const place = db.prepare('SELECT * FROM places WHERE id = ?').get(placeId);
      if (!place) {
        return res.status(404).json({ success: false, error: 'Lugar no encontrado' });
      }

      if (reward_name !== undefined && !reward_name.trim()) {
        return res.status(400).json({ success: false, error: 'El nombre de la recompensa no puede estar vacío' });
      }

      if (reward_stock !== undefined && reward_stock !== null) {
        const stock = parseInt(reward_stock);
        if (isNaN(stock) || stock < 0) {
          return res.status(400).json({ success: false, error: 'El stock debe ser un número positivo o null (ilimitado)' });
        }
      }

      const newName        = reward_name        !== undefined ? reward_name.trim()        : place.reward_name;
      const newDescription = reward_description !== undefined ? reward_description.trim() : place.reward_description;
      const newIcon        = reward_icon        !== undefined ? reward_icon               : place.reward_icon;
      const newStock       = reward_stock       !== undefined
        ? (reward_stock === null ? null : parseInt(reward_stock))
        : place.reward_stock;

      db.prepare(`
        UPDATE places
        SET reward_name = ?, reward_description = ?, reward_icon = ?,
            reward_stock = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(newName, newDescription, newIcon, newStock, placeId);

      const updated = db.prepare('SELECT * FROM places WHERE id = ?').get(placeId);

      console.log(`✅ Recompensa actualizada: Lugar ID:${placeId} por propietario ID:${req.user.id}`);

      return res.json({
        success: true,
        message: 'Recompensa actualizada correctamente',
        data: {
          reward_name:        updated.reward_name,
          reward_description: updated.reward_description,
          reward_icon:        updated.reward_icon,
          reward_stock:       updated.reward_stock,
        },
      });

    } catch (error) {
      console.error('❌ Error en PATCH /my-place/reward:', error);
      return res.status(500).json({ success: false, error: 'Error al actualizar recompensa' });
    }
  }
);


// ─── PATCH /places/my-place ────────────────────────────────
// ACTUALIZADO: Ahora acepta campos de recompensa además de info básica
// Campos aceptados: description, phone, address, image_url,
//                   has_reward, reward_icon, reward_name,
//                   reward_description, reward_stock
router.patch('/my-place',
  authenticateToken,
  authorize(['user_place']),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const user   = db.prepare('SELECT place_id FROM users WHERE id = ?').get(userId);
      if (!user || !user.place_id) {
        return res.status(404).json({ success: false, error: 'No tienes un lugar asignado' });
      }
      const placeId = user.place_id;
      const place   = db.prepare('SELECT * FROM places WHERE id = ?').get(placeId);
      if (!place) {
        return res.status(404).json({ success: false, error: 'Lugar no encontrado' });
      }

      const {
        description, phone, address, image_url,
        has_reward, reward_icon, reward_name,
        reward_description, reward_stock,
      } = req.body;

      // Verificar que al menos un campo viene
      if (description === undefined && phone === undefined &&
          address === undefined && image_url === undefined &&
          has_reward === undefined && reward_icon === undefined &&
          reward_name === undefined && reward_description === undefined &&
          reward_stock === undefined) {
        return res.status(400).json({
          success: false,
          error: 'Se requiere al menos un campo para actualizar',
        });
      }

      // Validar descripción si se envía
      if (description !== undefined && !description.trim()) {
        return res.status(400).json({ success: false, error: 'La descripción no puede estar vacía' });
      }

      // Validar reward_name si has_reward es true
      if (has_reward === true && reward_name !== undefined && !reward_name.trim()) {
        return res.status(400).json({ success: false, error: 'El nombre de la recompensa no puede estar vacío' });
      }

      // Validar reward_stock si se envía
      if (reward_stock !== undefined && reward_stock !== null) {
        const stock = parseInt(reward_stock);
        if (isNaN(stock) || stock < 0) {
          return res.status(400).json({ success: false, error: 'El stock debe ser un número positivo o null' });
        }
      }

      // Construir campos dinámicamente
      const fields = [];
      const values = [];

      // Campos de información básica
      if (description !== undefined) { fields.push('description = ?'); values.push(description.trim()); }
      if (phone       !== undefined) { fields.push('phone = ?');       values.push(phone ? phone.trim() : null); }
      if (address     !== undefined) { fields.push('address = ?');     values.push(address ? address.trim() : null); }
      if (image_url   !== undefined) { fields.push('image_url = ?');   values.push(image_url ? image_url.trim() : null); }

      // Campos de recompensa
      if (has_reward !== undefined) {
        fields.push('has_reward = ?');
        values.push(has_reward ? 1 : 0);
      }
      if (reward_icon !== undefined) {
        fields.push('reward_icon = ?');
        values.push(reward_icon || null);
      }
      if (reward_name !== undefined) {
        fields.push('reward_name = ?');
        values.push(reward_name ? reward_name.trim() : null);
      }
      if (reward_description !== undefined) {
        fields.push('reward_description = ?');
        values.push(reward_description ? reward_description.trim() : null);
      }
      if (reward_stock !== undefined) {
        fields.push('reward_stock = ?');
        values.push(reward_stock === null ? null : parseInt(reward_stock));
      }

      fields.push("updated_at = datetime('now')");
      values.push(placeId);

      db.prepare(`UPDATE places SET ${fields.join(', ')} WHERE id = ?`).run(...values);

      const updated = db.prepare('SELECT * FROM places WHERE id = ?').get(placeId);
      console.log(`✅ Lugar editado por propietario: ID:${placeId} (user:${userId}) — campos: ${fields.length - 1}`);

      return res.json({
        success: true,
        message: 'Información actualizada correctamente',
        data:    parsePlace(updated),
      });
    } catch (error) {
      console.error('❌ Error en PATCH /my-place:', error);
      return res.status(500).json({ success: false, error: 'Error al actualizar el lugar' });
    }
  }
);

// ─── GET /places/:id ─────────────────────────────────────
router.get('/:id', (req, res) => {
  try {
    const place = db.prepare('SELECT * FROM places WHERE id = ?').get(req.params.id);
    if (!place) return res.status(404).json({ success: false, error: 'Lugar no encontrado' });
    return res.json({ success: true, data: parsePlace(place) });
  } catch (error) {
    console.error('❌ Error en GET /places/:id:', error);
    return res.status(500).json({ success: false, error: 'Error al obtener lugar' });
  }
});

// ─── POST /places ─────────────────────────────────────────
router.post('/', authenticateToken, authorize(['admin_general']), (req, res) => {
  try {
    const {
      name, tipo, lugar, description, image_url, rating,
      address, phone, price_range, amenities,
      has_reward, reward_name, reward_description, reward_icon,
      reward_stock, owner_id,
    } = req.body;

    if (!name || !tipo || !lugar || !description) {
      return res.status(400).json({ success: false, error: 'Nombre, tipo, lugar y descripción son requeridos' });
    }

    const validTypes = ['hotel', 'restaurant', 'bar'];
    if (!validTypes.includes(tipo)) {
      return res.status(400).json({ success: false, error: 'Tipo inválido. Use: hotel, restaurant, bar' });
    }

    const result = db.prepare(`
      INSERT INTO places (
        name, tipo, lugar, description, image_url, rating,
        address, phone, price_range, amenities,
        has_reward, reward_name, reward_description, reward_icon,
        reward_stock, owner_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name, tipo, lugar, description,
      image_url    || null,
      rating       || 0,
      address      || null,
      phone        || null,
      price_range  || null,
      amenities    ? JSON.stringify(amenities) : null,
      has_reward   ? 1 : 0,
      reward_name  || null,
      reward_description || null,
      reward_icon  || '🎁',
      reward_stock !== undefined ? reward_stock : null,
      owner_id     || null,
    );

    const created = db.prepare('SELECT * FROM places WHERE id = ?').get(result.lastInsertRowid);
    console.log(`✅ Lugar creado: ${name} (${tipo})`);
    return res.status(201).json({ success: true, data: parsePlace(created) });

  } catch (error) {
    console.error('❌ Error en POST /places:', error);
    return res.status(500).json({ success: false, error: 'Error al crear lugar' });
  }
});

// ─── PUT /places/:id ──────────────────────────────────────
router.put('/:id', authenticateToken, authorize(['admin_general']), (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, tipo, lugar, description, image_url, rating,
      address, phone, price_range, amenities,
      has_reward, reward_name, reward_description, reward_icon,
      reward_stock, owner_id,
    } = req.body;

    const place = db.prepare('SELECT * FROM places WHERE id = ?').get(id);
    if (!place) return res.status(404).json({ success: false, error: 'Lugar no encontrado' });

    db.prepare(`
      UPDATE places SET
        name = ?, tipo = ?, lugar = ?, description = ?,
        image_url = ?, rating = ?, address = ?, phone = ?,
        price_range = ?, amenities = ?,
        has_reward = ?, reward_name = ?, reward_description = ?,
        reward_icon = ?, reward_stock = ?, owner_id = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      name        || place.name,
      tipo        || place.tipo,
      lugar       || place.lugar,
      description || place.description,
      image_url    !== undefined ? image_url    : place.image_url,
      rating       !== undefined ? rating       : place.rating,
      address      !== undefined ? address      : place.address,
      phone        !== undefined ? phone        : place.phone,
      price_range  !== undefined ? price_range  : place.price_range,
      amenities    !== undefined ? JSON.stringify(amenities) : place.amenities,
      has_reward   !== undefined ? (has_reward ? 1 : 0)     : place.has_reward,
      reward_name        !== undefined ? reward_name        : place.reward_name,
      reward_description !== undefined ? reward_description : place.reward_description,
      reward_icon        !== undefined ? reward_icon        : place.reward_icon,
      reward_stock       !== undefined ? reward_stock       : place.reward_stock,
      owner_id     !== undefined ? owner_id     : place.owner_id,
      id,
    );

    const updated = db.prepare('SELECT * FROM places WHERE id = ?').get(id);
    return res.json({ success: true, data: parsePlace(updated) });

  } catch (error) {
    console.error('❌ Error en PUT /places/:id:', error);
    return res.status(500).json({ success: false, error: 'Error al actualizar lugar' });
  }
});

// ─── DELETE /places/:id ───────────────────────────────────
router.delete('/:id', authenticateToken, authorize(['admin_general']), (req, res) => {
  try {
    const place = db.prepare('SELECT * FROM places WHERE id = ?').get(req.params.id);
    if (!place) return res.status(404).json({ success: false, error: 'Lugar no encontrado' });

    db.prepare("UPDATE places SET is_active = 0, updated_at = datetime('now') WHERE id = ?").run(req.params.id);
    return res.json({ success: true, message: `Lugar "${place.name}" desactivado` });

  } catch (error) {
    console.error('❌ Error en DELETE /places/:id:', error);
    return res.status(500).json({ success: false, error: 'Error al desactivar lugar' });
  }
});

module.exports = router;