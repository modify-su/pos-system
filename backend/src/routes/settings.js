const express = require('express');
const { run, get, all } = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/settings
 * Fetch all system settings
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const rows = await all('SELECT key, value, updated_at FROM settings');
    const settings = {};

    rows.forEach((row) => {
      try {
        settings[row.key] = JSON.parse(row.value);
      } catch {
        settings[row.key] = row.value;
      }
    });

    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * GET /api/settings/store
 * Fetch store information (for receipts and invoices)
 */
router.get('/store', async (req, res) => {
  try {
    const row = await get('SELECT value FROM settings WHERE key = "store_info"');
    if (row && row.value) {
      return res.json(JSON.parse(row.value));
    }
    res.json({
      name: 'Smart POS & Warehouse',
      phone: '',
      address: '',
      tax_id: '',
      receipt_footer: 'ขอบคุณที่ใช้บริการ',
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * PUT /api/settings/roles
 * Update role permissions template (Admin only)
 */
router.put('/roles', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const rolePermissions = req.body;

    if (!rolePermissions || typeof rolePermissions !== 'object') {
      return res.status(400).json({ message: 'รูปแบบข้อมูลสิทธิ์ไม่ถูกต้อง' });
    }

    // Safety check: Admin must always have settings and dashboard
    if (!rolePermissions.admin) {
      rolePermissions.admin = ['dashboard', 'pos', 'inventory', 'stock-in', 'stock-out', 'products', 'categories', 'reports', 'settings'];
    } else {
      if (!rolePermissions.admin.includes('settings')) {
        rolePermissions.admin.push('settings');
      }
      if (!rolePermissions.admin.includes('dashboard')) {
        rolePermissions.admin.push('dashboard');
      }
    }

    const valueStr = JSON.stringify(rolePermissions);

    const existing = await get('SELECT key FROM settings WHERE key = "role_permissions"');
    if (existing) {
      await run('UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = "role_permissions"', [valueStr]);
    } else {
      await run('INSERT INTO settings (key, value) VALUES ("role_permissions", ?)', [valueStr]);
    }

    res.json({
      message: 'บันทึกสิทธิ์เริ่มต้นของบทบาทเรียบร้อยแล้ว',
      role_permissions: rolePermissions,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * PUT /api/settings/store
 * Update store info (Admin only)
 */
router.put('/store', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const storeInfo = req.body;

    if (!storeInfo || typeof storeInfo !== 'object') {
      return res.status(400).json({ message: 'รูปแบบข้อมูลร้านค้าไม่ถูกต้อง' });
    }

    const valueStr = JSON.stringify(storeInfo);

    const existing = await get('SELECT key FROM settings WHERE key = "store_info"');
    if (existing) {
      await run('UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = "store_info"', [valueStr]);
    } else {
      await run('INSERT INTO settings (key, value) VALUES ("store_info", ?)', [valueStr]);
    }

    res.json({
      message: 'บันทึกข้อมูลร้านค้าเรียบร้อยแล้ว',
      store_info: storeInfo,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
