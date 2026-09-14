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

// GET /api/sales
router.get('/', authenticate, async (req, res) => {
  try {
    const { from, to, page = 1, limit = 20 } = req.query;
    let sql = `SELECT s.*, u.name as cashier_name FROM sales s LEFT JOIN users u ON s.user_id = u.id WHERE 1=1`;
    const params = [];
    if (from) { sql += ' AND date(s.created_at) >= ?'; params.push(from); }
    if (to)   { sql += ' AND date(s.created_at) <= ?'; params.push(to); }
    sql += ' ORDER BY s.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
    const sales = await all(sql, params);
    res.json(sales);
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

module.exports = router;
