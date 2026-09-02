const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

let db;
let currentDbPath = null;

function initDatabase(userDataPath) {
  const dbDir = path.join(userDataPath, 'data');
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  const dbPath = path.join(dbDir, 'clinic.db');
  currentDbPath = dbPath;

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'موظف',
      phone TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      phone TEXT,
      gender TEXT,
      birth_date TEXT,
      age INTEGER,
      address TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS exams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      employee_id INTEGER,
      exam_date TEXT DEFAULT (datetime('now')),
      od_sph TEXT, od_cyl TEXT, od_axis TEXT, od_pd TEXT, od_add TEXT,
      os_sph TEXT, os_cyl TEXT, os_axis TEXT, os_pd TEXT, os_add TEXT,
      od_va_before TEXT, os_va_before TEXT, od_va_after TEXT, os_va_after TEXT,
      diagnosis TEXT,
      medical_notes TEXT,
      recommendations TEXT,
      next_visit_date TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(patient_id) REFERENCES patients(id),
      FOREIGN KEY(employee_id) REFERENCES employees(id)
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      parent_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT,
      barcode TEXT,
      price REAL DEFAULT 0,
      cost REAL DEFAULT 0,
      stock_qty INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT UNIQUE,
      patient_id INTEGER,
      employee_id INTEGER,
      invoice_date TEXT DEFAULT (datetime('now')),
      subtotal REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      total REAL DEFAULT 0,
      paid_amount REAL DEFAULT 0,
      payment_method TEXT DEFAULT 'نقدي',
      status TEXT DEFAULT 'مدفوعة',
      currency TEXT DEFAULT 'IQD',
      exchange_rate REAL DEFAULT 1,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(patient_id) REFERENCES patients(id),
      FOREIGN KEY(employee_id) REFERENCES employees(id)
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      product_id INTEGER,
      description TEXT,
      qty REAL DEFAULT 1,
      unit_price REAL DEFAULT 0,
      total REAL DEFAULT 0,
      FOREIGN KEY(invoice_id) REFERENCES invoices(id),
      FOREIGN KEY(product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS supplier_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      employee_id INTEGER,
      purchase_id INTEGER,
      transaction_date TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(supplier_id) REFERENCES suppliers(id)
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_number TEXT UNIQUE,
      supplier_id INTEGER NOT NULL,
      employee_id INTEGER,
      purchase_date TEXT DEFAULT (datetime('now')),
      subtotal REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      total REAL DEFAULT 0,
      paid_amount REAL DEFAULT 0,
      status TEXT DEFAULT 'غير مدفوعة',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(supplier_id) REFERENCES suppliers(id),
      FOREIGN KEY(employee_id) REFERENCES employees(id)
    );

    CREATE TABLE IF NOT EXISTS purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER NOT NULL,
      product_id INTEGER,
      description TEXT,
      qty REAL DEFAULT 1,
      unit_cost REAL DEFAULT 0,
      total REAL DEFAULT 0,
      FOREIGN KEY(purchase_id) REFERENCES purchases(id),
      FOREIGN KEY(product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS special_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE,
      patient_id INTEGER,
      customer_name TEXT NOT NULL,
      customer_phone TEXT,
      item_description TEXT NOT NULL,
      supplier_id INTEGER,
      expected_price REAL DEFAULT 0,
      deposit_amount REAL DEFAULT 0,
      status TEXT DEFAULT 'قيد الانتظار',
      employee_id INTEGER,
      order_date TEXT DEFAULT (datetime('now')),
      notes TEXT,
      invoice_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(patient_id) REFERENCES patients(id),
      FOREIGN KEY(supplier_id) REFERENCES suppliers(id),
      FOREIGN KEY(employee_id) REFERENCES employees(id),
      FOREIGN KEY(invoice_id) REFERENCES invoices(id)
    );

    CREATE TABLE IF NOT EXISTS cash_boxes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      opening_balance REAL DEFAULT 0,
      opening_date TEXT DEFAULT (datetime('now')),
      closing_balance REAL,
      closing_date TEXT,
      status TEXT DEFAULT 'مفتوح',
      notes TEXT,
      FOREIGN KEY(employee_id) REFERENCES employees(id)
    );

    CREATE TABLE IF NOT EXISTS cash_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cash_box_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      reason TEXT,
      movement_date TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(cash_box_id) REFERENCES cash_boxes(id)
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT,
      employee_id INTEGER,
      cash_box_id INTEGER,
      expense_date TEXT DEFAULT (datetime('now')),
      notes TEXT,
      FOREIGN KEY(employee_id) REFERENCES employees(id)
    );

    CREATE TABLE IF NOT EXISTS stock_takes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER,
      take_date TEXT DEFAULT (datetime('now')),
      status TEXT DEFAULT 'قيد الجرد',
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS stock_take_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_take_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      system_qty INTEGER,
      counted_qty INTEGER,
      FOREIGN KEY(stock_take_id) REFERENCES stock_takes(id),
      FOREIGN KEY(product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS invoice_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      employee_id INTEGER,
      payment_date TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(invoice_id) REFERENCES invoices(id),
      FOREIGN KEY(employee_id) REFERENCES employees(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // ترحيل تلقائي: إضافة أعمدة جديدة لقواعد بيانات قديمة تم إنشاؤها قبل هذا التحديث
  const examColumns = db.prepare("PRAGMA table_info(exams)").all().map(c => c.name);
  const newExamColumns = ['od_va_before', 'os_va_before', 'od_va_after', 'os_va_after'];
  newExamColumns.forEach(col => {
    if (!examColumns.includes(col)) {
      db.exec(`ALTER TABLE exams ADD COLUMN ${col} TEXT`);
    }
  });

  // ترحيل تلقائي: إضافة عمود ربط معاملات المورد بفاتورة الشراء لقواعد البيانات القديمة
  const supTransColumns = db.prepare("PRAGMA table_info(supplier_transactions)").all().map(c => c.name);
  if (!supTransColumns.includes('purchase_id')) {
    db.exec('ALTER TABLE supplier_transactions ADD COLUMN purchase_id INTEGER');
  }

  // ترحيل تلقائي: إضافة عمود الفئة الأب (لدعم الفروع) لقواعد البيانات القديمة
  const catColumns = db.prepare("PRAGMA table_info(categories)").all().map(c => c.name);
  if (!catColumns.includes('parent_id')) {
    db.exec('ALTER TABLE categories ADD COLUMN parent_id INTEGER');
  }

  // ترحيل تلقائي: إضافة عمود العمر لجدول المرضى (استبدال تاريخ الميلاد بحقل العمر المباشر)
  const patientColumns = db.prepare("PRAGMA table_info(patients)").all().map(c => c.name);
  if (!patientColumns.includes('age')) {
    db.exec('ALTER TABLE patients ADD COLUMN age INTEGER');
  }

  // ترحيل تلقائي: إضافة عمود صلاحيات الموظف (قائمة أسماء التبويبات المسموحة، بصيغة JSON)
  const employeeColumns = db.prepare("PRAGMA table_info(employees)").all().map(c => c.name);
  if (!employeeColumns.includes('permissions')) {
    db.exec('ALTER TABLE employees ADD COLUMN permissions TEXT');
  }

  const adminExists = db.prepare('SELECT COUNT(*) c FROM employees').get();
  if (adminExists.c === 0) {
    db.prepare(`INSERT INTO employees (full_name, username, password, role, permissions) VALUES (?, ?, ?, ?, ?)`)
      .run('المدير العام', 'admin', 'admin123', 'مدير', null);
  }

  const catCount = db.prepare('SELECT COUNT(*) c FROM categories').get();
  if (catCount.c === 0) {
    const insertCat = db.prepare('INSERT INTO categories (name) VALUES (?)');
    ['نظارات طبية', 'عدسات لاصقة', 'إطارات', 'إكسسوارات'].forEach(name => insertCat.run(name));
  }

  return db;
}

function getDb() {
  if (!db) throw new Error('Database not initialized yet');
  return db;
}

function getDbPath() {
  return currentDbPath;
}

// يُستخدم فقط قبل استبدال ملف قاعدة البيانات مباشرة (الاستعادة من نسخة احتياطية).
// يغلق الاتصال الحالي بأمان (يدمج ملفات WAL) قبل إعادة تشغيل التطبيق.
function closeDatabase() {
  if (db) {
    try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch (e) { /* تجاهل */ }
    db.close();
    db = null;
  }
}

module.exports = { initDatabase, getDb, getDbPath, closeDatabase };
