/**
 * Migration Script: Transfer all data from SQLite (pos.db) to PostgreSQL
 * 
 * Usage:
 *   node src/db/migrate-to-postgres.js
 * Or:
 *   DATABASE_URL="postgresql://user:pass@host:5432/dbname" node src/db/migrate-to-postgres.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const databaseUrl = process.argv[2] || process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!databaseUrl) {
  console.error('\n❌ ไม่พบค่า DATABASE_URL สำหรับเชื่อมต่อ PostgreSQL!');
  console.log('\n📌 วิธีใช้งาน:');
  console.log('1. ระบุผ่านตัวแปรใน .env:');
  console.log('   DATABASE_URL=postgresql://user:password@host:port/database\n');
  console.log('2. หรือส่งเป็น argument ในคำสั่ง:');
  console.log('   node src/db/migrate-to-postgres.js "postgresql://user:password@host:port/database"\n');
  process.exit(1);
}

const DB_PATH = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(__dirname, '../../pos.db');

if (!fs.existsSync(DB_PATH)) {
  console.error(`❌ ไม่พบไฟล์ฐานข้อมูล SQLite ที่: ${DB_PATH}`);
  process.exit(1);
}

// Connect SQLite
const sqliteDb = new sqlite3.Database(DB_PATH);
function sqliteAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    sqliteDb.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

// Connect PostgreSQL
const isLocal = databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1');
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === 'false' || isLocal ? false : { rejectUnauthorized: false },
});

async function runMigration() {
  const client = await pool.connect();

  console.log('\n🚀 เริ่มต้นการโอนย้ายข้อมูลจาก SQLite ➔ PostgreSQL...');
  console.log(`📁 แหล่งข้อมูล SQLite: ${DB_PATH}`);
  console.log(`🐘 ปลายทาง PostgreSQL: ${databaseUrl.replace(/:[^:@]+@/, ':****@')}\n`);

  try {
    // 1. Ensure schema exists
    console.log('🛠️  กำลังตรวจสอบโครงสร้างตารางใน PostgreSQL...');
    await client.query(`
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
    `);
    console.log('✅ โครงสร้างตารางใน PostgreSQL พร้อมใช้งาน\n');

    const summary = [];

    // Helper: Migrate a table with id primary key
    async function migrateTable(tableName, columns, conflictKey = 'id') {
      const rows = await sqliteAll(`SELECT * FROM ${tableName}`);
      if (rows.length === 0) {
        summary.push({ table: tableName, count: 0, status: 'ไม่มีข้อมูลใน SQLite' });
        return;
      }

      let inserted = 0;
      for (const row of rows) {
        const cols = columns.filter((c) => row[c] !== undefined);
        const colNames = cols.join(', ');
        const placeholders = cols.map((_, idx) => `$${idx + 1}`).join(', ');
        const values = cols.map((c) => row[c]);

        let onConflict = `ON CONFLICT (${conflictKey}) DO NOTHING`;
        if (tableName === 'settings') {
          onConflict = `ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`;
        }

        const sql = `INSERT INTO ${tableName} (${colNames}) VALUES (${placeholders}) ${onConflict}`;
        await client.query(sql, values);
        inserted++;
      }

      // Reset auto-increment sequence for serial tables
      if (conflictKey === 'id') {
        try {
          await client.query(`
            SELECT setval(
              pg_get_serial_sequence('${tableName}', 'id'),
              COALESCE((SELECT MAX(id) FROM ${tableName}), 1)
            )
          `);
        } catch (seqErr) {
          // Ignore if table doesn't have a sequence
        }
      }

      summary.push({ table: tableName, count: inserted, status: 'สำเร็จ' });
      console.log(`  ✓ โอนย้ายตาราง ${tableName}: ${inserted} รายการ`);
    }

    // 2. Migrate in dependency order
    console.log('📦 กำลังถ่ายโอนข้อมูลแต่ละตาราง:');
    await migrateTable('settings', ['key', 'value', 'updated_at'], 'key');
    await migrateTable('categories', ['id', 'name', 'description', 'created_at']);
    await migrateTable('suppliers', ['id', 'name', 'contact_name', 'phone', 'email', 'address', 'tax_id', 'created_at']);
    await migrateTable('users', ['id', 'username', 'password', 'name', 'role', 'permissions', 'active', 'created_at']);
    await migrateTable('products', ['id', 'barcode', 'name', 'description', 'category_id', 'supplier_id', 'unit', 'cost_price', 'sell_price', 'stock_qty', 'min_stock', 'image_url', 'active', 'created_at', 'updated_at']);
    await migrateTable('sales', ['id', 'sale_no', 'user_id', 'subtotal', 'discount_amount', 'tax_amount', 'total', 'payment_method', 'payment_amount', 'change_amount', 'status', 'note', 'created_at']);
    await migrateTable('sale_items', ['id', 'sale_id', 'product_id', 'product_name', 'barcode', 'qty', 'unit_price', 'cost_price', 'discount', 'subtotal']);
    await migrateTable('stock_movements', ['id', 'product_id', 'type', 'qty', 'qty_before', 'qty_after', 'ref_type', 'ref_id', 'note', 'user_id', 'created_at']);
    await migrateTable('purchase_orders', ['id', 'po_no', 'supplier_id', 'user_id', 'status', 'total_amount', 'note', 'created_at']);
    await migrateTable('po_items', ['id', 'po_id', 'product_id', 'qty', 'cost_price', 'subtotal']);
    await migrateTable('stock_requisitions', ['id', 'req_no', 'user_id', 'approved_by', 'status', 'reason', 'note', 'created_at', 'approved_at']);
    await migrateTable('requisition_items', ['id', 'req_id', 'product_id', 'qty_requested', 'qty_approved', 'note']);

    console.log('\n=============================================');
    console.log('🎉 ย้ายข้อมูลขึ้น PostgreSQL เสร็จสมบูรณ์แล้ว!');
    console.log('=============================================');
    console.table(summary);

  } catch (err) {
    console.error('\n❌ เกิดข้อผิดพลาดระหว่างการย้ายข้อมูล:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    sqliteDb.close();
  }
}

runMigration();
