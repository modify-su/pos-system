const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(__dirname, '../../pos.db');
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let db;

function getDb() {
  if (!db) {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Error opening database:', err.message);
        process.exit(1);
      }
      console.log('📦 Connected to SQLite database at:', DB_PATH);
    });
    db.run('PRAGMA journal_mode = WAL');
    db.run('PRAGMA foreign_keys = ON');
  }
  return db;
}

// Promise wrapper for db.run
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

// Promise wrapper for db.get
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// Promise wrapper for db.all
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function initializeDatabase() {
  const db = getDb();

  await run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'cashier',
    permissions TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  try {
    await run('ALTER TABLE users ADD COLUMN permissions TEXT');
  } catch {
    // Column already exists
  }

  await run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    contact_name TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    tax_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    barcode TEXT UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    category_id INTEGER,
    supplier_id INTEGER,
    unit TEXT DEFAULT 'ชิ้น',
    cost_price REAL DEFAULT 0,
    sell_price REAL DEFAULT 0,
    stock_qty INTEGER DEFAULT 0,
    min_stock INTEGER DEFAULT 5,
    image_url TEXT,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_no TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    subtotal REAL DEFAULT 0,
    discount_amount REAL DEFAULT 0,
    tax_amount REAL DEFAULT 0,
    total REAL DEFAULT 0,
    payment_method TEXT DEFAULT 'cash',
    payment_amount REAL DEFAULT 0,
    change_amount REAL DEFAULT 0,
    status TEXT DEFAULT 'completed',
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    barcode TEXT,
    qty INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    cost_price REAL DEFAULT 0,
    discount REAL DEFAULT 0,
    subtotal REAL NOT NULL,
    FOREIGN KEY (sale_id) REFERENCES sales(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    qty INTEGER NOT NULL,
    qty_before INTEGER DEFAULT 0,
    qty_after INTEGER DEFAULT 0,
    ref_type TEXT,
    ref_id INTEGER,
    note TEXT,
    user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS purchase_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_no TEXT UNIQUE NOT NULL,
    supplier_id INTEGER,
    user_id INTEGER NOT NULL,
    status TEXT DEFAULT 'completed',
    total_amount REAL DEFAULT 0,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS po_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    qty INTEGER NOT NULL,
    cost_price REAL DEFAULT 0,
    subtotal REAL DEFAULT 0,
    FOREIGN KEY (po_id) REFERENCES purchase_orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS stock_requisitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    req_no TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    approved_by INTEGER,
    status TEXT DEFAULT 'pending',
    reason TEXT,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    approved_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (approved_by) REFERENCES users(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS requisition_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    req_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    qty_requested INTEGER NOT NULL,
    qty_approved INTEGER DEFAULT 0,
    note TEXT,
    FOREIGN KEY (req_id) REFERENCES stock_requisitions(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  )`);

  // Seed default settings if empty
  const defaultRoles = {
    admin: ['dashboard', 'pos', 'inventory', 'stock-in', 'stock-out', 'products', 'categories', 'reports', 'settings'],
    cashier: ['dashboard', 'pos', 'stock-out'],
    storekeeper: ['dashboard', 'inventory', 'stock-in', 'stock-out'],
  };

  const roleSetting = await get('SELECT * FROM settings WHERE key = "role_permissions"');
  if (!roleSetting) {
    await run('INSERT INTO settings (key, value) VALUES (?, ?)', [
      'role_permissions',
      JSON.stringify(defaultRoles),
    ]);
  }

  const storeSetting = await get('SELECT * FROM settings WHERE key = "store_info"');
  if (!storeSetting) {
    await run('INSERT INTO settings (key, value) VALUES (?, ?)', [
      'store_info',
      JSON.stringify({
        name: 'ระบบจัดการคลังและจุดขาย (Smart POS & Warehouse)',
        tax_id: '0105558000000',
        phone: '02-123-4567',
        address: '123 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110',
        receipt_footer: 'ขอบคุณที่ใช้บริการ / Thank you',
      }),
    ]);
  }

  // Seed default users if empty
  const userCount = await get('SELECT COUNT(*) as c FROM users');
  if (userCount && userCount.c === 0) {
    const bcrypt = require('bcryptjs');
    const adminHash = await bcrypt.hash('admin1234', 10);
    await run('INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)',
      ['admin', adminHash, 'ผู้ดูแลระบบ', 'admin']);
    const cashHash = await bcrypt.hash('cashier1234', 10);
    await run('INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)',
      ['cashier', cashHash, 'พนักงานแคชเชียร์', 'cashier']);
    const storeHash = await bcrypt.hash('store1234', 10);
    await run('INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)',
      ['storekeeper', storeHash, 'พนักงานคลัง', 'storekeeper']);
    console.log('👤 Default system accounts initialized');
  }

  console.log('✅ Database tables initialized');
}

module.exports = { getDb, run, get, all, initializeDatabase };
