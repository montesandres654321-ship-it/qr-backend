// src/routes/places.routes.js
// ============================================================
// FIX: Quitado filtro de 30 días en /my-place/stats scansByDay
// Ahora muestra TODO el historial de escaneos
// ============================================================

const express        = require('express');
const router         = express.Router();
const db             = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const authorize      = require('../middleware/authorize');
const checkOwnership = require('../middleware/checkOwnership');

const parsePlace = (place) => ({
  ...place,
  amenities:    place.amenities  ? JSON.parse(place.amenities) : [],
  has_reward:   place.has_reward === 1,
  reward_stock: place.reward_stock ?? null,
});

router.get('/', (req, res) => {
  try {
    const { tipo } = req.query;
    const validTypes = ['hotel', 'restaurant', 'bar'];
    let places;
    if (tipo && validTypes.includes(tipo.toLowerCase())) {
      places = db.prepare('SELECT * FROM places WHERE tipo = ? AND is_active = 1 ORDER BY rating DESC').all(tipo.toLowerCase());
    } else {
      places = db.prepare('SELECT * FROM places WHERE is_active = 1 ORDER BY rating DESC').all();
    }
    return res.json({ success: true, data: places.map(parsePlace) });
  } catch (error) {
    console.error('❌ Error en GET /places:', error);
    return res.status(500).json({ success: false, error: 'Error al obtener lugares' });
  }
});

router.get('/type/:type', (req, res) => {
  try {
    const { type } = req.params;
    const validTypes = ['hotel', 'restaurant', 'bar'];
    if (!validTypes.includes(type.toLowerCase())) {
      return res.status(400).json({ success: false, error: 'Tipo inválido' });
    }
    const places = db.prepare('SELECT * FROM places WHERE tipo = ? AND is_active = 1 ORDER BY rating DESC').all(type.toLowerCase());
    return res.json({ success: true, data: places.map(parsePlace) });
  } catch (error) {
    console.error('❌ Error en GET /places/type/:type:', error);
    return res.status(500).json({ success: false, error: 'Error al obtener lugares' });
  }
});

