const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

let isPostgres = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);

let pool = null;
let db = null;

function initPostgresPool() {
  if (!pool && isPostgres) {
    const { Pool, types } = require('pg');

    // Parse NUMERIC / DECIMAL (type ID 1700) to float instead of string
    types.setTypeParser(1700, (val) => (val === null ? null : parseFloat(val)));
    // Parse BIGINT (type ID 20) to integer
    types.setTypeParser(20, (val) => (val === null ? null : parseInt(val, 10)));

    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

    pool = new Pool({
      connectionString,
      ssl: process.env.DATABASE_SSL === 'false' || isLocal
        ? false
        : { rejectUnauthorized: false },
      max: parseInt(process.env.DB_POOL_MAX || '15', 10),
      idleTimeoutMillis: 120000,
      connectionTimeoutMillis: 10000,
      keepAlive: true,
    });

    pool.on('error', (err) => {
      console.error('⚠️ Unexpected error on idle PostgreSQL client:', err.message);
    });

    console.log('🐘 PostgreSQL configured. Host target:', connectionString.split('@')[1] || 'configured connection');
  }
}

if (isPostgres) {
  initPostgresPool();
}

const defaultDbPath = path.join(__dirname, '../../pos.db');
let DB_PATH = defaultDbPath;
if (process.env.DB_PATH) {
  DB_PATH = path.isAbsolute(process.env.DB_PATH)
    ? process.env.DB_PATH
    : path.resolve(path.join(__dirname, '../..'), process.env.DB_PATH);
}
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

