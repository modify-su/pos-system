const express = require('express');
const { get, all } = require('../db/database');
const { authenticate } = require('../middleware/auth');
const memoryCache = require('../utils/cache');

const router = express.Router();

// GET /api/reports/dashboard
router.get('/dashboard', authenticate, async (req, res) => {
  try {
    const cacheKey = 'dashboard_summary';
    const cachedData = memoryCache.get(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    const today = new Date().toISOString().slice(0, 10);
    const thisMonth = today.slice(0, 7);
    const lastMonth = new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().slice(0, 7);

    const [metrics, dailySales, topProducts, paymentMethods, categoryRevenue, recentMovements, pendingRequisitionsList] = await Promise.all([
      // 1. All scalar metrics in 1 single consolidated query
      get(`
        SELECT
          (SELECT COALESCE(SUM(total), 0) FROM sales WHERE status = 'completed' AND date(created_at) = ?) as today_revenue,
          (SELECT COUNT(*) FROM sales WHERE status = 'completed' AND date(created_at) = ?) as today_count,
          (SELECT COALESCE(SUM(total), 0) FROM sales WHERE status = 'completed' AND strftime('%Y-%m', created_at) = ?) as month_revenue,
          (SELECT COUNT(*) FROM sales WHERE status = 'completed' AND strftime('%Y-%m', created_at) = ?) as month_count,
          (SELECT COALESCE(SUM(total), 0) FROM sales WHERE status = 'completed' AND strftime('%Y-%m', created_at) = ?) as last_month_revenue,

          (SELECT COALESCE(SUM(si.qty * (si.unit_price - si.cost_price)), 0) 
           FROM sale_items si JOIN sales s ON si.sale_id = s.id 
           WHERE s.status = 'completed' AND date(s.created_at) = ?) as profit_today,
          (SELECT COALESCE(SUM(si.qty * (si.unit_price - si.cost_price)), 0) 
           FROM sale_items si JOIN sales s ON si.sale_id = s.id 
           WHERE s.status = 'completed' AND strftime('%Y-%m', s.created_at) = ?) as profit_month,

          (SELECT COUNT(*) FROM products WHERE active = 1) as total_products,
          (SELECT COUNT(*) FROM products WHERE active = 1 AND stock_qty <= min_stock) as low_stock,
          (SELECT COUNT(*) FROM stock_requisitions WHERE status = 'pending') as pending_reqs,

          (SELECT COUNT(*) FROM purchase_orders WHERE status = 'completed' AND strftime('%Y-%m', created_at) = ?) as stock_in_month_count,
          (SELECT COALESCE(SUM(total_amount), 0) FROM purchase_orders WHERE status = 'completed' AND strftime('%Y-%m', created_at) = ?) as stock_in_month_total,
          (SELECT COUNT(*) FROM purchase_orders WHERE status = 'completed' AND date(created_at) = ?) as stock_in_today_count,
          (SELECT COALESCE(SUM(total_amount), 0) FROM purchase_orders WHERE status = 'completed' AND date(created_at) = ?) as stock_in_today_total,

          (SELECT COUNT(DISTINCT r.id) FROM stock_requisitions r WHERE r.status = 'approved' AND strftime('%Y-%m', r.created_at) = ?) as stock_out_month_count,
          (SELECT COALESCE(SUM(ri.qty_approved), 0) FROM stock_requisitions r JOIN requisition_items ri ON r.id = ri.req_id WHERE r.status = 'approved' AND strftime('%Y-%m', r.created_at) = ?) as stock_out_month_qty,
          (SELECT COUNT(DISTINCT r.id) FROM stock_requisitions r WHERE r.status = 'approved' AND date(r.created_at) = ?) as stock_out_today_count,
          (SELECT COALESCE(SUM(ri.qty_approved), 0) FROM stock_requisitions r JOIN requisition_items ri ON r.id = ri.req_id WHERE r.status = 'approved' AND date(r.created_at) = ?) as stock_out_today_qty
      `, [
        today, today, thisMonth, thisMonth, lastMonth,
        today, thisMonth,
        thisMonth, thisMonth, today, today,
        thisMonth, thisMonth, today, today
      ]),

      // 2. Daily sales last 14 days
      all(`
        SELECT s.sale_date as date, 
               SUM(s.total) as revenue,
               SUM(s.total - COALESCE(cost.total_cost, 0)) as profit,
               COUNT(*) as count
        FROM (
          SELECT id, total, date(created_at) as sale_date
          FROM sales
          WHERE date(created_at) >= date('now', '-13 days') AND status = 'completed'
        ) s
        LEFT JOIN (
          SELECT sale_id, SUM(qty * cost_price) as total_cost
          FROM sale_items
          GROUP BY sale_id
        ) cost ON s.id = cost.sale_id
        GROUP BY s.sale_date ORDER BY s.sale_date
      `),

      // 3. Top 10 products this month
      all(`
        SELECT si.product_name, si.product_id, SUM(si.qty) as total_qty, SUM(si.subtotal) as total_revenue
        FROM sale_items si JOIN sales s ON si.sale_id = s.id
        WHERE strftime('%Y-%m', s.created_at) = ? AND s.status = 'completed'
        GROUP BY si.product_id, si.product_name ORDER BY total_qty DESC LIMIT 10
      `, [thisMonth]),

      // 4. Sales by payment method
      all(`
        SELECT payment_method, COUNT(*) as count, SUM(total) as total
        FROM sales WHERE strftime('%Y-%m', created_at) = ? AND status = 'completed'
        GROUP BY payment_method
      `, [thisMonth]),

      // 5. Category revenue
      all(`
        SELECT c.name as category, SUM(si.subtotal) as revenue
        FROM sale_items si 
        JOIN products p ON si.product_id = p.id 
        JOIN categories c ON p.category_id = c.id
        JOIN sales s ON si.sale_id = s.id
        WHERE strftime('%Y-%m', s.created_at) = ? AND s.status = 'completed'
        GROUP BY c.id, c.name ORDER BY revenue DESC
      `, [thisMonth]),

      // 6. Recent stock movements
      all(`
        SELECT m.id, m.type, m.qty, m.qty_before, m.qty_after, m.ref_type, m.ref_id, m.note, m.created_at, p.name as product_name, p.barcode, p.unit, u.name as user_name
        FROM stock_movements m
        LEFT JOIN products p ON m.product_id = p.id
        LEFT JOIN users u ON m.user_id = u.id
        ORDER BY m.created_at DESC, m.id DESC LIMIT 8
      `),

      // 7. Pending requisitions
      all(`
        SELECT r.id, r.req_no, r.reason, r.note, r.created_at, u.name as requester_name,
               (SELECT COUNT(*) FROM requisition_items ri WHERE ri.req_id = r.id) as item_count,
               (SELECT COALESCE(SUM(qty_requested), 0) FROM requisition_items ri WHERE ri.req_id = r.id) as total_requested_qty
        FROM stock_requisitions r
        LEFT JOIN users u ON r.user_id = u.id
        WHERE r.status = 'pending'
        ORDER BY r.created_at DESC LIMIT 5
      `)
    ]);

    const m = metrics || {};
    const todayRevenue = m.today_revenue || 0;
    const todayCount = m.today_count || 0;
    const profitToday = m.profit_today || 0;

    const monthRevenue = m.month_revenue || 0;
    const monthCount = m.month_count || 0;
    const profitMonth = m.profit_month || 0;
    const lastMonthRevenue = m.last_month_revenue || 0;

    const growth = lastMonthRevenue > 0
      ? (((monthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100).toFixed(1)
      : 0;

    const responseData = {
      today: { revenue: todayRevenue, count: todayCount, profit: profitToday },
      thisMonth: {
        revenue: monthRevenue,
        count: monthCount,
        profit: profitMonth,
        growth,
      },
      inventory: {
        totalProducts: m.total_products || 0,
        lowStock: m.low_stock || 0,
        pendingReqs: m.pending_reqs || 0,
      },
      warehouse: {
        stockInMonth: { count: m.stock_in_month_count || 0, total: m.stock_in_month_total || 0 },
        stockOutMonth: { count: m.stock_out_month_count || 0, totalQty: m.stock_out_month_qty || 0 },
        stockInToday: { count: m.stock_in_today_count || 0, total: m.stock_in_today_total || 0 },
        stockOutToday: { count: m.stock_out_today_count || 0, totalQty: m.stock_out_today_qty || 0 },
        recentMovements,
        pendingRequisitions: pendingRequisitionsList,
      },
      dailySales,
      topProducts,
      paymentMethods,
      categoryRevenue,
    };

    memoryCache.set(cacheKey, responseData, 30000); // 30s micro-cache
    res.json(responseData);
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
