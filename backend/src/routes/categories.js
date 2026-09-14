const express = require('express');
const { run, get, all } = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/categories
router.get('/', authenticate, async (req, res) => {
  try {
    const categories = await all(
      `SELECT c.*, COUNT(p.id) as product_count 
       FROM categories c LEFT JOIN products p ON c.id = p.category_id AND p.active=1
       GROUP BY c.id ORDER BY c.name`
    );
    res.json(categories);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ message: 'กรุณากรอกชื่อหมวดหมู่' });
    const { lastID } = await run('INSERT INTO categories (name, description) VALUES (?, ?)', [name, description || '']);
    const cat = await get('SELECT * FROM categories WHERE id = ?', [lastID]);
    res.status(201).json(cat);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const { name, description } = req.body;
    await run('UPDATE categories SET name=?, description=? WHERE id=?', [name, description, req.params.id]);
    const cat = await get('SELECT * FROM categories WHERE id = ?', [req.params.id]);
    res.json(cat);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const used = await get('SELECT id FROM products WHERE category_id=? AND active=1 LIMIT 1', [req.params.id]);
    if (used) return res.status(400).json({ message: 'ไม่สามารถลบได้ มีสินค้าในหมวดนี้อยู่' });
    await run('DELETE FROM categories WHERE id=?', [req.params.id]);
    res.json({ message: 'ลบหมวดหมู่สำเร็จ' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