function getDb() {
  if (isPostgres) {
    return pool;
  }
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

/**
 * Translates SQLite syntax to PostgreSQL syntax:
 * - Replaces '?' placeholders with $1, $2, $3...
 * - Translates date/time functions: strftime('%Y-%m', ...) -> to_char(..., 'YYYY-MM')
 * - Translates SQLite date('now', '-X days') -> (CURRENT_DATE - INTERVAL 'X days')
 */
function translateSql(sql) {
  let paramIndex = 1;
  let translated = sql.replace(/\?/g, () => `$${paramIndex++}`);

  // Date and formatting translations
  translated = translated.replace(/strftime\s*\(\s*['"]%Y-%m['"]\s*,\s*([^)]+)\s*\)/gi, "to_char($1, 'YYYY-MM')");
  translated = translated.replace(/strftime\s*\(\s*['"]%Y-W%W['"]\s*,\s*([^)]+)\s*\)/gi, "to_char($1, 'YYYY-\"W\"IW')");
  translated = translated.replace(/date\s*\(\s*['"]now['"]\s*,\s*['"]-(\d+)\s*days['"]\s*\)/gi, "(CURRENT_DATE - INTERVAL '$1 days')");
  translated = translated.replace(/date\s*\(\s*['"]now['"]\s*\)/gi, 'CURRENT_DATE');

  return translated;
}

/**
 * Promise wrapper for SQL execution that modifies data (INSERT, UPDATE, DELETE)
 * Returns { lastID, changes }
 */
async function run(sql, params = []) {
  if (isPostgres) {
    let query = translateSql(sql);
    const isInsert = /^\s*INSERT\s+INTO/i.test(query);
    const hasReturning = /RETURNING/i.test(query);
    const isSettings = /^\s*INSERT\s+INTO\s+settings/i.test(query);

    if (isInsert && !hasReturning && !isSettings) {
      query += ' RETURNING id';
    }

    const res = await pool.query(query, params);
    const lastID = res.rows && res.rows[0] && res.rows[0].id !== undefined ? res.rows[0].id : null;
    return { lastID, changes: res.rowCount };
  }

  return new Promise((resolve, reject) => {
    getDb().run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

/**
 * Promise wrapper for db.get (returns single object or undefined)
 */
async function get(sql, params = []) {
  if (isPostgres) {
    const query = translateSql(sql);
    const res = await pool.query(query, params);
    return res.rows[0] || undefined;
  }

  return new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

/**
 * Promise wrapper for db.all (returns array of rows)
 */
async function all(sql, params = []) {
  if (isPostgres) {
    const query = translateSql(sql);
    const res = await pool.query(query, params);
    return res.rows || [];
  }

  return new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

/**
 * Initialize PostgreSQL Schema & Default Seeds
 */
async function initializePostgresSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'cashier',
      permissions TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key VARCHAR(100) PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      contact_name VARCHAR(255),
      phone VARCHAR(50),
      email VARCHAR(100),
      address TEXT,
      tax_id VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      barcode VARCHAR(100) UNIQUE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
      unit VARCHAR(50) DEFAULT 'ชิ้น',
      cost_price NUMERIC(12, 2) DEFAULT 0,
      sell_price NUMERIC(12, 2) DEFAULT 0,
      stock_qty INTEGER DEFAULT 0,
      min_stock INTEGER DEFAULT 5,
      image_url TEXT,
      active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sales (
      id SERIAL PRIMARY KEY,
      sale_no VARCHAR(100) UNIQUE NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      subtotal NUMERIC(12, 2) DEFAULT 0,
      discount_amount NUMERIC(12, 2) DEFAULT 0,
      tax_amount NUMERIC(12, 2) DEFAULT 0,
      total NUMERIC(12, 2) DEFAULT 0,
      payment_method VARCHAR(50) DEFAULT 'cash',
      payment_amount NUMERIC(12, 2) DEFAULT 0,
      change_amount NUMERIC(12, 2) DEFAULT 0,
      status VARCHAR(50) DEFAULT 'completed',
      note TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id SERIAL PRIMARY KEY,
      sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      product_name VARCHAR(255) NOT NULL,
      barcode VARCHAR(100),
      qty INTEGER NOT NULL,
      unit_price NUMERIC(12, 2) NOT NULL,
      cost_price NUMERIC(12, 2) DEFAULT 0,
      discount NUMERIC(12, 2) DEFAULT 0,
      subtotal NUMERIC(12, 2) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL,
      qty INTEGER NOT NULL,
      qty_before INTEGER DEFAULT 0,
      qty_after INTEGER DEFAULT 0,
      ref_type VARCHAR(50),
      ref_id INTEGER,
      note TEXT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS purchase_orders (
      id SERIAL PRIMARY KEY,
      po_no VARCHAR(100) UNIQUE NOT NULL,
      supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      status VARCHAR(50) DEFAULT 'completed',
      total_amount NUMERIC(12, 2) DEFAULT 0,
      note TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS po_items (
      id SERIAL PRIMARY KEY,
      po_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      qty INTEGER NOT NULL,
      cost_price NUMERIC(12, 2) DEFAULT 0,
      subtotal NUMERIC(12, 2) DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS stock_requisitions (
      id SERIAL PRIMARY KEY,
      req_no VARCHAR(100) UNIQUE NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status VARCHAR(50) DEFAULT 'pending',
      reason TEXT,
      note TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      approved_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS requisition_items (
      id SERIAL PRIMARY KEY,
      req_id INTEGER NOT NULL REFERENCES stock_requisitions(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      qty_requested INTEGER NOT NULL,
      qty_approved INTEGER DEFAULT 0,
      note TEXT
    );

    -- Performance Indexes for Fast Analytics and Lookups
    CREATE INDEX IF NOT EXISTS idx_sales_created_status ON sales(created_at, status);
    CREATE INDEX IF NOT EXISTS idx_sales_user_id ON sales(user_id);
    CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
    CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON sale_items(product_id);
    CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id, active);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements(created_at);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
    CREATE INDEX IF NOT EXISTS idx_po_created_status ON purchase_orders(created_at, status);
    CREATE INDEX IF NOT EXISTS idx_po_items_po_id ON po_items(po_id);
    CREATE INDEX IF NOT EXISTS idx_requisitions_status_created ON stock_requisitions(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_requisition_items_req ON requisition_items(req_id);

    CREATE TABLE IF NOT EXISTS uploaded_files (
      filename VARCHAR(255) PRIMARY KEY,
      mime_type VARCHAR(100) NOT NULL,
      data BYTEA NOT NULL,
      size INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_uploaded_files_filename ON uploaded_files(filename);
  `);

  // Seed default settings if empty
  const defaultRoles = {
    admin: ['dashboard', 'pos', 'inventory', 'stock-in', 'stock-out', 'products', 'categories', 'reports', 'settings'],
    cashier: ['dashboard', 'pos', 'stock-out'],
    storekeeper: ['dashboard', 'inventory', 'stock-in', 'stock-out'],
  };

  const roleSetting = await get("SELECT * FROM settings WHERE key = 'role_permissions'");
  if (!roleSetting) {
    await run("INSERT INTO settings (key, value) VALUES ('role_permissions', $1)", [
      JSON.stringify(defaultRoles),
    ]);
  }

  const storeSetting = await get("SELECT * FROM settings WHERE key = 'store_info'");
  if (!storeSetting) {
    await run("INSERT INTO settings (key, value) VALUES ('store_info', $1)", [
      JSON.stringify({
        name: 'ระบบจัดการคลังและจุดขาย (Smart POS & Warehouse)',
        tax_id: '0105558000000',
        phone: '02-123-4567',
        address: '123 ถนนสุขุมวิท แขแรงคลองเตย เขตคลองเตย กรุงเทพฯ 10110',
        receipt_footer: 'ขอบคุณที่ใช้บริการ / Thank you',
      }),
    ]);
  }

  // Seed default users if empty
  const userCount = await get('SELECT COUNT(*) as c FROM users');
  if (userCount && parseInt(userCount.c, 10) === 0) {
    const bcrypt = require('bcryptjs');
    const adminHash = await bcrypt.hash('admin1234', 10);
    await run('INSERT INTO users (username, password, name, role) VALUES ($1, $2, $3, $4)',
      ['admin', adminHash, 'ผู้ดูแลระบบ', 'admin']);
    const cashHash = await bcrypt.hash('cashier1234', 10);
    await run('INSERT INTO users (username, password, name, role) VALUES ($1, $2, $3, $4)',
      ['cashier', cashHash, 'พนักงานแคชเชียร์', 'cashier']);
    const storeHash = await bcrypt.hash('store1234', 10);
    await run('INSERT INTO users (username, password, name, role) VALUES ($1, $2, $3, $4)',
      ['storekeeper', storeHash, 'พนักงานคลัง', 'storekeeper']);
    console.log('👤 Default PostgreSQL accounts initialized');
  }

  console.log('🐘 PostgreSQL database schema initialized successfully');
}

/**
 * Initialize SQLite Schema & Default Seeds
 */
async function initializeSqliteSchema() {
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

  // Performance Indexes for SQLite
  await run(`CREATE INDEX IF NOT EXISTS idx_sales_created_status ON sales(created_at, status)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_sales_user_id ON sales(user_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON sale_items(product_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_products_active ON products(active)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_products_cat_active ON products(category_id, active)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements(created_at)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_po_created_status ON purchase_orders(created_at, status)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_requisitions_status ON stock_requisitions(status)`);

  await run(`CREATE TABLE IF NOT EXISTS uploaded_files (
    filename TEXT PRIMARY KEY,
    mime_type TEXT NOT NULL,
    data BLOB NOT NULL,
    size INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Seed default settings if empty
  const defaultRoles = {
    admin: ['dashboard', 'pos', 'inventory', 'stock-in', 'stock-out', 'products', 'categories', 'reports', 'settings'],
    cashier: ['dashboard', 'pos', 'stock-out'],
    storekeeper: ['dashboard', 'inventory', 'stock-in', 'stock-out'],
  };

  const roleSetting = await get("SELECT * FROM settings WHERE key = 'role_permissions'");
  if (!roleSetting) {
    await run('INSERT INTO settings (key, value) VALUES (?, ?)', [
      'role_permissions',
      JSON.stringify(defaultRoles),
    ]);
  }

  const storeSetting = await get("SELECT * FROM settings WHERE key = 'store_info'");
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
    console.log('👤 Default SQLite accounts initialized');
  }

  console.log('✅ SQLite database tables initialized');
}

async function initializeDatabase() {
  if (isPostgres) {
    try {
      initPostgresPool();
      await initializePostgresSchema();
      // Pre-warm connections so first client requests don't suffer TLS/handshake lag
      await pool.query('SELECT 1');
    } catch (err) {
      console.warn(`⚠️ ไม่สามารถเชื่อมต่อ Cloud PostgreSQL ได้ (${err.message})`);
      console.warn('🔄 กำลังสลับใช้งาน SQLite ในเครื่อง (โหมดออฟไลน์) แทน เพื่อให้ระบบขายหน้าร้านทำงานได้ตลอดเวลา');
      isPostgres = false;
      if (pool) {
        try { await pool.end(); } catch (_) {}
        pool = null;
      }
      await initializeSqliteSchema();
    }
  } else {
    await initializeSqliteSchema();
  }
}

/**
 * Save an uploaded file into database (PostgreSQL BYTEA or SQLite BLOB)
 */
async function saveUploadedFile(filename, mimeType, filePathOrBuffer) {
  try {
    const buffer = Buffer.isBuffer(filePathOrBuffer)
      ? filePathOrBuffer
      : fs.readFileSync(filePathOrBuffer);
    const size = buffer.length;
    const safeMime = mimeType || 'image/jpeg';

    if (isPostgres && pool) {
      await pool.query(
        `INSERT INTO uploaded_files (filename, mime_type, data, size)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (filename) DO UPDATE SET
           mime_type = EXCLUDED.mime_type,
           data = EXCLUDED.data,
           size = EXCLUDED.size`,
        [filename, safeMime, buffer, size]
      );
    } else {
      await run(
        `INSERT OR REPLACE INTO uploaded_files (filename, mime_type, data, size)
         VALUES (?, ?, ?, ?)`,
        [filename, safeMime, buffer, size]
      );
    }
    return true;
  } catch (err) {
    console.error(`Failed to save uploaded file "${filename}" to database:`, err.message);
    return false;
  }
}

/**
 * Get an uploaded file from database by filename
 */
async function getUploadedFile(filename) {
  try {
    if (isPostgres && pool) {
      const res = await pool.query(
        'SELECT filename, mime_type, data, size FROM uploaded_files WHERE filename = $1',
        [filename]
      );
      return res.rows[0] || null;
    } else {
      return new Promise((resolve, reject) => {
        getDb().get(
          'SELECT filename, mime_type, data, size FROM uploaded_files WHERE filename = ?',
          [filename],
          (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
          }
        );
      });
    }
  } catch (err) {
    console.error(`Error querying uploaded file "${filename}":`, err.message);
    return null;
  }
}

/**
 * Automatically sync any local upload files to the database
 */
async function syncLocalUploadsToDb(uploadsDir) {
  if (!uploadsDir || !fs.existsSync(uploadsDir)) return;
  try {
    const files = fs.readdirSync(uploadsDir).filter((f) => !f.startsWith('.'));
    for (const filename of files) {
      const filePath = path.join(uploadsDir, filename);
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) continue;

      let exists = false;
      if (isPostgres && pool) {
        const res = await pool.query('SELECT 1 FROM uploaded_files WHERE filename = $1', [filename]);
        exists = (res.rowCount || 0) > 0;
      } else {
        const row = await get('SELECT 1 FROM uploaded_files WHERE filename = ?', [filename]);
        exists = Boolean(row);
      }

      if (!exists) {
        const ext = path.extname(filename).toLowerCase();
        const mimeType = ext === '.png' ? 'image/png'
          : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
          : ext === '.webp' ? 'image/webp'
          : ext === '.gif' ? 'image/gif'
          : ext === '.svg' ? 'image/svg+xml'
          : 'application/octet-stream';

        const buffer = fs.readFileSync(filePath);
        await saveUploadedFile(filename, mimeType, buffer);
        console.log(`📦 Auto-synced "${filename}" to database`);
      }
    }
  } catch (err) {
    console.warn('Auto-sync uploads to DB warning:', err.message);
  }
}

module.exports = {
  get isPostgres() { return isPostgres; },
  get pool() { return pool; },
  getDb,
  run,
  get,
  all,
  translateSql,
  initializeDatabase,
  saveUploadedFile,
  getUploadedFile,
  syncLocalUploadsToDb,
};
