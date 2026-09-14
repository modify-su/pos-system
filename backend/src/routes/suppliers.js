const express = require('express');
const { run, get, all } = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/suppliers
router.get('/', authenticate, async (req, res) => {
  try {
    const suppliers = await all('SELECT * FROM suppliers ORDER BY name');
    res.json(suppliers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { name, contact_name, phone, email, address, tax_id } = req.body;
    if (!name) return res.status(400).json({ message: 'กรุณากรอกชื่อผู้จัดจำหน่าย' });
    const { lastID } = await run(
      'INSERT INTO suppliers (name, contact_name, phone, email, address, tax_id) VALUES (?, ?, ?, ?, ?, ?)',
      [name, contact_name, phone, email, address, tax_id]
    );
    const sup = await get('SELECT * FROM suppliers WHERE id = ?', [lastID]);
    res.status(201).json(sup);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const { name, contact_name, phone, email, address, tax_id } = req.body;
    await run(
      'UPDATE suppliers SET name=?, contact_name=?, phone=?, email=?, address=?, tax_id=? WHERE id=?',
      [name, contact_name, phone, email, address, tax_id, req.params.id]
    );
    const sup = await get('SELECT * FROM suppliers WHERE id = ?', [req.params.id]);
    res.json(sup);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    await run('DELETE FROM suppliers WHERE id=?', [req.params.id]);
    res.json({ message: 'ลบผู้จัดจำหน่ายสำเร็จ' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
