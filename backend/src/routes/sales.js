const express = require('express');
const { run, get, all } = require('../db/database');
const { authenticate } = require('../middleware/auth');
const { emitEvent } = require('../realtime');

const router = express.Router();

function generateSaleNo() {
  const now = new Date();
  const y = now.getFullYear().toString().slice(2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const t = Date.now().toString().slice(-5);
  return `S${y}${m}${d}${t}`;
}

const XLSX = require('xlsx');

// GET /api/sales/export - Download sales backup as Excel or JSON
router.get('/export', authenticate, async (req, res) => {
  try {
    const { from, to, search, payment_method, format = 'excel' } = req.query;
    let sql = `SELECT s.*, u.name as cashier_name FROM sales s LEFT JOIN users u ON s.user_id = u.id WHERE 1=1`;
    const params = [];

    if (from) { sql += ' AND date(s.created_at) >= ?'; params.push(from); }
    if (to)   { sql += ' AND date(s.created_at) <= ?'; params.push(to); }
    if (payment_method && payment_method !== 'all') {
      sql += ' AND s.payment_method = ?';
      params.push(payment_method);
    }
    if (search) {
      sql += ' AND (s.sale_no LIKE ? OR u.name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY s.created_at DESC';

    const sales = await all(sql, params);

    // Fetch items for all matching sales
    const allSaleIds = sales.map(s => s.id);
    let items = [];
    if (allSaleIds.length > 0) {
      const placeholders = allSaleIds.map(() => '?').join(',');
      items = await all(`SELECT si.*, s.sale_no, s.created_at FROM sale_items si JOIN sales s ON si.sale_id = s.id WHERE si.sale_id IN (${placeholders}) ORDER BY s.created_at DESC, si.id ASC`, allSaleIds);
    }

    if (format === 'json') {
      // Return full JSON backup
      const salesWithItems = sales.map(s => ({
        ...s,
        items: items.filter(i => i.sale_id === s.id)
      }));
      res.setHeader('Content-Disposition', `attachment; filename=sales-backup-${Date.now()}.json`);
      res.setHeader('Content-Type', 'application/json');
      return res.json({
        backup_date: new Date().toISOString(),
        total_records: sales.length,
        sales: salesWithItems
      });
    }

    // Build Excel workbook
    const summarySheetData = sales.map((s, idx) => ({
      'ลำดับ': idx + 1,
      'เลขที่บิล': s.sale_no,
      'วันที่-เวลา': s.created_at,
      'แคชเชียร์': s.cashier_name || '-',
      'วิธีชำระเงิน': s.payment_method === 'cash' ? 'เงินสด' : s.payment_method === 'promptpay' ? 'พร้อมเพย์/โอน' : s.payment_method === 'credit' ? 'บัตรเครดิต' : s.payment_method,
      'ยอดรวมก่อนลด (฿)': s.subtotal || s.total,
      'ส่วนลด (฿)': s.discount_amount || 0,
      'ยอดสุทธิ (฿)': s.total,
      'รับเงิน (฿)': s.payment_amount || s.total,
      'เงินทอน (฿)': s.change_amount || 0,
      'สถานะ': s.status,
      'หมายเหตุ': s.note || ''
    }));

    const detailSheetData = items.map((i, idx) => ({
      'ลำดับ': idx + 1,
      'เลขที่บิล': i.sale_no,
      'วันที่': i.created_at,
      'บาร์โค้ด': i.barcode || '',
      'ชื่อสินค้า': i.product_name,
      'จำนวน': i.qty,
      'ราคาต่อหน่วย (฿)': i.unit_price,
      'ส่วนลด (฿)': i.discount || 0,
      'ยอดรวม (฿)': i.subtotal
    }));

    const wb = XLSX.utils.book_new();
    const wsSummary = XLSX.utils.json_to_sheet(summarySheetData.length > 0 ? summarySheetData : [{ 'ข้อมูล': 'ไม่มีรายการขาย' }]);
    const wsDetails = XLSX.utils.json_to_sheet(detailSheetData.length > 0 ? detailSheetData : [{ 'ข้อมูล': 'ไม่มีรายการสินค้า' }]);

    XLSX.utils.book_append_sheet(wb, wsSummary, 'สรุปบิลขาย');
    XLSX.utils.book_append_sheet(wb, wsDetails, 'รายละเอียดสินค้าที่ขาย');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', `attachment; filename=sales-backup-${Date.now()}.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buf);
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการส่งออกข้อมูล: ' + err.message });
  }
});

// GET /api/sales
router.get('/', authenticate, async (req, res) => {
  try {
    const { from, to, search, payment_method, page = 1, limit = 50 } = req.query;
    let sql = `
      SELECT s.*, u.name as cashier_name,
        (SELECT COUNT(*) FROM sale_items WHERE sale_id = s.id) as items_count
      FROM sales s 
      LEFT JOIN users u ON s.user_id = u.id 
      WHERE 1=1
    `;
    const params = [];

    if (from) { sql += ' AND date(s.created_at) >= ?'; params.push(from); }
    if (to)   { sql += ' AND date(s.created_at) <= ?'; params.push(to); }
    if (payment_method && payment_method !== 'all') {
      sql += ' AND s.payment_method = ?';
      params.push(payment_method);
    }
    if (search) {
      sql += ' AND (s.sale_no LIKE ? OR u.name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    // Get total count for pagination
    let countSql = `SELECT COUNT(*) as count FROM sales s LEFT JOIN users u ON s.user_id = u.id WHERE 1=1`;
    const countParams = [];
    if (from) { countSql += ' AND date(s.created_at) >= ?'; countParams.push(from); }
    if (to)   { countSql += ' AND date(s.created_at) <= ?'; countParams.push(to); }
    if (payment_method && payment_method !== 'all') { countSql += ' AND s.payment_method = ?'; countParams.push(payment_method); }
    if (search) { countSql += ' AND (s.sale_no LIKE ? OR u.name LIKE ?)'; countParams.push(`%${search}%`, `%${search}%`); }

    const countRes = await get(countSql, countParams);
    const totalCount = countRes?.count || 0;

    sql += ' ORDER BY s.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
    const sales = await all(sql, params);

    res.json({
      sales,
      total: totalCount,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(totalCount / parseInt(limit))
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/sales/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const sale = await get(
      `SELECT s.*, u.name as cashier_name FROM sales s 
       LEFT JOIN users u ON s.user_id = u.id WHERE s.id = ?`,
      [req.params.id]
    );
    if (!sale) return res.status(404).json({ message: 'ไม่พบรายการขาย' });

    const items = await all('SELECT * FROM sale_items WHERE sale_id = ?', [req.params.id]);
    sale.items = items;
    res.json(sale);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sales - create sale
router.post('/', authenticate, async (req, res) => {
  try {
    const { items, discount_amount = 0, payment_method = 'cash', payment_amount, note } = req.body;
    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'ไม่มีรายการสินค้า' });
    }

    let subtotal = 0;
    const enrichedItems = [];

    for (const item of items) {
      const product = await get('SELECT * FROM products WHERE id = ? AND active = 1', [item.product_id]);
      if (!product) return res.status(400).json({ message: `ไม่พบสินค้า ID: ${item.product_id}` });
      if (product.stock_qty < item.qty) {
        return res.status(400).json({ message: `สินค้า "${product.name}" ไม่เพียงพอ (เหลือ ${product.stock_qty})` });
      }
      const itemSubtotal = item.qty * item.unit_price;
      subtotal += itemSubtotal;
      enrichedItems.push({ ...item, product, subtotal: itemSubtotal });
    }

    const taxAmount = 0;
    const total = subtotal - parseFloat(discount_amount) + taxAmount;
    const changeAmount = (parseFloat(payment_amount) || total) - total;
    const saleNo = generateSaleNo();

    const { lastID: saleId } = await run(
      `INSERT INTO sales (sale_no, user_id, subtotal, discount_amount, tax_amount, total, payment_method, payment_amount, change_amount, note, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')`,
      [saleNo, req.user.id, subtotal, discount_amount, taxAmount, total, payment_method, payment_amount || total, Math.max(0, changeAmount), note || '']
    );

    for (const item of enrichedItems) {
      await run(
        `INSERT INTO sale_items (sale_id, product_id, product_name, barcode, qty, unit_price, cost_price, discount, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [saleId, item.product_id, item.product.name, item.product.barcode, item.qty, item.unit_price, item.product.cost_price, item.discount || 0, item.subtotal]
      );

      const newStock = item.product.stock_qty - item.qty;
      await run('UPDATE products SET stock_qty = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newStock, item.product_id]);
      await run(
        `INSERT INTO stock_movements (product_id, type, qty, qty_before, qty_after, ref_type, ref_id, note, user_id)
         VALUES (?, 'SALE', ?, ?, ?, 'sale', ?, 'ขายสินค้า', ?)`,
        [item.product_id, item.qty, item.product.stock_qty, newStock, saleId, req.user.id]
      );
    }

    const sale = await get('SELECT * FROM sales WHERE id = ?', [saleId]);
    sale.items = await all('SELECT * FROM sale_items WHERE sale_id = ?', [saleId]);

    // Broadcast real-time event to all connected devices
    emitEvent('sale:created', {
      sale: {
        id: saleId,
        sale_no: saleNo,
        total,
        payment_method,
        items_count: enrichedItems.length,
        cashier_name: req.user?.name || 'Cashier',
        created_at: new Date().toISOString(),
      },
      stock_updates: enrichedItems.map((i) => ({
        product_id: i.product_id,
        new_stock: i.product.stock_qty - i.qty,
        qty_change: -i.qty,
      })),
    });

    emitEvent('inventory:updated', {
      action: 'sale',
      items: enrichedItems.map((i) => ({
        product_id: i.product_id,
        new_stock: i.product.stock_qty - i.qty,
      })),
    });

    emitEvent('dashboard:refresh', { trigger: 'sale', sale_id: saleId });

    res.status(201).json(sale);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/sales/:id - ลบรายการบิลขายเดี่ยว
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const restoreStock = req.query.restore_stock === 'true' || req.body?.restore_stock === true || (req.query.restore_stock === undefined && req.body?.restore_stock !== false);

    const sale = await get('SELECT * FROM sales WHERE id = ?', [id]);
    if (!sale) {
      return res.status(404).json({ message: 'ไม่พบรายการบิลขายที่ต้องการลบ' });
    }

    const items = await all('SELECT * FROM sale_items WHERE sale_id = ?', [id]);

    // คืนสต็อกสินค้ากลับเข้าระบบ หากตั้งค่า restore_stock เป็น true
    if (restoreStock && items.length > 0) {
      for (const item of items) {
        const prod = await get('SELECT stock_qty FROM products WHERE id = ?', [item.product_id]);
        if (prod) {
          const newStock = prod.stock_qty + item.qty;
          await run('UPDATE products SET stock_qty = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newStock, item.product_id]);
          await run(
            `INSERT INTO stock_movements (product_id, type, qty, qty_before, qty_after, ref_type, ref_id, note, user_id)
             VALUES (?, 'ADJUST', ?, ?, ?, 'void_sale', ?, ?, ?)`,
            [item.product_id, item.qty, prod.stock_qty, newStock, id, `คืนสต็อกจากการลบบิลขาย #${sale.sale_no}`, req.user?.id || null]
          );
        }
      }
    }

    // ลบรายการสินค้าในบิล, การเคลื่อนไหวสต็อกเดิมของบิลนี้ และบิลขาย
    await run('DELETE FROM sale_items WHERE sale_id = ?', [id]);
    await run("DELETE FROM stock_movements WHERE ref_type = 'sale' AND ref_id = ?", [id]);
    await run('DELETE FROM sales WHERE id = ?', [id]);

    // ส่งสัญญาณ Realtime แจ้งเตือนทุกเครื่อง
    emitEvent('sale:deleted', {
      sale_id: parseInt(id),
      sale_no: sale.sale_no,
      restored_stock: restoreStock,
    });

    if (restoreStock) {
      emitEvent('inventory:updated', {
        action: 'restore_stock',
        ref: sale.sale_no,
      });
    }

    emitEvent('dashboard:refresh', { trigger: 'sale_deleted', sale_id: id });

    res.json({
      success: true,
      message: `ลบรายการบิลขาย ${sale.sale_no} สำเร็จ`,
      restored_stock: restoreStock,
    });
  } catch (err) {
    console.error('Delete sale error:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการลบรายการขาย: ' + err.message });
  }
});

// Clear history handler (ใช้ร่วมกันทั้ง POST /clear และ DELETE /)
async function handleClearSales(req, res) {
  try {
    const { from, to, clear_all = false, restore_stock = false } = { ...req.query, ...req.body };

    let sql = 'SELECT * FROM sales WHERE 1=1';
    const params = [];

    const isClearAll = clear_all === true || clear_all === 'true';
    const isRestoreStock = restore_stock === true || restore_stock === 'true';

    if (!isClearAll) {
      if (from) {
        sql += ' AND date(created_at) >= ?';
        params.push(from);
      }
      if (to) {
        sql += ' AND date(created_at) <= ?';
        params.push(to);
      }
    }

    const sales = await all(sql, params);
    if (!sales || sales.length === 0) {
      return res.status(400).json({ message: 'ไม่พบรายการขายที่ตรงตามเงื่อนไขเพื่อเคลียร์ประวัติ' });
    }

    const saleIds = sales.map((s) => s.id);
    const placeholders = saleIds.map(() => '?').join(',');

    // คืนสต็อกสินค้าหากผู้ใช้เลือกคืนสต็อก
    if (isRestoreStock) {
      const items = await all(`SELECT * FROM sale_items WHERE sale_id IN (${placeholders})`, saleIds);
      const prodTotals = {};
      for (const item of items) {
        prodTotals[item.product_id] = (prodTotals[item.product_id] || 0) + item.qty;
      }

      for (const [productId, qty] of Object.entries(prodTotals)) {
        const prod = await get('SELECT stock_qty FROM products WHERE id = ?', [productId]);
        if (prod) {
          const newStock = prod.stock_qty + qty;
          await run('UPDATE products SET stock_qty = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newStock, productId]);
          await run(
            `INSERT INTO stock_movements (product_id, type, qty, qty_before, qty_after, ref_type, ref_id, note, user_id)
             VALUES (?, 'ADJUST', ?, ?, ?, 'clear_sales', 0, 'คืนสต็อกจากการล้างประวัติการขาย', ?)`,
            [productId, qty, prod.stock_qty, newStock, req.user?.id || null]
          );
        }
      }
    }

    // ลบรายการ sale_items, stock_movements, และ sales
    await run(`DELETE FROM sale_items WHERE sale_id IN (${placeholders})`, saleIds);
    await run(`DELETE FROM stock_movements WHERE ref_type = 'sale' AND ref_id IN (${placeholders})`, saleIds);
    await run(`DELETE FROM sales WHERE id IN (${placeholders})`, saleIds);

    // ส่งสัญญาณ Realtime แจ้งเตือนทุกเครื่อง
    emitEvent('sales:cleared', {
      count: sales.length,
      clear_all: isClearAll,
      from,
      to,
      restored_stock: isRestoreStock,
    });

    if (isRestoreStock) {
      emitEvent('inventory:updated', { action: 'clear_sales_restore' });
    }
    emitEvent('dashboard:refresh', { trigger: 'sales_cleared' });

    res.json({
      success: true,
      message: `เคลียร์ประวัติยอดขายเรียบร้อยแล้ว ทั้งหมด ${sales.length} รายการ`,
      count: sales.length,
      restored_stock: isRestoreStock,
    });
  } catch (err) {
    console.error('Clear sales error:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการเคลียร์ประวัติยอดขาย: ' + err.message });
  }
}

// POST /api/sales/clear - เคลียร์ประวัติยอดขาย
router.post('/clear', authenticate, handleClearSales);

// DELETE /api/sales - เคลียร์ประวัติยอดขายแบบ RESTful
router.delete('/', authenticate, handleClearSales);

// POST /api/sales/bulk-delete - ลบรายการขายหลายรายการพร้อมกัน
router.post('/bulk-delete', authenticate, async (req, res) => {
  try {
    const { ids, restore_stock = true } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'กรุณาระบุรายการบิลขายที่ต้องการลบ' });
    }

    const placeholders = ids.map(() => '?').join(',');
    const sales = await all(`SELECT id, sale_no FROM sales WHERE id IN (${placeholders})`, ids);
    if (!sales || sales.length === 0) {
      return res.status(404).json({ message: 'ไม่พบรายการบิลขายที่ต้องการลบ' });
    }

    const saleIds = sales.map((s) => s.id);
    const validPlaceholders = saleIds.map(() => '?').join(',');
    const shouldRestore = restore_stock === true || restore_stock === 'true';

    if (shouldRestore) {
      const items = await all(`SELECT * FROM sale_items WHERE sale_id IN (${validPlaceholders})`, saleIds);
      const prodTotals = {};
      for (const item of items) {
        prodTotals[item.product_id] = (prodTotals[item.product_id] || 0) + item.qty;
      }
      for (const [productId, qty] of Object.entries(prodTotals)) {
        const prod = await get('SELECT stock_qty FROM products WHERE id = ?', [productId]);
        if (prod) {
          const newStock = prod.stock_qty + qty;
          await run('UPDATE products SET stock_qty = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newStock, productId]);
          await run(
            `INSERT INTO stock_movements (product_id, type, qty, qty_before, qty_after, ref_type, ref_id, note, user_id)
             VALUES (?, 'ADJUST', ?, ?, ?, 'void_sales_bulk', 0, 'คืนสต็อกจากการลบบิลขายหลายรายการ', ?)`,
            [productId, qty, prod.stock_qty, newStock, req.user?.id || null]
          );
        }
      }
    }

    await run(`DELETE FROM sale_items WHERE sale_id IN (${validPlaceholders})`, saleIds);
    await run(`DELETE FROM stock_movements WHERE ref_type = 'sale' AND ref_id IN (${validPlaceholders})`, saleIds);
    await run(`DELETE FROM sales WHERE id IN (${validPlaceholders})`, saleIds);

    emitEvent('sale:deleted', { count: saleIds.length, bulk: true, restored_stock: shouldRestore });
    if (shouldRestore) {
      emitEvent('inventory:updated', { action: 'bulk_restore' });
    }
    emitEvent('dashboard:refresh', { trigger: 'bulk_sales_deleted' });

    res.json({
      success: true,
      message: `ลบรายการขายที่เลือกสำเร็จ ทั้งหมด ${saleIds.length} รายการ`,
      count: saleIds.length,
      restored_stock: shouldRestore,
    });
  } catch (err) {
    console.error('Bulk delete sales error:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการลบรายการขาย: ' + err.message });
  }
});

module.exports = router;

