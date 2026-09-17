const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const { run, get, all } = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { emitEvent } = require('../realtime');

const router = express.Router();

function mirrorUploadedFile(uploadedFilePath, filename) {
  const mirrors = [
    path.join(os.homedir(), 'AppData', 'Roaming', 'smart-pos-desktop', 'uploads'),
    path.join(__dirname, '../../uploads'),
    path.join('C:/Users/modif/AppData/Local/Programs/Smart POS/resources/backend/uploads'),
    path.join(__dirname, '../../../desktop-app/release/win-unpacked/resources/backend/uploads'),
  ];
  mirrors.forEach((dir) => {
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const dst = path.join(dir, filename);
      if (dst !== path.resolve(uploadedFilePath) && !fs.existsSync(dst)) {
        fs.copyFileSync(uploadedFilePath, dst);
      }
    } catch (_) {}
  });
}

// Multer storage for store logos
const uploadsDir = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'logo-' + uniqueSuffix + ext);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|gif|svg/;
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    const mime = file.mimetype;
    if (allowed.test(ext) || mime.startsWith('image/')) {
      return cb(null, true);
    }
    cb(new Error('รองรับเฉพาะไฟล์รูปภาพ (JPG, PNG, WEBP, GIF, SVG) เท่านั้น'));
  },
});

const DEFAULT_LOGO = {
  type: 'icon',
  image_url: '',
  icon_name: 'Store',
  icon_color: '#60a5fa',
  bg_color: 'rgba(37, 99, 235, 0.2)',
  border_color: 'rgba(59, 130, 246, 0.3)',
  size: 'md',
  shape: 'rounded-xl',
  store_name: 'POS System',
  store_slogan: 'ระบบจัดการร้านค้า',
  tone_style: 'soft',
  glow_effect: 'soft',
  shadow_effect: 'soft',
  border_width: 'thin',
  gradient_color: '#1e3a8a',
  glow_color: '#3b82f6',
};

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
 * Fetch store information (for receipts, invoices, and branding)
 */
