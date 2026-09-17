const express = require('express');
const { get, all } = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/reports/dashboard
router.get('/dashboard', authenticate, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const thisMonth = today.slice(0, 7);
    const lastMonth = new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().slice(0, 7);

    const [todaySales, monthSales, lastMonthSales, totalProducts, lowStock, pendingReqs] = await Promise.all([
      get(`SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count FROM sales WHERE date(created_at) = ? AND status='completed'`, [today]),
      get(`SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count FROM sales WHERE strftime('%Y-%m', created_at) = ? AND status='completed'`, [thisMonth]),
      get(`SELECT COALESCE(SUM(total), 0) as total FROM sales WHERE strftime('%Y-%m', created_at) = ? AND status='completed'`, [lastMonth]),
      get('SELECT COUNT(*) as count FROM products WHERE active=1'),
      get('SELECT COUNT(*) as count FROM products WHERE active=1 AND stock_qty <= min_stock'),
      get(`SELECT COUNT(*) as count FROM stock_requisitions WHERE status='pending'`),
    ]);

    // Profit (gross)
    const profitToday = await get(
      `SELECT COALESCE(SUM(si.qty * (si.unit_price - si.cost_price)), 0) as profit
       FROM sale_items si JOIN sales s ON si.sale_id = s.id
       WHERE date(s.created_at) = ? AND s.status='completed'`,
      [today]
    );
    const profitMonth = await get(
      `SELECT COALESCE(SUM(si.qty * (si.unit_price - si.cost_price)), 0) as profit
       FROM sale_items si JOIN sales s ON si.sale_id = s.id
       WHERE strftime('%Y-%m', s.created_at) = ? AND s.status='completed'`,
      [thisMonth]
    );

    // Daily sales last 14 days
    const dailySales = await all(
      `SELECT s.sale_date as date, 
              SUM(s.total) as revenue,
              SUM(s.total - COALESCE(cost.total_cost, 0)) as profit,
              COUNT(*) as count
       FROM (
         SELECT id, total, date(created_at) as sale_date
         FROM sales
         WHERE date(created_at) >= date('now', '-13 days') AND status='completed'
       ) s
       LEFT JOIN (
         SELECT sale_id, SUM(qty * cost_price) as total_cost
         FROM sale_items
         GROUP BY sale_id
       ) cost ON s.id = cost.sale_id
       GROUP BY s.sale_date ORDER BY s.sale_date`
    );

    // Top 10 products this month
    const topProducts = await all(
      `SELECT si.product_name, si.product_id, SUM(si.qty) as total_qty, SUM(si.subtotal) as total_revenue
       FROM sale_items si JOIN sales s ON si.sale_id = s.id
       WHERE strftime('%Y-%m', s.created_at) = ? AND s.status='completed'
       GROUP BY si.product_id, si.product_name ORDER BY total_qty DESC LIMIT 10`,
      [thisMonth]
    );

    // Sales by payment method
    const paymentMethods = await all(
      `SELECT payment_method, COUNT(*) as count, SUM(total) as total
       FROM sales WHERE strftime('%Y-%m', created_at) = ? AND status='completed'
       GROUP BY payment_method`,
      [thisMonth]
    );

    // Category revenue
    const categoryRevenue = await all(
      `SELECT c.name as category, SUM(si.subtotal) as revenue
       FROM sale_items si 
       JOIN products p ON si.product_id = p.id 
       JOIN categories c ON p.category_id = c.id
       JOIN sales s ON si.sale_id = s.id
       WHERE strftime('%Y-%m', s.created_at) = ? AND s.status='completed'
       GROUP BY c.id, c.name ORDER BY revenue DESC`,
      [thisMonth]
    );

    // Warehouse Stock-In & Stock-Out Analytics
    const [
      stockInMonth,
      stockOutMonth,
      stockInToday,
      stockOutToday,
      recentMovements,
      pendingRequisitionsList
    ] = await Promise.all([
      get(`SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total FROM purchase_orders WHERE strftime('%Y-%m', created_at) = ? AND status='completed'`, [thisMonth]),
      get(`SELECT COUNT(DISTINCT r.id) as count, COALESCE(SUM(ri.qty_approved), 0) as total_qty FROM stock_requisitions r JOIN requisition_items ri ON r.id = ri.req_id WHERE strftime('%Y-%m', r.created_at) = ? AND r.status='approved'`, [thisMonth]),
      get(`SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total FROM purchase_orders WHERE date(created_at) = ? AND status='completed'`, [today]),
      get(`SELECT COUNT(DISTINCT r.id) as count, COALESCE(SUM(ri.qty_approved), 0) as total_qty FROM stock_requisitions r JOIN requisition_items ri ON r.id = ri.req_id WHERE date(r.created_at) = ? AND r.status='approved'`, [today]),
      all(`SELECT m.id, m.type, m.qty, m.qty_before, m.qty_after, m.ref_type, m.ref_id, m.note, m.created_at, p.name as product_name, p.barcode, p.unit, u.name as user_name
           FROM stock_movements m
           LEFT JOIN products p ON m.product_id = p.id
           LEFT JOIN users u ON m.user_id = u.id
           ORDER BY m.created_at DESC, m.id DESC LIMIT 8`),
      all(`SELECT r.id, r.req_no, r.reason, r.note, r.created_at, u.name as requester_name,
                  (SELECT COUNT(*) FROM requisition_items ri WHERE ri.req_id = r.id) as item_count,
                  (SELECT COALESCE(SUM(qty_requested), 0) FROM requisition_items ri WHERE ri.req_id = r.id) as total_requested_qty
           FROM stock_requisitions r
           LEFT JOIN users u ON r.user_id = u.id
           WHERE r.status = 'pending'
           ORDER BY r.created_at DESC LIMIT 5`)
    ]);

    res.json({
      today: { revenue: todaySales.total, count: todaySales.count, profit: profitToday.profit },
      thisMonth: {
        revenue: monthSales.total, count: monthSales.count, profit: profitMonth.profit,
        growth: lastMonthSales.total > 0 ? ((monthSales.total - lastMonthSales.total) / lastMonthSales.total * 100).toFixed(1) : 0
      },
      inventory: { totalProducts: totalProducts.count, lowStock: lowStock.count, pendingReqs: pendingReqs.count },
      warehouse: {
        stockInMonth: { count: stockInMonth.count, total: stockInMonth.total },
        stockOutMonth: { count: stockOutMonth.count, totalQty: stockOutMonth.total_qty },
        stockInToday: { count: stockInToday.count, total: stockInToday.total },
        stockOutToday: { count: stockOutToday.count, totalQty: stockOutToday.total_qty },
        recentMovements,
        pendingRequisitions: pendingRequisitionsList,
      },
      dailySales,
      topProducts,
      paymentMethods,
      categoryRevenue,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/reports/sales
router.get('/sales', authenticate, async (req, res) => {
  try {
    const { from, to, group_by = 'day' } = req.query;
    const fromDate = from || new Date(new Date().setDate(1)).toISOString().slice(0, 10);
    const toDate = to || new Date().toISOString().slice(0, 10);

    let groupExpr;
    if (group_by === 'month') groupExpr = `strftime('%Y-%m', created_at)`;
    else if (group_by === 'week') groupExpr = `strftime('%Y-W%W', created_at)`;
    else groupExpr = `date(created_at)`;

    const summary = await all(
      `SELECT ${groupExpr} as period, COUNT(*) as count, SUM(total) as revenue, SUM(discount_amount) as discounts
       FROM sales WHERE date(created_at) BETWEEN ? AND ? AND status='completed'
       GROUP BY period ORDER BY period`,
      [fromDate, toDate]
    );

    const details = await all(
      `SELECT s.id, s.sale_no, s.created_at, s.total, s.payment_method, s.discount_amount, u.name as cashier,
              (SELECT COUNT(*) FROM sale_items WHERE sale_id = s.id) as items_count
       FROM sales s LEFT JOIN users u ON s.user_id = u.id
       WHERE date(s.created_at) BETWEEN ? AND ? AND s.status='completed'
       ORDER BY s.created_at DESC`,
      [fromDate, toDate]
    );

    res.json({ summary, details, period: { from: fromDate, to: toDate } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/reports/inventory
router.get('/inventory', authenticate, async (req, res) => {
  try {
    const products = await all(
      `SELECT p.*, c.name as category_name, s.name as supplier_name,
              (p.stock_qty * p.cost_price) as stock_value
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN suppliers s ON p.supplier_id = s.id
       WHERE p.active = 1 ORDER BY p.name`
    );
    const totalValue = products.reduce((s, p) => s + (p.stock_value || 0), 0);
    const lowStock = products.filter(p => p.stock_qty <= p.min_stock);
    res.json({ products, totalValue, lowStockCount: lowStock.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
