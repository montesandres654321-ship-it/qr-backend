// src/routes/upload.routes.js
// ============================================================
// NUEVO: Endpoint para subir imágenes de lugares
// POST /admin/upload-image → recibe archivo, guarda en /uploads/places/
// Retorna la URL relativa de la imagen
// ============================================================

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const router   = express.Router();
const { authenticateToken } = require('../middleware/auth');
const authorize = require('../middleware/authorize');

// ── Crear carpeta si no existe ───────────────────────────
const uploadsDir = path.join(__dirname, '../../uploads/places');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// ── Configuración de multer ──────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Nombre único: timestamp + nombre original limpio
    const ext = path.extname(file.originalname).toLowerCase();
    const name = file.originalname
      .replace(ext, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .substring(0, 50);
    const uniqueName = `${Date.now()}_${name}${ext}`;
    cb(null, uniqueName);
  },
});

// ── Filtro de tipos de archivo ───────────────────────────
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}. Use JPG, PNG o WebP.`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB máximo
  },
});

// ── POST /admin/upload-image ─────────────────────────────
// Sube una imagen y retorna la URL
// Accesible por admin_general y user_place
router.post('/admin/upload-image',
  authenticateToken,
  authorize(['admin_general', 'user_place']),
  (req, res) => {
    upload.single('image')(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
              success: false,
              error: 'La imagen no puede superar 5MB',
            });
          }
          return res.status(400).json({
            success: false,
            error: `Error de upload: ${err.message}`,
          });
        }
        return res.status(400).json({
          success: false,
          error: err.message || 'Error al subir imagen',
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No se recibió ninguna imagen. Envíe un archivo con el campo "image".',
        });
      }

      // URL relativa accesible desde el frontend
      const imageUrl = `/uploads/places/${req.file.filename}`;

      console.log(`✅ Imagen subida: ${req.file.filename} (${(req.file.size / 1024).toFixed(0)} KB)`);

      return res.status(201).json({
        success: true,
        message: 'Imagen subida correctamente',
        imageUrl: imageUrl,
        image_url: imageUrl, // alias para compatibilidad
        filename: req.file.filename,
        size: req.file.size,
      });
    });
  }
);

module.exports = router;