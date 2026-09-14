const express = require('express');
const { run, get, all } = require('../db/database');
const { authenticate } = require('../middleware/auth');
const { emitEvent } = require('../realtime');

const router = express.Router();

// GET /api/inventory/movements
router.get('/movements', authenticate, async (req, res) => {
  try {
    const { product_id, type, from, to, limit = 50, page = 1 } = req.query;
    let sql = `
      SELECT m.*, p.name as product_name, p.barcode, u.name as user_name
      FROM stock_movements m
      LEFT JOIN products p ON m.product_id = p.id
      LEFT JOIN users u ON m.user_id = u.id
      WHERE 1=1
    `;
    const params = [];
    if (product_id) { sql += ' AND m.product_id = ?'; params.push(product_id); }
    if (type)       { sql += ' AND m.type = ?'; params.push(type); }
    if (from)       { sql += ' AND date(m.created_at) >= ?'; params.push(from); }
    if (to)         { sql += ' AND date(m.created_at) <= ?'; params.push(to); }
    sql += ' ORDER BY m.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
    const movements = await all(sql, params);
    res.json(movements);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/inventory/stock-in (รับสินค้าเข้าคลัง)
router.post('/stock-in', authenticate, async (req, res) => {
  try {
    const { supplier_id, items, note } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ message: 'ไม่มีรายการสินค้า' });

    const poNo = `PO${Date.now().toString().slice(-8)}`;
    let totalAmount = 0;

    const { lastID: poId } = await run(
      'INSERT INTO purchase_orders (po_no, supplier_id, user_id, status, note) VALUES (?, ?, ?, "completed", ?)',
      [poNo, supplier_id || null, req.user.id, note || '']
    );

    for (const item of items) {
      const product = await get('SELECT * FROM products WHERE id = ?', [item.product_id]);
      if (!product) continue;

      const subtotal = item.qty * (item.cost_price || product.cost_price);
      totalAmount += subtotal;

      await run(
        'INSERT INTO po_items (po_id, product_id, qty, cost_price, subtotal) VALUES (?, ?, ?, ?, ?)',
        [poId, item.product_id, item.qty, item.cost_price || product.cost_price, subtotal]
      );

      const newStock = product.stock_qty + item.qty;
      await run('UPDATE products SET stock_qty = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newStock, item.product_id]);

      if (item.cost_price && item.cost_price !== product.cost_price) {
        await run('UPDATE products SET cost_price = ? WHERE id = ?', [item.cost_price, item.product_id]);
      }

      await run(
        `INSERT INTO stock_movements (product_id, type, qty, qty_before, qty_after, ref_type, ref_id, note, user_id)
         VALUES (?, 'IN', ?, ?, ?, 'purchase_order', ?, ?, ?)`,
        [item.product_id, item.qty, product.stock_qty, newStock, poId, `รับสินค้าเข้า PO: ${poNo}`, req.user.id]
      );
    }

    await run('UPDATE purchase_orders SET total_amount = ? WHERE id = ?', [totalAmount, poId]);

    const po = await get('SELECT * FROM purchase_orders WHERE id = ?', [poId]);
    po.items = await all('SELECT pi.*, p.name as product_name, p.image_url, p.barcode, p.unit FROM po_items pi JOIN products p ON pi.product_id = p.id WHERE pi.po_id = ?', [poId]);

    emitEvent('inventory:updated', { action: 'stock_in', po_no: poNo, items_count: items.length });
    emitEvent('dashboard:refresh', { trigger: 'stock_in' });

    res.status(201).json(po);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/inventory/purchase-orders
router.get('/purchase-orders', authenticate, async (req, res) => {
  try {
    const { from, to, page = 1, limit = 20 } = req.query;
    let sql = `SELECT po.*, u.name as user_name, s.name as supplier_name
               FROM purchase_orders po
               LEFT JOIN users u ON po.user_id = u.id
               LEFT JOIN suppliers s ON po.supplier_id = s.id WHERE 1=1`;
    const params = [];
    if (from) { sql += ' AND date(po.created_at) >= ?'; params.push(from); }
    if (to)   { sql += ' AND date(po.created_at) <= ?'; params.push(to); }
    sql += ' ORDER BY po.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
    const orders = await all(sql, params);
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/inventory/purchase-orders/:id
router.get('/purchase-orders/:id', authenticate, async (req, res) => {
  try {
    const po = await get('SELECT po.*, u.name as user_name, s.name as supplier_name FROM purchase_orders po LEFT JOIN users u ON po.user_id = u.id LEFT JOIN suppliers s ON po.supplier_id = s.id WHERE po.id = ?', [req.params.id]);
    if (!po) return res.status(404).json({ message: 'ไม่พบรายการ' });
    po.items = await all('SELECT pi.*, p.name as product_name, p.barcode, p.image_url, p.unit FROM po_items pi JOIN products p ON pi.product_id = p.id WHERE pi.po_id = ?', [req.params.id]);
    res.json(po);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/inventory/purchase-orders/:id (ลบ/ยกเลิกเอกสารรับเข้า พร้อมปรับคืนสต็อก)
router.delete('/purchase-orders/:id', authenticate, async (req, res) => {
  try {
    const poId = req.params.id;
    const po = await get('SELECT * FROM purchase_orders WHERE id = ?', [poId]);
    if (!po) return res.status(404).json({ message: 'ไม่พบเอกสารรับเข้าสินค้า' });

    const items = await all('SELECT * FROM po_items WHERE po_id = ?', [poId]);

    // Revert stock for each item
    for (const item of items) {
      const product = await get('SELECT * FROM products WHERE id = ?', [item.product_id]);
      if (product) {
        const newStock = Math.max(0, product.stock_qty - item.qty);
        await run('UPDATE products SET stock_qty = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newStock, item.product_id]);
        await run(
          `INSERT INTO stock_movements (product_id, type, qty, qty_before, qty_after, ref_type, ref_id, note, user_id)
           VALUES (?, 'OUT', ?, ?, ?, 'po_cancel', ?, ?, ?)`,
          [item.product_id, item.qty, product.stock_qty, newStock, poId, `ยกเลิก/ลบเอกสารรับเข้า PO: ${po.po_no}`, req.user.id]
        );
      }
    }

    await run('DELETE FROM po_items WHERE po_id = ?', [poId]);
    await run('DELETE FROM purchase_orders WHERE id = ?', [poId]);

    emitEvent('inventory:updated', { action: 'po_deleted', po_no: po.po_no });
    emitEvent('dashboard:refresh', { trigger: 'po_deleted' });

    res.json({ message: `ลบเอกสารรับเข้า ${po.po_no} สำเร็จ และปรับคืนสต็อกเรียบร้อยแล้ว` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/inventory/purchase-orders (ล้างประวัติเอกสารรับเข้าทั้งหมด พร้อมปรับคืนสต็อก)
router.delete('/purchase-orders', authenticate, async (req, res) => {
  try {
    const orders = await all('SELECT * FROM purchase_orders');
    for (const po of orders) {
      const items = await all('SELECT * FROM po_items WHERE po_id = ?', [po.id]);
      for (const item of items) {
        const product = await get('SELECT * FROM products WHERE id = ?', [item.product_id]);
        if (product) {
          const newStock = Math.max(0, product.stock_qty - item.qty);
          await run('UPDATE products SET stock_qty = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newStock, item.product_id]);
        }
      }
      await run('DELETE FROM po_items WHERE po_id = ?', [po.id]);
    }
    await run('DELETE FROM purchase_orders');

    emitEvent('inventory:updated', { action: 'po_all_deleted' });
    emitEvent('dashboard:refresh', { trigger: 'po_all_deleted' });

    res.json({ message: 'ล้างประวัติเอกสารรับเข้าทั้งหมดสำเร็จ และปรับคืนสต็อกเรียบร้อยแล้ว' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/inventory/requisitions (เบิกสินค้า)
router.post('/requisitions', authenticate, async (req, res) => {
  try {
    const { items, reason, note } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ message: 'ไม่มีรายการสินค้า' });

    const reqNo = `REQ${Date.now().toString().slice(-8)}`;
    const { lastID: reqId } = await run(
      'INSERT INTO stock_requisitions (req_no, user_id, status, reason, note) VALUES (?, ?, "pending", ?, ?)',
      [reqNo, req.user.id, reason || '', note || '']
    );

    for (const item of items) {
      await run(
        'INSERT INTO requisition_items (req_id, product_id, qty_requested) VALUES (?, ?, ?)',
        [reqId, item.product_id, item.qty]
      );
    }

    const req_ = await get('SELECT r.*, u.name as user_name FROM stock_requisitions r LEFT JOIN users u ON r.user_id = u.id WHERE r.id = ?', [reqId]);
    req_.items = await all('SELECT ri.*, p.name as product_name, p.barcode, p.unit, p.image_url, p.stock_qty FROM requisition_items ri JOIN products p ON ri.product_id = p.id WHERE ri.req_id = ?', [reqId]);

    emitEvent('requisition:updated', { action: 'created', req_id: reqId, req_no: reqNo, user: req.user?.name });
    emitEvent('dashboard:refresh', { trigger: 'requisition' });

    res.status(201).json(req_);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/inventory/direct-stock-out (เบิกจ่ายตัดสต็อกทันที)
router.post('/direct-stock-out', authenticate, async (req, res) => {
  try {
    const { items, reason, recipient, department, note } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ message: 'ไม่มีรายการสินค้า' });

    // Validate stocks
    for (const item of items) {
      const p = await get('SELECT * FROM products WHERE id = ?', [item.product_id]);
      if (!p) return res.status(404).json({ message: `ไม่พบสินค้ารหัส ${item.product_id}` });
      if (p.stock_qty < item.qty) {
        return res.status(400).json({
          message: `สินค้า "${p.name}" คงเหลือไม่เพียงพอ (มีในคลัง ${p.stock_qty} ${p.unit}, ต้องการเบิก ${item.qty} ${p.unit})`
        });
      }
    }

    const reqNo = `DIS${Date.now().toString().slice(-8)}`;
    const fullReason = [
      reason || 'เบิกจ่ายสินค้า',
      recipient ? `ผู้รับ: ${recipient}` : '',
      department ? `แผนก: ${department}` : ''
    ].filter(Boolean).join(' | ');

    const { lastID: reqId } = await run(
      'INSERT INTO stock_requisitions (req_no, user_id, status, reason, note, approved_by, approved_at) VALUES (?, ?, "approved", ?, ?, ?, CURRENT_TIMESTAMP)',
      [reqNo, req.user.id, fullReason, note || '', req.user.id]
    );

    for (const item of items) {
      const p = await get('SELECT * FROM products WHERE id = ?', [item.product_id]);
      const newStock = p.stock_qty - item.qty;

      await run(
        'INSERT INTO requisition_items (req_id, product_id, qty_requested, qty_approved) VALUES (?, ?, ?, ?)',
        [reqId, item.product_id, item.qty, item.qty]
      );

      await run('UPDATE products SET stock_qty = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newStock, item.product_id]);

      await run(
        `INSERT INTO stock_movements (product_id, type, qty, qty_before, qty_after, ref_type, ref_id, note, user_id)
         VALUES (?, 'OUT', ?, ?, ?, 'direct_disbursement', ?, ?, ?)`,
        [item.product_id, item.qty, p.stock_qty, newStock, reqId, `เบิกจ่ายทันที ${reqNo}: ${fullReason}`, req.user.id]
      );
    }

    const result = await get('SELECT r.*, u.name as user_name FROM stock_requisitions r LEFT JOIN users u ON r.user_id = u.id WHERE r.id = ?', [reqId]);
    result.items = await all('SELECT ri.*, p.name as product_name, p.barcode, p.unit, p.image_url FROM requisition_items ri JOIN products p ON ri.product_id = p.id WHERE ri.req_id = ?', [reqId]);

    emitEvent('inventory:updated', { action: 'direct_stock_out', req_no: reqNo, items_count: items.length });
    emitEvent('dashboard:refresh', { trigger: 'direct_stock_out' });

    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/inventory/requisitions
router.get('/requisitions', authenticate, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    let sql = `SELECT r.*, u.name as user_name FROM stock_requisitions r LEFT JOIN users u ON r.user_id = u.id WHERE 1=1`;
    const params = [];
    if (status) { sql += ' AND r.status = ?'; params.push(status); }
    sql += ' ORDER BY r.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
    const reqs = await all(sql, params);
    res.json(reqs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/inventory/requisitions/:id
router.get('/requisitions/:id', authenticate, async (req, res) => {
  try {
    const reqRecord = await get(
      `SELECT r.*, u.name as user_name, au.name as approver_name
       FROM stock_requisitions r
       LEFT JOIN users u ON r.user_id = u.id
       LEFT JOIN users au ON r.approved_by = au.id
       WHERE r.id = ?`,
      [req.params.id]
    );
    if (!reqRecord) return res.status(404).json({ message: 'ไม่พบรายการเบิกสินค้า' });
    reqRecord.items = await all(
      `SELECT ri.*, p.name as product_name, p.barcode, p.unit, p.image_url, p.sell_price
       FROM requisition_items ri
       JOIN products p ON ri.product_id = p.id
       WHERE ri.req_id = ?`,
      [req.params.id]
    );
    res.json(reqRecord);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/inventory/requisitions/:id/approve - approve requisition
router.put('/requisitions/:id/approve', authenticate, async (req, res) => {
  try {
    const { approved_items } = req.body; // [{ req_item_id, qty_approved }]
    const reqRecord = await get('SELECT * FROM stock_requisitions WHERE id = ?', [req.params.id]);
    if (!reqRecord) return res.status(404).json({ message: 'ไม่พบรายการ' });
    if (reqRecord.status !== 'pending') return res.status(400).json({ message: 'รายการนี้ถูกดำเนินการแล้ว' });

    for (const ai of approved_items) {
      await run('UPDATE requisition_items SET qty_approved = ? WHERE id = ?', [ai.qty_approved, ai.req_item_id]);
      const ri = await get('SELECT ri.*, p.stock_qty FROM requisition_items ri JOIN products p ON ri.product_id = p.id WHERE ri.id = ?', [ai.req_item_id]);
      if (ai.qty_approved > 0 && ri) {
        const newStock = ri.stock_qty - ai.qty_approved;
        await run('UPDATE products SET stock_qty = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newStock, ri.product_id]);
        await run(
          `INSERT INTO stock_movements (product_id, type, qty, qty_before, qty_after, ref_type, ref_id, note, user_id)
           VALUES (?, 'OUT', ?, ?, ?, 'requisition', ?, ?, ?)`,
          [ri.product_id, ai.qty_approved, ri.stock_qty, newStock, req.params.id, `เบิกสินค้า REQ: ${reqRecord.req_no}`, req.user.id]
        );
      }
    }

    await run(
      'UPDATE stock_requisitions SET status="approved", approved_by=?, approved_at=CURRENT_TIMESTAMP WHERE id=?',
      [req.user.id, req.params.id]
    );

    const updated = await get('SELECT r.*, u.name as user_name FROM stock_requisitions r LEFT JOIN users u ON r.user_id = u.id WHERE r.id = ?', [req.params.id]);
    updated.items = await all('SELECT ri.*, p.name as product_name FROM requisition_items ri JOIN products p ON ri.product_id = p.id WHERE ri.req_id = ?', [req.params.id]);

    emitEvent('requisition:updated', { action: 'approved', req_id: req.params.id });
    emitEvent('inventory:updated', { action: 'requisition_approved', req_id: req.params.id });
    emitEvent('dashboard:refresh', { trigger: 'requisition_approved' });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/inventory/requisitions/:id/reject
router.put('/requisitions/:id/reject', authenticate, async (req, res) => {
  try {
    await run('UPDATE stock_requisitions SET status="rejected", approved_by=?, approved_at=CURRENT_TIMESTAMP WHERE id=?',
      [req.user.id, req.params.id]);

    emitEvent('requisition:updated', { action: 'rejected', req_id: req.params.id });
    emitEvent('dashboard:refresh', { trigger: 'requisition_rejected' });

    res.json({ message: 'ปฏิเสธรายการเบิกสำเร็จ' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/inventory/adjust - manual stock adjustment
router.post('/adjust', authenticate, async (req, res) => {
  try {
    const { product_id, new_qty, note } = req.body;
    const product = await get('SELECT * FROM products WHERE id = ?', [product_id]);
    if (!product) return res.status(404).json({ message: 'ไม่พบสินค้า' });

    const diff = new_qty - product.stock_qty;
    const type = diff >= 0 ? 'ADJUST_IN' : 'ADJUST_OUT';
    await run('UPDATE products SET stock_qty = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [new_qty, product_id]);
    await run(
      `INSERT INTO stock_movements (product_id, type, qty, qty_before, qty_after, ref_type, note, user_id)
       VALUES (?, ?, ?, ?, ?, 'adjust', ?, ?)`,
      [product_id, type, Math.abs(diff), product.stock_qty, new_qty, note || 'ปรับสต็อก', req.user.id]
    );

    emitEvent('inventory:updated', {
      action: 'adjust',
      product_id,
      old_qty: product.stock_qty,
      new_qty,
    });
    emitEvent('dashboard:refresh', { trigger: 'adjust' });

    res.json({ message: 'ปรับสต็อกสำเร็จ', old_qty: product.stock_qty, new_qty });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
