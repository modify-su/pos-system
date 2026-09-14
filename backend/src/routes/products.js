const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { run, get, all } = require('../db/database');
const { authenticate } = require('../middleware/auth');
const { emitEvent } = require('../realtime');

const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer disk storage configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'product-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|gif|svg/;
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    const mime = file.mimetype;
    if (allowed.test(ext) || mime.startsWith('image/')) {
      return cb(null, true);
    }
    cb(new Error('รองรับเฉพาะไฟล์รูปภาพ (JPG, PNG, WEBP, GIF, SVG) เท่านั้น'));
  }
});

// POST /api/products/upload - Upload product image file
router.post('/upload', authenticate, (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ message: err.message || 'เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'กรุณาเลือกไฟล์รูปภาพ' });
    }
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({
      url: fileUrl,
      filename: req.file.filename,
      message: 'อัปโหลดรูปภาพสำเร็จ'
    });
  });
});

// GET /api/products - list all
router.get('/', authenticate, async (req, res) => {
  try {
    const { search, category_id, low_stock, page = 1, limit = 50 } = req.query;
    let sql = `
      SELECT p.*, c.name as category_name, s.name as supplier_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.active = 1
    `;
    const params = [];
    if (search) {
      sql += ` AND (p.name LIKE ? OR p.barcode LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }
    if (category_id) {
      sql += ` AND p.category_id = ?`;
      params.push(category_id);
    }
    if (low_stock === 'true') {
      sql += ` AND p.stock_qty <= p.min_stock`;
    }
    sql += ` ORDER BY p.name LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const products = await all(sql, params);
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/products/barcode/:barcode
router.get('/barcode/:barcode', authenticate, async (req, res) => {
  try {
    const product = await get(
      `SELECT p.*, c.name as category_name FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.barcode = ? AND p.active = 1`,
      [req.params.barcode]
    );
    if (!product) return res.status(404).json({ message: 'ไม่พบสินค้า' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/products/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const product = await get(
      `SELECT p.*, c.name as category_name, s.name as supplier_name FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN suppliers s ON p.supplier_id = s.id
       WHERE p.id = ?`,
      [req.params.id]
    );
    if (!product) return res.status(404).json({ message: 'ไม่พบสินค้า' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/products
router.post('/', authenticate, async (req, res) => {
  try {
    const { barcode, name, description, category_id, supplier_id, unit, cost_price, sell_price, stock_qty, min_stock, image_url } = req.body;
    if (!name) return res.status(400).json({ message: 'กรุณากรอกชื่อสินค้า' });

    // Auto-generate barcode if not provided
    const finalBarcode = barcode || `ITM${Date.now()}`;

    const { lastID } = await run(
      `INSERT INTO products (barcode, name, description, category_id, supplier_id, unit, cost_price, sell_price, stock_qty, min_stock, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [finalBarcode, name, description || '', category_id || null, supplier_id || null,
       unit || 'ชิ้น', cost_price || 0, sell_price || 0, stock_qty || 0, min_stock || 5, image_url || '']
    );

    if (stock_qty > 0) {
      await run(
        `INSERT INTO stock_movements (product_id, type, qty, qty_before, qty_after, ref_type, note, user_id)
         VALUES (?, 'IN', ?, 0, ?, 'initial', 'สต็อกเริ่มต้น', ?)`,
        [lastID, stock_qty, stock_qty, req.user.id]
      );
    }

    const product = await get('SELECT * FROM products WHERE id = ?', [lastID]);
    emitEvent('inventory:updated', { action: 'product_create', product });
    emitEvent('dashboard:refresh', { trigger: 'product_create' });
    res.status(201).json(product);
  } catch (err) {
    if (err.message?.includes('UNIQUE')) {
      res.status(400).json({ message: 'บาร์โค้ดซ้ำกับสินค้าอื่น' });
    } else {
      res.status(500).json({ message: err.message });
    }
  }
});

// PUT /api/products/:id
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { barcode, name, description, category_id, supplier_id, unit, cost_price, sell_price, min_stock, image_url } = req.body;
    await run(
      `UPDATE products SET barcode=?, name=?, description=?, category_id=?, supplier_id=?,
       unit=?, cost_price=?, sell_price=?, min_stock=?, image_url=?, updated_at=CURRENT_TIMESTAMP
       WHERE id=?`,
      [barcode, name, description, category_id, supplier_id, unit, cost_price, sell_price, min_stock, image_url || '', req.params.id]
    );
    const product = await get('SELECT * FROM products WHERE id = ?', [req.params.id]);
    emitEvent('inventory:updated', { action: 'product_update', product });
    emitEvent('dashboard:refresh', { trigger: 'product_update' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/products/:id (soft delete)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    await run('UPDATE products SET active = 0 WHERE id = ?', [req.params.id]);
    emitEvent('inventory:updated', { action: 'product_delete', id: req.params.id });
    emitEvent('dashboard:refresh', { trigger: 'product_delete' });
    res.json({ message: 'ลบสินค้าสำเร็จ' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