// ─── GET /places/my-place/stats ───────────────────────────
// FIX: SIN filtro de 30 días — muestra TODO el historial
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

      // FIX: Sin filtro de fecha — muestra todo el historial
      const lastScans = db.prepare(`
        SELECT DATE(created_at) as date, COUNT(*) as count
        FROM scans WHERE place_id = ?
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

router.patch('/my-place/reward',
  authenticateToken, authorize(['user_place']),
  (req, res) => {
    try {
      const placeId = req.user.place_id;
      if (!placeId) return res.status(400).json({ success: false, error: 'No tienes un lugar asignado' });
      const { reward_name, reward_description, reward_icon, reward_stock } = req.body;
      if (reward_name === undefined && reward_description === undefined && reward_icon === undefined && reward_stock === undefined) {
        return res.status(400).json({ success: false, error: 'Se requiere al menos un campo de recompensa' });
      }
      const place = db.prepare('SELECT * FROM places WHERE id = ?').get(placeId);
      if (!place) return res.status(404).json({ success: false, error: 'Lugar no encontrado' });
      if (reward_name !== undefined && !reward_name.trim()) return res.status(400).json({ success: false, error: 'Nombre vacío' });
      if (reward_stock !== undefined && reward_stock !== null) {
        const stock = parseInt(reward_stock);
        if (isNaN(stock) || stock < 0) return res.status(400).json({ success: false, error: 'Stock inválido' });
      }
      const nn = reward_name !== undefined ? reward_name.trim() : place.reward_name;
      const nd = reward_description !== undefined ? reward_description.trim() : place.reward_description;
      const ni = reward_icon !== undefined ? reward_icon : place.reward_icon;
      const ns = reward_stock !== undefined ? (reward_stock === null ? null : parseInt(reward_stock)) : place.reward_stock;
      db.prepare(`UPDATE places SET reward_name = ?, reward_description = ?, reward_icon = ?, reward_stock = ?, updated_at = datetime('now') WHERE id = ?`).run(nn, nd, ni, ns, placeId);
      const updated = db.prepare('SELECT * FROM places WHERE id = ?').get(placeId);
      console.log(`✅ Recompensa actualizada: Lugar ID:${placeId}`);
      return res.json({ success: true, message: 'Recompensa actualizada', data: { reward_name: updated.reward_name, reward_description: updated.reward_description, reward_icon: updated.reward_icon, reward_stock: updated.reward_stock } });
    } catch (error) {
      console.error('❌ Error en PATCH /my-place/reward:', error);
      return res.status(500).json({ success: false, error: 'Error al actualizar recompensa' });
    }
  }
);

router.patch('/my-place',
  authenticateToken, authorize(['user_place']),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const user = db.prepare('SELECT place_id FROM users WHERE id = ?').get(userId);
      if (!user || !user.place_id) return res.status(404).json({ success: false, error: 'No tienes un lugar asignado' });
      const placeId = user.place_id;
      const place = db.prepare('SELECT * FROM places WHERE id = ?').get(placeId);
      if (!place) return res.status(404).json({ success: false, error: 'Lugar no encontrado' });
      const { description, phone, address, image_url, has_reward, reward_icon, reward_name, reward_description, reward_stock } = req.body;
      if (description === undefined && phone === undefined && address === undefined && image_url === undefined && has_reward === undefined && reward_icon === undefined && reward_name === undefined && reward_description === undefined && reward_stock === undefined) {
        return res.status(400).json({ success: false, error: 'Se requiere al menos un campo' });
      }
      if (description !== undefined && !description.trim()) return res.status(400).json({ success: false, error: 'Descripción vacía' });
      if (has_reward === true && reward_name !== undefined && !reward_name.trim()) return res.status(400).json({ success: false, error: 'Nombre recompensa vacío' });
      if (reward_stock !== undefined && reward_stock !== null) { const s = parseInt(reward_stock); if (isNaN(s) || s < 0) return res.status(400).json({ success: false, error: 'Stock inválido' }); }
      const fields = []; const values = [];
      if (description !== undefined) { fields.push('description = ?'); values.push(description.trim()); }
      if (phone !== undefined) { fields.push('phone = ?'); values.push(phone ? phone.trim() : null); }
      if (address !== undefined) { fields.push('address = ?'); values.push(address ? address.trim() : null); }
      if (image_url !== undefined) { fields.push('image_url = ?'); values.push(image_url ? image_url.trim() : null); }
      if (has_reward !== undefined) { fields.push('has_reward = ?'); values.push(has_reward ? 1 : 0); }
      if (reward_icon !== undefined) { fields.push('reward_icon = ?'); values.push(reward_icon || null); }
      if (reward_name !== undefined) { fields.push('reward_name = ?'); values.push(reward_name ? reward_name.trim() : null); }
      if (reward_description !== undefined) { fields.push('reward_description = ?'); values.push(reward_description ? reward_description.trim() : null); }
      if (reward_stock !== undefined) { fields.push('reward_stock = ?'); values.push(reward_stock === null ? null : parseInt(reward_stock)); }
      fields.push("updated_at = datetime('now')"); values.push(placeId);
      db.prepare(`UPDATE places SET ${fields.join(', ')} WHERE id = ?`).run(...values);
      const updated = db.prepare('SELECT * FROM places WHERE id = ?').get(placeId);
      console.log(`✅ Lugar editado: ID:${placeId} (user:${userId})`);
      return res.json({ success: true, message: 'Actualizado correctamente', data: parsePlace(updated) });
    } catch (error) {
      console.error('❌ Error en PATCH /my-place:', error);
      return res.status(500).json({ success: false, error: 'Error al actualizar' });
    }
  }
);

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

router.post('/', authenticateToken, authorize(['admin_general']), (req, res) => {
  try {
    const { name, tipo, lugar, description, image_url, rating, address, phone, price_range, amenities, has_reward, reward_name, reward_description, reward_icon, reward_stock, owner_id } = req.body;
    if (!name || !tipo || !lugar || !description) return res.status(400).json({ success: false, error: 'Campos requeridos' });
    const validTypes = ['hotel', 'restaurant', 'bar'];
    if (!validTypes.includes(tipo)) return res.status(400).json({ success: false, error: 'Tipo inválido' });
    const result = db.prepare(`INSERT INTO places (name, tipo, lugar, description, image_url, rating, address, phone, price_range, amenities, has_reward, reward_name, reward_description, reward_icon, reward_stock, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      name, tipo, lugar, description, image_url || null, rating || 0, address || null, phone || null, price_range || null,
      amenities ? JSON.stringify(amenities) : null, has_reward ? 1 : 0, reward_name || null, reward_description || null,
      reward_icon || '🎁', reward_stock !== undefined ? reward_stock : null, owner_id || null);
    const created = db.prepare('SELECT * FROM places WHERE id = ?').get(result.lastInsertRowid);
    console.log(`✅ Lugar creado: ${name} (${tipo})`);
    return res.status(201).json({ success: true, data: parsePlace(created) });
  } catch (error) {
    console.error('❌ Error en POST /places:', error);
    return res.status(500).json({ success: false, error: 'Error al crear lugar' });
  }
});

router.put('/:id', authenticateToken, authorize(['admin_general']), (req, res) => {
  try {
    const { id } = req.params;
    const { name, tipo, lugar, description, image_url, rating, address, phone, price_range, amenities, has_reward, reward_name, reward_description, reward_icon, reward_stock, owner_id } = req.body;
    const place = db.prepare('SELECT * FROM places WHERE id = ?').get(id);
    if (!place) return res.status(404).json({ success: false, error: 'Lugar no encontrado' });
    db.prepare(`UPDATE places SET name=?, tipo=?, lugar=?, description=?, image_url=?, rating=?, address=?, phone=?, price_range=?, amenities=?, has_reward=?, reward_name=?, reward_description=?, reward_icon=?, reward_stock=?, owner_id=?, updated_at=datetime('now') WHERE id=?`).run(
      name || place.name, tipo || place.tipo, lugar || place.lugar, description || place.description,
      image_url !== undefined ? image_url : place.image_url, rating !== undefined ? rating : place.rating,
      address !== undefined ? address : place.address, phone !== undefined ? phone : place.phone,
      price_range !== undefined ? price_range : place.price_range,
      amenities !== undefined ? JSON.stringify(amenities) : place.amenities,
      has_reward !== undefined ? (has_reward ? 1 : 0) : place.has_reward,
      reward_name !== undefined ? reward_name : place.reward_name,
      reward_description !== undefined ? reward_description : place.reward_description,
      reward_icon !== undefined ? reward_icon : place.reward_icon,
      reward_stock !== undefined ? reward_stock : place.reward_stock,
      owner_id !== undefined ? owner_id : place.owner_id, id);
    const updated = db.prepare('SELECT * FROM places WHERE id = ?').get(id);
    return res.json({ success: true, data: parsePlace(updated) });
  } catch (error) {
    console.error('❌ Error en PUT /places/:id:', error);
    return res.status(500).json({ success: false, error: 'Error al actualizar lugar' });
  }
});

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