router.get('/store', async (req, res) => {
  try {
    const row = await get("SELECT value FROM settings WHERE key = 'store_info'");
    if (row && row.value) {
      const data = JSON.parse(row.value);
      if (!data.logo) {
        data.logo = { ...DEFAULT_LOGO, store_name: data.name || 'POS System' };
      }
      return res.json(data);
    }
    res.json({
      name: 'Smart POS & Warehouse',
      phone: '',
      address: '',
      tax_id: '',
      receipt_footer: 'ขอบคุณที่ใช้บริการ',
      logo: DEFAULT_LOGO,
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

    const existing = await get("SELECT key FROM settings WHERE key = 'role_permissions'");
    if (existing) {
      await run("UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = 'role_permissions'", [valueStr]);
    } else {
      await run("INSERT INTO settings (key, value) VALUES ('role_permissions', ?)", [valueStr]);
    }

    emitEvent('settings:updated', { role_permissions: rolePermissions });

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
 * Update store info & logo branding (Admin only)
 */
router.put('/store', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const storeInfo = req.body;

    if (!storeInfo || typeof storeInfo !== 'object') {
      return res.status(400).json({ message: 'รูปแบบข้อมูลร้านค้าไม่ถูกต้อง' });
    }

    // Ensure logo object exists with default fallbacks
    if (!storeInfo.logo) {
      storeInfo.logo = { ...DEFAULT_LOGO, store_name: storeInfo.name || 'POS System' };
    }

    const valueStr = JSON.stringify(storeInfo);

    const existing = await get("SELECT key FROM settings WHERE key = 'store_info'");
    if (existing) {
      await run("UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = 'store_info'", [valueStr]);
    } else {
      await run("INSERT INTO settings (key, value) VALUES ('store_info', ?)", [valueStr]);
    }

    // Emit realtime event to notify all connected clients
    emitEvent('settings:updated', storeInfo);

    res.json({
      message: 'บันทึกข้อมูลร้านค้าและโลโก้เรียบร้อยแล้ว',
      store_info: storeInfo,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * POST /api/settings/logo
 * Upload store logo image (Admin only)
 */
router.post('/logo', authenticate, requireRole('admin'), upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'กรุณาเลือกไฟล์รูปภาพโลโก้' });
    }

    const logoUrl = `/uploads/${req.file.filename}`;
    mirrorUploadedFile(req.file.path, req.file.filename);

    // Load existing store_info
    let storeInfo = {
      name: 'Smart POS & Warehouse',
      phone: '',
      address: '',
      tax_id: '',
      receipt_footer: 'ขอบคุณที่ใช้บริการ',
      logo: { ...DEFAULT_LOGO },
    };

    const row = await get("SELECT value FROM settings WHERE key = 'store_info'");
    if (row && row.value) {
      try {
        storeInfo = JSON.parse(row.value);
      } catch {}
    }

    if (!storeInfo.logo) {
      storeInfo.logo = { ...DEFAULT_LOGO };
    }

    storeInfo.logo.type = 'image';
    storeInfo.logo.image_url = logoUrl;

    const valueStr = JSON.stringify(storeInfo);
    if (row) {
      await run("UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = 'store_info'", [valueStr]);
    } else {
      await run("INSERT INTO settings (key, value) VALUES ('store_info', ?)", [valueStr]);
    }

    // Emit realtime event
    emitEvent('settings:updated', storeInfo);

    res.json({
      message: 'อัปโหลดรูปภาพโลโก้สำเร็จ',
      logo_url: logoUrl,
      store_info: storeInfo,
    });
  } catch (err) {
    console.error('Upload logo error:', err);
    res.status(500).json({ message: err.message || 'เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ' });
  }
});

/**
 * DELETE /api/settings/logo
 * Reset logo to default icon (Admin only)
 */
router.delete('/logo', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const row = await get("SELECT value FROM settings WHERE key = 'store_info'");
    let storeInfo = {
      name: 'Smart POS & Warehouse',
      phone: '',
      address: '',
      tax_id: '',
      receipt_footer: 'ขอบคุณที่ใช้บริการ',
      logo: { ...DEFAULT_LOGO },
    };

    if (row && row.value) {
      try {
        storeInfo = JSON.parse(row.value);
      } catch {}
    }

    if (storeInfo.logo) {
      storeInfo.logo.type = 'icon';
      storeInfo.logo.image_url = '';
    }

    const valueStr = JSON.stringify(storeInfo);
    if (row) {
      await run("UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = 'store_info'", [valueStr]);
    } else {
      await run("INSERT INTO settings (key, value) VALUES ('store_info', ?)", [valueStr]);
    }

    emitEvent('settings:updated', storeInfo);

    res.json({
      message: 'รีเซ็ตโลโก้เป็นค่าเริ่มต้นเรียบร้อยแล้ว',
      store_info: storeInfo,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * POST /api/settings/clear-data
 * เคลียร์รายการข้อมูลตามประเภทที่เลือก
 */
router.post('/clear-data', authenticate, async (req, res) => {
  try {
    const { target, restore_stock = false, reset_stock = false } = req.body;

    if (!target) {
      return res.status(400).json({ message: 'กรุณาระบุประเภทข้อมูลที่ต้องการเคลียร์' });
    }

    if (target === 'sales') {
      if (restore_stock) {
        const saleItems = await all('SELECT product_id, SUM(qty) as total_qty FROM sale_items GROUP BY product_id');
        for (const item of saleItems) {
          const product = await get('SELECT stock_qty FROM products WHERE id = ?', [item.product_id]);
          if (product) {
            const restoredStock = product.stock_qty + Number(item.total_qty);
            await run('UPDATE products SET stock_qty = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [restoredStock, item.product_id]);
            await run(
              `INSERT INTO stock_movements (product_id, type, qty, qty_before, qty_after, ref_type, ref_id, note, user_id)
               VALUES (?, 'ADJUST', ?, ?, ?, 'clear_sales', 0, 'คืนสต็อกจากการล้างประวัติการขาย', ?)`,
              [item.product_id, item.total_qty, product.stock_qty, restoredStock, req.user.id]
            );
          }
        }
      }
      await run('DELETE FROM sale_items');
      await run('DELETE FROM sales');

      emitEvent('sales:cleared', { clear_all: true });
      emitEvent('dashboard:refresh', { trigger: 'sales_cleared' });
      emitEvent('inventory:updated', { action: 'sales_cleared' });

      return res.json({ message: 'เคลียร์ประวัติยอดขายและใบเสร็จทั้งหมดสำเร็จ' });
    }

    if (target === 'inventory') {
      await run('DELETE FROM stock_movements');
      await run('DELETE FROM po_items');
      await run('DELETE FROM purchase_orders');
      await run('DELETE FROM requisition_items');
      await run('DELETE FROM stock_requisitions');

      emitEvent('inventory:updated', { action: 'inventory_history_cleared' });
      emitEvent('dashboard:refresh', { trigger: 'inventory_history_cleared' });

      return res.json({ message: 'เคลียร์ประวัติความเคลื่อนไหวสต็อก, รับเข้า, และเบิกจ่ายทั้งหมดสำเร็จ' });
    }

    if (target === 'products') {
      await run('DELETE FROM stock_movements');
      await run('DELETE FROM po_items');
      await run('DELETE FROM requisition_items');
      await run('DELETE FROM sale_items');
      await run('DELETE FROM products');

      emitEvent('inventory:updated', { action: 'products_cleared' });
      emitEvent('dashboard:refresh', { trigger: 'products_cleared' });

      return res.json({ message: 'เคลียร์รายการสินค้าทั้งหมดออกจากระบบสำเร็จ' });
    }

    if (target === 'categories') {
      await run('UPDATE products SET category_id = NULL');
      await run('DELETE FROM categories');

      emitEvent('category:updated', { action: 'categories_cleared' });
      emitEvent('dashboard:refresh', { trigger: 'categories_cleared' });

      return res.json({ message: 'เคลียร์หมวดหมู่สินค้าทั้งหมดสำเร็จ' });
    }

    if (target === 'test_data') {
      await run('DELETE FROM sale_items');
      await run('DELETE FROM sales');
      await run('DELETE FROM stock_movements');
      await run('DELETE FROM po_items');
      await run('DELETE FROM purchase_orders');
      await run('DELETE FROM requisition_items');
      await run('DELETE FROM stock_requisitions');

      if (reset_stock) {
        await run('UPDATE products SET stock_qty = 0, updated_at = CURRENT_TIMESTAMP');
      }

      emitEvent('sales:cleared', { clear_all: true });
      emitEvent('inventory:updated', { action: 'test_data_cleared' });
      emitEvent('dashboard:refresh', { trigger: 'test_data_cleared' });

      return res.json({ message: 'เคลียร์ข้อมูลยอดขายและประวัติสต็อกทดสอบทั้งหมดเรียบร้อยแล้ว' });
    }

    if (target === 'all') {
      await run('DELETE FROM sale_items');
      await run('DELETE FROM sales');
      await run('DELETE FROM stock_movements');
      await run('DELETE FROM po_items');
      await run('DELETE FROM purchase_orders');
      await run('DELETE FROM requisition_items');
      await run('DELETE FROM stock_requisitions');
      await run('DELETE FROM products');
      await run('DELETE FROM categories');

      emitEvent('sales:cleared', { clear_all: true });
      emitEvent('inventory:updated', { action: 'all_cleared' });
      emitEvent('dashboard:refresh', { trigger: 'all_cleared' });

      return res.json({ message: 'ล้างข้อมูลระบบทั้งหมดเรียบร้อยแล้ว' });
    }

    return res.status(400).json({ message: 'ไม่พบประเภทข้อมูลที่ระบุ' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
