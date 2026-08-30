const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { getDb } = require('../db/database');

function startServer(port, onReady) {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'renderer')));

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });
  const broadcast = (event) => io.emit('data-changed', { event });

  // ---------- الموظفين ----------
  app.get('/api/employees', (req, res) => {
    res.json(getDb().prepare('SELECT id, full_name, username, role, phone, active, created_at FROM employees ORDER BY id DESC').all());
  });
  app.post('/api/employees', (req, res) => {
    const { full_name, username, password, role, phone } = req.body;
    if (!full_name || !String(full_name).trim()) return res.status(400).json({ error: 'اسم الموظف مطلوب' });
    if (!username || !String(username).trim()) return res.status(400).json({ error: 'اسم المستخدم مطلوب' });
    try {
      const info = getDb().prepare('INSERT INTO employees (full_name, username, password, role, phone) VALUES (?,?,?,?,?)')
        .run(full_name.trim(), username.trim(), password || '123456', role || 'موظف', phone || '');
      broadcast('employees'); res.json({ id: info.lastInsertRowid });
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) return res.status(400).json({ error: 'اسم المستخدم هذا مستخدم بالفعل، اختر اسمًا آخر' });
      res.status(500).json({ error: 'حدث خطأ أثناء إضافة الموظف: ' + err.message });
    }
  });
  app.put('/api/employees/:id', (req, res) => {
    const { full_name, role, phone, active } = req.body;
    if (!full_name || !String(full_name).trim()) return res.status(400).json({ error: 'اسم الموظف مطلوب' });
    getDb().prepare('UPDATE employees SET full_name=?, role=?, phone=?, active=? WHERE id=?')
      .run(full_name.trim(), role, phone, active ? 1 : 0, req.params.id);
    broadcast('employees'); res.json({ ok: true });
  });
  app.delete('/api/employees/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const target = getDb().prepare('SELECT * FROM employees WHERE id=?').get(id);
    if (!target) return res.status(404).json({ error: 'الموظف غير موجود' });
    if (target.role === 'مدير') {
      const adminCount = getDb().prepare("SELECT COUNT(*) c FROM employees WHERE role='مدير'").get().c;
      if (adminCount <= 1) return res.status(400).json({ error: 'لا يمكن حذف آخر مدير في النظام' });
    }
    const hasInvoices = getDb().prepare('SELECT COUNT(*) c FROM invoices WHERE employee_id=?').get(id).c;
    const hasExams = getDb().prepare('SELECT COUNT(*) c FROM exams WHERE employee_id=?').get(id).c;
    if (hasInvoices > 0 || hasExams > 0) {
      getDb().prepare('UPDATE employees SET active=0 WHERE id=?').run(id);
      broadcast('employees');
      return res.json({ ok: true, deactivatedInstead: true });
    }
    getDb().prepare('DELETE FROM employees WHERE id=?').run(id);
    broadcast('employees'); res.json({ ok: true });
  });
  app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const emp = getDb().prepare('SELECT * FROM employees WHERE username=? AND password=? AND active=1').get(username, password);
    if (!emp) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    delete emp.password;
    res.json(emp);
  });

  // ---------- المرضى ----------
  app.get('/api/patients', (req, res) => {
    const { search } = req.query;
    let rows;
    if (search) {
      rows = getDb().prepare('SELECT * FROM patients WHERE full_name LIKE ? OR phone LIKE ? ORDER BY id DESC')
        .all(`%${search}%`, `%${search}%`);
    } else {
      rows = getDb().prepare('SELECT * FROM patients ORDER BY id DESC').all();
    }
    res.json(rows);
  });
  app.get('/api/patients/:id', (req, res) => {
    const patient = getDb().prepare('SELECT * FROM patients WHERE id=?').get(req.params.id);
    if (!patient) return res.status(404).json({ error: 'المريض غير موجود' });
    res.json(patient);
  });
  app.post('/api/patients', (req, res) => {
    const { full_name, phone, gender, age, address, notes } = req.body;
    if (!full_name || !String(full_name).trim()) return res.status(400).json({ error: 'اسم المريض مطلوب' });
    const info = getDb().prepare('INSERT INTO patients (full_name, phone, gender, age, address, notes) VALUES (?,?,?,?,?,?)')
      .run(full_name.trim(), phone, gender, age || null, address, notes);
    broadcast('patients'); res.json({ id: info.lastInsertRowid });
  });
  app.put('/api/patients/:id', (req, res) => {
    const { full_name, phone, gender, age, address, notes } = req.body;
    if (!full_name || !String(full_name).trim()) return res.status(400).json({ error: 'اسم المريض مطلوب' });
    const existing = getDb().prepare('SELECT id FROM patients WHERE id=?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'المريض غير موجود' });
    getDb().prepare('UPDATE patients SET full_name=?, phone=?, gender=?, age=?, address=?, notes=? WHERE id=?')
      .run(full_name.trim(), phone, gender, age || null, address, notes, req.params.id);
    broadcast('patients'); res.json({ ok: true });
  });
  app.delete('/api/patients/:id', (req, res) => {
    getDb().prepare('DELETE FROM patients WHERE id=?').run(req.params.id);
    broadcast('patients'); res.json({ ok: true });
  });

  // ---------- فحوصات النظر ----------
  app.get('/api/exams', (req, res) => {
    const { patient_id, employee_id, from, to } = req.query;
    let q = `SELECT e.*, p.full_name as patient_name, emp.full_name as employee_name
             FROM exams e LEFT JOIN patients p ON p.id=e.patient_id
             LEFT JOIN employees emp ON emp.id=e.employee_id WHERE 1=1`;
    const params = [];
    if (patient_id) { q += ' AND e.patient_id=?'; params.push(patient_id); }
    if (employee_id) { q += ' AND e.employee_id=?'; params.push(employee_id); }
    if (from) { q += ' AND date(e.exam_date) >= date(?)'; params.push(from); }
    if (to) { q += ' AND date(e.exam_date) <= date(?)'; params.push(to); }
    q += ' ORDER BY e.id DESC';
    res.json(getDb().prepare(q).all(...params));
  });
  app.post('/api/exams', (req, res) => {
    const b = req.body;
    const info = getDb().prepare(`INSERT INTO exams
      (patient_id, employee_id, od_sph, od_cyl, od_axis, od_pd, od_add,
       os_sph, os_cyl, os_axis, os_pd, os_add,
       od_va_before, os_va_before, od_va_after, os_va_after,
       diagnosis, medical_notes, recommendations, next_visit_date)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(b.patient_id, b.employee_id, b.od_sph, b.od_cyl, b.od_axis, b.od_pd, b.od_add,
           b.os_sph, b.os_cyl, b.os_axis, b.os_pd, b.os_add,
           b.od_va_before, b.os_va_before, b.od_va_after, b.os_va_after,
           b.diagnosis, b.medical_notes, b.recommendations, b.next_visit_date);
    broadcast('exams'); res.json({ id: info.lastInsertRowid });
  });
  app.delete('/api/exams/:id', (req, res) => {
    getDb().prepare('DELETE FROM exams WHERE id=?').run(req.params.id);
    broadcast('exams'); res.json({ ok: true });
  });

  // ---------- الفئات ----------
  app.get('/api/categories', (req, res) => {
    res.json(getDb().prepare('SELECT * FROM categories ORDER BY name').all());
  });
  app.post('/api/categories', (req, res) => {
    const { name, parent_id } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'اسم الفئة مطلوب' });
    const parentId = parent_id ? Number(parent_id) : null;
    try {
      const info = getDb().prepare('INSERT INTO categories (name, parent_id) VALUES (?, ?)').run(name.trim(), parentId);
      broadcast('categories');
      res.json({ id: info.lastInsertRowid, name: name.trim(), parent_id: parentId });
    } catch (err) {
      const existing = getDb().prepare('SELECT * FROM categories WHERE name=?').get(name.trim());
      if (existing) return res.json(existing);
      res.status(500).json({ error: err.message });
    }
  });
  app.delete('/api/categories/:id', (req, res) => {
    const db = getDb();
    // حذف الفروع التابعة لهذه الفئة أولًا (مستوى واحد فقط من الفروع)
    db.prepare('DELETE FROM categories WHERE parent_id=?').run(req.params.id);
    db.prepare('DELETE FROM categories WHERE id=?').run(req.params.id);
    broadcast('categories'); res.json({ ok: true });
  });

  // ---------- المنتجات ----------
  app.get('/api/products', (req, res) => {
    res.json(getDb().prepare('SELECT * FROM products ORDER BY id DESC').all());
  });
  app.post('/api/products', (req, res) => {
    const { name, category, barcode, price, cost, stock_qty } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'اسم المنتج مطلوب' });
    if (Number(price) < 0 || Number(cost) < 0 || Number(stock_qty) < 0) return res.status(400).json({ error: 'لا يمكن أن يكون السعر أو التكلفة أو الكمية بقيمة سالبة' });
    const info = getDb().prepare('INSERT INTO products (name, category, barcode, price, cost, stock_qty) VALUES (?,?,?,?,?,?)')
      .run(name.trim(), category, barcode, price || 0, cost || 0, stock_qty || 0);
    broadcast('products'); res.json({ id: info.lastInsertRowid });
  });
  app.put('/api/products/:id', (req, res) => {
    const { name, category, barcode, price, cost, stock_qty, active } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'اسم المنتج مطلوب' });
    if (Number(price) < 0 || Number(cost) < 0 || Number(stock_qty) < 0) return res.status(400).json({ error: 'لا يمكن أن يكون السعر أو التكلفة أو الكمية بقيمة سالبة' });
    const activeVal = active === undefined ? 1 : (active ? 1 : 0);
    getDb().prepare('UPDATE products SET name=?, category=?, barcode=?, price=?, cost=?, stock_qty=?, active=? WHERE id=?')
      .run(name.trim(), category, barcode, price, cost, stock_qty, activeVal, req.params.id);
    broadcast('products'); res.json({ ok: true });
  });
  app.delete('/api/products/:id', (req, res) => {
    const id = req.params.id;
    try {
      const target = getDb().prepare('SELECT * FROM products WHERE id=?').get(id);
      if (!target) return res.status(404).json({ error: 'المنتج غير موجود' });
      const hasInvoiceItems = getDb().prepare('SELECT COUNT(*) c FROM invoice_items WHERE product_id=?').get(id).c;
      const hasPurchaseItems = getDb().prepare('SELECT COUNT(*) c FROM purchase_items WHERE product_id=?').get(id).c;
      const hasStockTakeItems = getDb().prepare('SELECT COUNT(*) c FROM stock_take_items WHERE product_id=?').get(id).c;
      if (hasInvoiceItems > 0 || hasPurchaseItems > 0 || hasStockTakeItems > 0) {
        getDb().prepare('UPDATE products SET active=0 WHERE id=?').run(id);
        broadcast('products');
        return res.json({ ok: true, deactivatedInstead: true });
      }
      getDb().prepare('DELETE FROM products WHERE id=?').run(id);
      broadcast('products'); res.json({ ok: true });
    } catch (err) {
      console.error('خطأ حذف منتج:', err);
      res.status(500).json({ error: 'تعذر حذف المنتج: ' + err.message });
    }
  });

  // ---------- الفواتير / المبيعات ----------
  app.get('/api/invoices', (req, res) => {
    const { employee_id, from, to, patient_id } = req.query;
    let q = `SELECT i.*, p.full_name as patient_name, emp.full_name as employee_name
             FROM invoices i LEFT JOIN patients p ON p.id=i.patient_id
             LEFT JOIN employees emp ON emp.id=i.employee_id WHERE 1=1`;
    const params = [];
    if (employee_id) { q += ' AND i.employee_id=?'; params.push(employee_id); }
    if (patient_id) { q += ' AND i.patient_id=?'; params.push(patient_id); }
    if (from) { q += ' AND date(i.invoice_date) >= date(?)'; params.push(from); }
    if (to) { q += ' AND date(i.invoice_date) <= date(?)'; params.push(to); }
    q += ' ORDER BY i.id DESC';
    res.json(getDb().prepare(q).all(...params));
  });
  app.get('/api/invoices/:id', (req, res) => {
    const invoice = getDb().prepare(`SELECT i.*, p.full_name as patient_name, p.phone as patient_phone, emp.full_name as employee_name
      FROM invoices i LEFT JOIN patients p ON p.id=i.patient_id LEFT JOIN employees emp ON emp.id=i.employee_id
      WHERE i.id=?`).get(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'not found' });
    invoice.items = getDb().prepare('SELECT * FROM invoice_items WHERE invoice_id=?').all(req.params.id);
    res.json(invoice);
  });
  app.post('/api/invoices', (req, res) => {
    try {
      const b = req.body;
      if (!Array.isArray(b.items) || b.items.length === 0) {
        return res.status(400).json({ error: 'يجب إضافة عنصر واحد على الأقل للفاتورة قبل الحفظ' });
      }
      for (const it of b.items) {
        if (!it.description || !String(it.description).trim()) return res.status(400).json({ error: 'يوجد عنصر بدون اسم/وصف في الفاتورة' });
        if (!(Number(it.qty) > 0)) return res.status(400).json({ error: `الكمية غير صحيحة للعنصر: ${it.description}` });
        if (Number(it.unit_price) < 0 || isNaN(Number(it.unit_price))) return res.status(400).json({ error: `السعر غير صحيح للعنصر: ${it.description}` });
      }
      const subtotal = b.items.reduce((s, it) => s + (it.qty * it.unit_price), 0);
      const total = Math.max(0, subtotal - (b.discount || 0));
      const invoiceNumber = 'INV-' + Date.now();
      const insertInvoice = getDb().prepare(`INSERT INTO invoices
        (invoice_number, patient_id, employee_id, subtotal, discount, total, paid_amount, payment_method, status, currency, exchange_rate, notes)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
      const status = (b.paid_amount || 0) >= total ? 'مدفوعة' : ((b.paid_amount || 0) > 0 ? 'مدفوعة جزئياً' : 'غير مدفوعة');
      const info = insertInvoice.run(invoiceNumber, b.patient_id || null, b.employee_id || null, subtotal, b.discount || 0, total, b.paid_amount || 0, b.payment_method || 'نقدي', status, b.currency || 'IQD', b.exchange_rate || 1, b.notes || '');
      const invoiceId = info.lastInsertRowid;
      const insertItem = getDb().prepare('INSERT INTO invoice_items (invoice_id, product_id, description, qty, unit_price, total) VALUES (?,?,?,?,?,?)');
      const updateStock = getDb().prepare('UPDATE products SET stock_qty = stock_qty - ? WHERE id=?');
      for (const it of b.items) {
        insertItem.run(invoiceId, it.product_id || null, it.description, it.qty, it.unit_price, it.qty * it.unit_price);
        if (it.product_id) updateStock.run(it.qty, it.product_id);
      }
      if ((b.paid_amount || 0) > 0) {
        getDb().prepare('INSERT INTO invoice_payments (invoice_id, amount, employee_id) VALUES (?,?,?)')
          .run(invoiceId, b.paid_amount, b.employee_id || null);
      }
      broadcast('invoices'); broadcast('products');
      res.json({ id: invoiceId, invoice_number: invoiceNumber, total });
    } catch (err) {
      res.status(500).json({ error: 'حدث خطأ أثناء حفظ الفاتورة: ' + err.message });
    }
  });
  app.delete('/api/invoices/:id', (req, res) => {
    getDb().prepare('DELETE FROM invoice_items WHERE invoice_id=?').run(req.params.id);
    getDb().prepare('DELETE FROM invoices WHERE id=?').run(req.params.id);
    broadcast('invoices'); res.json({ ok: true });
  });
  app.post('/api/invoices/:id/pay', (req, res) => {
    const invoice = getDb().prepare('SELECT * FROM invoices WHERE id=?').get(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'الفاتورة غير موجودة' });
    const amount = Number(req.body.amount);
    if (!(amount > 0)) return res.status(400).json({ error: 'مبلغ التسديد يجب أن يكون أكبر من صفر' });
    const remaining = invoice.total - invoice.paid_amount;
    if (amount > remaining) return res.status(400).json({ error: `المبلغ المدخل (${amount}) أكبر من المتبقي على الفاتورة (${remaining})` });
    const newPaid = invoice.paid_amount + amount;
    const newStatus = newPaid >= invoice.total ? 'مدفوعة' : 'مدفوعة جزئياً';
    getDb().prepare('UPDATE invoices SET paid_amount=?, status=? WHERE id=?').run(newPaid, newStatus, invoice.id);
    getDb().prepare('INSERT INTO invoice_payments (invoice_id, amount, employee_id) VALUES (?,?,?)')
      .run(invoice.id, amount, req.body.employee_id || null);
    broadcast('invoices');
    res.json({ ok: true, paid_amount: newPaid, status: newStatus, remaining: invoice.total - newPaid });
  });

  app.get('/api/invoices/:id/payments', (req, res) => {
    const rows = getDb().prepare(`
      SELECT ip.*, e.full_name as employee_name
      FROM invoice_payments ip LEFT JOIN employees e ON e.id = ip.employee_id
      WHERE ip.invoice_id = ? ORDER BY ip.id ASC
    `).all(req.params.id);
    res.json(rows);
  });

  // ---------- التقارير ----------
  app.get('/api/reports/summary', (req, res) => {
    const { from, to, employee_id } = req.query;
    let q = `SELECT COUNT(*) as invoice_count, COALESCE(SUM(total),0) as total_sales, COALESCE(SUM(paid_amount),0) as total_paid
             FROM invoices WHERE 1=1`;
    const params = [];
    if (from) { q += ' AND date(invoice_date) >= date(?)'; params.push(from); }
    if (to) { q += ' AND date(invoice_date) <= date(?)'; params.push(to); }
    if (employee_id) { q += ' AND employee_id=?'; params.push(employee_id); }
    res.json(getDb().prepare(q).get(...params));
  });

  // ---------- الإعدادات ----------
  app.get('/api/settings', (req, res) => {
    const rows = getDb().prepare('SELECT * FROM settings').all();
    const obj = {}; rows.forEach(r => obj[r.key] = r.value);
    res.json(obj);
  });
  app.post('/api/settings', (req, res) => {
    const upsert = getDb().prepare('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
    Object.entries(req.body).forEach(([k, v]) => upsert.run(k, String(v)));
    res.json({ ok: true });
  });

  // ---------- الموردين ----------
  app.get('/api/suppliers', (req, res) => {
    const rows = getDb().prepare('SELECT * FROM suppliers ORDER BY id DESC').all();
    const withBalance = rows.map(s => {
      const purchases = getDb().prepare("SELECT COALESCE(SUM(amount),0) t FROM supplier_transactions WHERE supplier_id=? AND type='purchase'").get(s.id).t;
      const payments = getDb().prepare("SELECT COALESCE(SUM(amount),0) t FROM supplier_transactions WHERE supplier_id=? AND type='payment'").get(s.id).t;
      return { ...s, balance: purchases - payments };
    });
    res.json(withBalance);
  });
  app.post('/api/suppliers', (req, res) => {
    const { name, phone, address, notes, opening_balance } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'اسم المورد مطلوب' });
    const info = getDb().prepare('INSERT INTO suppliers (name, phone, address, notes) VALUES (?,?,?,?)').run(name.trim(), phone, address, notes);
    const supplierId = info.lastInsertRowid;
    const opening = Number(opening_balance) || 0;
    if (opening > 0) {
      getDb().prepare("INSERT INTO supplier_transactions (supplier_id, type, amount, description) VALUES (?, 'purchase', ?, 'رصيد افتتاحي')").run(supplierId, opening);
    }
    broadcast('suppliers'); res.json({ id: supplierId });
  });
  app.put('/api/suppliers/:id', (req, res) => {
    const { name, phone, address, notes } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'اسم المورد مطلوب' });
    getDb().prepare('UPDATE suppliers SET name=?, phone=?, address=?, notes=? WHERE id=?').run(name.trim(), phone, address, notes, req.params.id);
    broadcast('suppliers'); res.json({ ok: true });
  });
  app.delete('/api/suppliers/:id', (req, res) => {
    getDb().prepare('DELETE FROM supplier_transactions WHERE supplier_id=?').run(req.params.id);
    getDb().prepare('DELETE FROM suppliers WHERE id=?').run(req.params.id);
    broadcast('suppliers'); res.json({ ok: true });
  });
  app.get('/api/suppliers/:id/transactions', (req, res) => {
    res.json(getDb().prepare('SELECT * FROM supplier_transactions WHERE supplier_id=? ORDER BY id DESC').all(req.params.id));
  });
  app.post('/api/suppliers/:id/transactions', (req, res) => {
    const { type, amount, description, employee_id } = req.body;
    if (!['purchase', 'payment'].includes(type)) return res.status(400).json({ error: 'نوع العملية غير صحيح' });
    if (!(Number(amount) > 0)) return res.status(400).json({ error: 'المبلغ يجب أن يكون أكبر من صفر' });
    getDb().prepare('INSERT INTO supplier_transactions (supplier_id, type, amount, description, employee_id) VALUES (?,?,?,?,?)')
      .run(req.params.id, type, amount, description || '', employee_id || null);
    broadcast('suppliers'); res.json({ ok: true });
  });

  // ---------- قوائم الشراء من الموردين (المشتريات) ----------
  app.get('/api/purchases', (req, res) => {
    const { supplier_id, from, to } = req.query;
    let q = `SELECT pu.*, s.name as supplier_name, emp.full_name as employee_name
             FROM purchases pu LEFT JOIN suppliers s ON s.id=pu.supplier_id
             LEFT JOIN employees emp ON emp.id=pu.employee_id WHERE 1=1`;
    const params = [];
    if (supplier_id) { q += ' AND pu.supplier_id=?'; params.push(supplier_id); }
    if (from) { q += ' AND date(pu.purchase_date) >= date(?)'; params.push(from); }
    if (to) { q += ' AND date(pu.purchase_date) <= date(?)'; params.push(to); }
    q += ' ORDER BY pu.id DESC';
    res.json(getDb().prepare(q).all(...params));
  });
  app.get('/api/purchases/:id', (req, res) => {
    const purchase = getDb().prepare(`SELECT pu.*, s.name as supplier_name, s.phone as supplier_phone, emp.full_name as employee_name
      FROM purchases pu LEFT JOIN suppliers s ON s.id=pu.supplier_id LEFT JOIN employees emp ON emp.id=pu.employee_id
      WHERE pu.id=?`).get(req.params.id);
    if (!purchase) return res.status(404).json({ error: 'فاتورة الشراء غير موجودة' });
    purchase.items = getDb().prepare('SELECT * FROM purchase_items WHERE purchase_id=?').all(req.params.id);
    res.json(purchase);
  });
  app.post('/api/purchases', (req, res) => {
    try {
      const b = req.body;
      if (!b.supplier_id) return res.status(400).json({ error: 'الرجاء اختيار المورد' });
      const supplier = getDb().prepare('SELECT * FROM suppliers WHERE id=?').get(b.supplier_id);
      if (!supplier) return res.status(400).json({ error: 'المورد المحدد غير موجود' });
      if (!Array.isArray(b.items) || b.items.length === 0) {
        return res.status(400).json({ error: 'يجب إضافة عنصر واحد على الأقل لفاتورة الشراء قبل الحفظ' });
      }
      for (const it of b.items) {
        if (!it.description || !String(it.description).trim()) return res.status(400).json({ error: 'يوجد عنصر بدون اسم/وصف في فاتورة الشراء' });
        if (!(Number(it.qty) > 0)) return res.status(400).json({ error: `الكمية غير صحيحة للعنصر: ${it.description}` });
        if (Number(it.unit_cost) < 0 || isNaN(Number(it.unit_cost))) return res.status(400).json({ error: `سعر التكلفة غير صحيح للعنصر: ${it.description}` });
      }
      const subtotal = b.items.reduce((s, it) => s + (it.qty * it.unit_cost), 0);
      const total = Math.max(0, subtotal - (b.discount || 0));
      const paidAmount = Math.min(Number(b.paid_amount) || 0, total);
      const purchaseNumber = 'PUR-' + Date.now();
      const status = paidAmount >= total ? 'مدفوعة' : (paidAmount > 0 ? 'مدفوعة جزئياً' : 'غير مدفوعة');

      const info = getDb().prepare(`INSERT INTO purchases
        (purchase_number, supplier_id, employee_id, subtotal, discount, total, paid_amount, status, notes)
        VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(purchaseNumber, b.supplier_id, b.employee_id || null, subtotal, b.discount || 0, total, paidAmount, status, b.notes || '');
      const purchaseId = info.lastInsertRowid;

      const insertItem = getDb().prepare('INSERT INTO purchase_items (purchase_id, product_id, description, qty, unit_cost, total) VALUES (?,?,?,?,?,?)');
      const updateStock = getDb().prepare('UPDATE products SET stock_qty = stock_qty + ?, cost = ? WHERE id=?');
      for (const it of b.items) {
        insertItem.run(purchaseId, it.product_id || null, it.description, it.qty, it.unit_cost, it.qty * it.unit_cost);
        if (it.product_id) updateStock.run(it.qty, it.unit_cost, it.product_id);
      }

      const insertSupTrans = getDb().prepare('INSERT INTO supplier_transactions (supplier_id, type, amount, description, employee_id, purchase_id) VALUES (?,?,?,?,?,?)');
      insertSupTrans.run(b.supplier_id, 'purchase', total, `فاتورة مشتريات رقم ${purchaseNumber.replace('PUR-', '')}`, b.employee_id || null, purchaseId);
      if (paidAmount > 0) {
        insertSupTrans.run(b.supplier_id, 'payment', paidAmount, `دفعة عند استلام فاتورة مشتريات رقم ${purchaseNumber.replace('PUR-', '')}`, b.employee_id || null, purchaseId);
      }

      broadcast('purchases'); broadcast('products'); broadcast('suppliers');
      res.json({ id: purchaseId, purchase_number: purchaseNumber, total });
    } catch (err) {
      res.status(500).json({ error: 'حدث خطأ أثناء حفظ فاتورة الشراء: ' + err.message });
    }
  });
  app.post('/api/purchases/:id/pay', (req, res) => {
    const purchase = getDb().prepare('SELECT * FROM purchases WHERE id=?').get(req.params.id);
    if (!purchase) return res.status(404).json({ error: 'فاتورة الشراء غير موجودة' });
    const amount = Number(req.body.amount);
    if (!(amount > 0)) return res.status(400).json({ error: 'مبلغ التسديد يجب أن يكون أكبر من صفر' });
    const remaining = purchase.total - purchase.paid_amount;
    if (amount > remaining) return res.status(400).json({ error: `المبلغ المدخل (${amount}) أكبر من المتبقي على فاتورة الشراء (${remaining})` });
    const newPaid = purchase.paid_amount + amount;
    const newStatus = newPaid >= purchase.total ? 'مدفوعة' : 'مدفوعة جزئياً';
    getDb().prepare('UPDATE purchases SET paid_amount=?, status=? WHERE id=?').run(newPaid, newStatus, purchase.id);
    getDb().prepare('INSERT INTO supplier_transactions (supplier_id, type, amount, description, employee_id, purchase_id) VALUES (?,?,?,?,?,?)')
      .run(purchase.supplier_id, 'payment', amount, `دفعة على فاتورة مشتريات رقم ${purchase.purchase_number.replace('PUR-', '')}`, req.body.employee_id || null, purchase.id);
    broadcast('purchases'); broadcast('suppliers');
    res.json({ ok: true, paid_amount: newPaid, status: newStatus, remaining: purchase.total - newPaid });
  });
  app.delete('/api/purchases/:id', (req, res) => {
    const purchase = getDb().prepare('SELECT * FROM purchases WHERE id=?').get(req.params.id);
    if (!purchase) return res.status(404).json({ error: 'فاتورة الشراء غير موجودة' });
    const items = getDb().prepare('SELECT * FROM purchase_items WHERE purchase_id=?').all(req.params.id);
    const updateStock = getDb().prepare('UPDATE products SET stock_qty = stock_qty - ? WHERE id=?');
    items.forEach(it => { if (it.product_id) updateStock.run(it.qty, it.product_id); });
    getDb().prepare('DELETE FROM purchase_items WHERE purchase_id=?').run(req.params.id);
    getDb().prepare('DELETE FROM supplier_transactions WHERE purchase_id=?').run(req.params.id);
    getDb().prepare('DELETE FROM purchases WHERE id=?').run(req.params.id);
    broadcast('purchases'); broadcast('products'); broadcast('suppliers');
    res.json({ ok: true });
  });

  // ---------- الطلبات الخاصة (قطع مميزة يطلبها الزبون) ----------
  const SPECIAL_ORDER_STATUSES = ['قيد الانتظار', 'تم الطلب من المورد', 'وصلت - جاهزة للاستلام', 'تم التسليم', 'ملغاة'];
  app.get('/api/special-orders', (req, res) => {
    const { status, from, to } = req.query;
    let q = `SELECT so.*, s.name as supplier_name, emp.full_name as employee_name
             FROM special_orders so LEFT JOIN suppliers s ON s.id=so.supplier_id
             LEFT JOIN employees emp ON emp.id=so.employee_id WHERE 1=1`;
    const params = [];
    if (status) { q += ' AND so.status=?'; params.push(status); }
    if (from) { q += ' AND date(so.order_date) >= date(?)'; params.push(from); }
    if (to) { q += ' AND date(so.order_date) <= date(?)'; params.push(to); }
    q += ' ORDER BY so.id DESC';
    res.json(getDb().prepare(q).all(...params));
  });
  app.get('/api/special-orders/:id', (req, res) => {
    const order = getDb().prepare(`SELECT so.*, s.name as supplier_name, s.phone as supplier_phone, emp.full_name as employee_name
      FROM special_orders so LEFT JOIN suppliers s ON s.id=so.supplier_id LEFT JOIN employees emp ON emp.id=so.employee_id
      WHERE so.id=?`).get(req.params.id);
    if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
    res.json(order);
  });
  app.post('/api/special-orders', (req, res) => {
    try {
      const b = req.body;
      if (!b.customer_name || !String(b.customer_name).trim()) return res.status(400).json({ error: 'الرجاء إدخال اسم الزبون' });
      if (!b.item_description || !String(b.item_description).trim()) return res.status(400).json({ error: 'الرجاء إدخال وصف القطعة المطلوبة' });
      const orderNumber = 'SO-' + Date.now();
      const info = getDb().prepare(`INSERT INTO special_orders
        (order_number, patient_id, customer_name, customer_phone, item_description, supplier_id, expected_price, deposit_amount, status, employee_id, notes)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .run(orderNumber, b.patient_id || null, b.customer_name.trim(), b.customer_phone || '', b.item_description.trim(),
          b.supplier_id || null, b.expected_price || 0, b.deposit_amount || 0, 'قيد الانتظار', b.employee_id || null, b.notes || '');
      broadcast('special_orders');
      res.json({ id: info.lastInsertRowid, order_number: orderNumber });
    } catch (err) {
      res.status(500).json({ error: 'حدث خطأ أثناء حفظ الطلب: ' + err.message });
    }
  });
  app.post('/api/special-orders/:id/status', (req, res) => {
    const order = getDb().prepare('SELECT * FROM special_orders WHERE id=?').get(req.params.id);
    if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
    if (order.status === 'تم التسليم') return res.status(400).json({ error: 'تم تسليم هذا الطلب بالفعل ولا يمكن تعديل حالته' });
    const { status } = req.body;
    if (!SPECIAL_ORDER_STATUSES.includes(status) || status === 'تم التسليم') {
      return res.status(400).json({ error: 'حالة غير صحيحة' });
    }
    getDb().prepare('UPDATE special_orders SET status=? WHERE id=?').run(status, order.id);
    broadcast('special_orders');
    res.json({ ok: true, status });
  });
  app.post('/api/special-orders/:id/deliver', (req, res) => {
    try {
      const order = getDb().prepare('SELECT * FROM special_orders WHERE id=?').get(req.params.id);
      if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
      if (order.status === 'تم التسليم') return res.status(400).json({ error: 'تم تسليم هذا الطلب مسبقًا' });
      if (order.status === 'ملغاة') return res.status(400).json({ error: 'هذا الطلب ملغى ولا يمكن تسليمه' });
      const b = req.body;
      const qty = Number(b.qty) > 0 ? Number(b.qty) : 1;
      const unitPrice = Number(b.unit_price);
      if (isNaN(unitPrice) || unitPrice < 0) return res.status(400).json({ error: 'السعر غير صحيح' });
      const discount = Number(b.discount) || 0;
      const subtotal = qty * unitPrice;
      const total = Math.max(0, subtotal - discount);
      const extraPaidNow = Math.max(0, Number(b.paid_amount) || 0);
      const totalPaid = Math.min(order.deposit_amount + extraPaidNow, total);
      const status = totalPaid >= total ? 'مدفوعة' : (totalPaid > 0 ? 'مدفوعة جزئياً' : 'غير مدفوعة');
      const invoiceNumber = 'INV-' + Date.now();
      const employeeId = b.employee_id || order.employee_id || null;

      const insertInvoice = getDb().prepare(`INSERT INTO invoices
        (invoice_number, patient_id, employee_id, subtotal, discount, total, paid_amount, payment_method, status, currency, exchange_rate, notes)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
      const info = insertInvoice.run(invoiceNumber, order.patient_id || null, employeeId, subtotal, discount, total, totalPaid,
        b.payment_method || 'نقدي', status, 'IQD', 1, `طلب خاص رقم ${order.order_number.replace('SO-', '')}: ${order.item_description}`);
      const invoiceId = info.lastInsertRowid;

      getDb().prepare('INSERT INTO invoice_items (invoice_id, product_id, description, qty, unit_price, total) VALUES (?,?,?,?,?,?)')
        .run(invoiceId, b.product_id || null, order.item_description, qty, unitPrice, subtotal);
      if (b.product_id) getDb().prepare('UPDATE products SET stock_qty = stock_qty - ? WHERE id=?').run(qty, b.product_id);
      if (totalPaid > 0) {
        getDb().prepare('INSERT INTO invoice_payments (invoice_id, amount, employee_id) VALUES (?,?,?)').run(invoiceId, totalPaid, employeeId);
      }

      getDb().prepare("UPDATE special_orders SET status='تم التسليم', invoice_id=? WHERE id=?").run(invoiceId, order.id);
      broadcast('special_orders'); broadcast('invoices'); broadcast('products');
      res.json({ ok: true, invoice_id: invoiceId, invoice_number: invoiceNumber, total, paid_amount: totalPaid });
    } catch (err) {
      res.status(500).json({ error: 'حدث خطأ أثناء تسليم الطلب وإصدار الفاتورة: ' + err.message });
    }
  });
  app.delete('/api/special-orders/:id', (req, res) => {
    const order = getDb().prepare('SELECT * FROM special_orders WHERE id=?').get(req.params.id);
    if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
    if (order.status === 'تم التسليم') return res.status(400).json({ error: 'لا يمكن حذف طلب تم تسليمه بالفعل، ألغِ الفاتورة المرتبطة بدلًا من ذلك إن لزم' });
    getDb().prepare('DELETE FROM special_orders WHERE id=?').run(req.params.id);
    broadcast('special_orders');
    res.json({ ok: true });
  });

  // ---------- الصندوق (متعدد الأشخاص) ----------
  app.get('/api/cashboxes', (req, res) => {
    const { status } = req.query;
    let q = `SELECT cb.*, e.full_name as employee_name FROM cash_boxes cb LEFT JOIN employees e ON e.id=cb.employee_id WHERE 1=1`;
    const params = [];
    if (status) { q += ' AND cb.status=?'; params.push(status); }
    q += ' ORDER BY cb.id DESC';
    res.json(getDb().prepare(q).all(...params));
  });
  app.post('/api/cashboxes', (req, res) => {
    const { employee_id, opening_balance, notes } = req.body;
    if (!employee_id) return res.status(400).json({ error: 'الرجاء تحديد الموظف المسؤول عن الصندوق' });
    const openAlready = getDb().prepare("SELECT COUNT(*) c FROM cash_boxes WHERE employee_id=? AND status='مفتوح'").get(employee_id).c;
    if (openAlready > 0) return res.status(400).json({ error: 'يوجد صندوق مفتوح بالفعل لهذا الموظف' });
    const info = getDb().prepare('INSERT INTO cash_boxes (employee_id, opening_balance, notes) VALUES (?,?,?)').run(employee_id, opening_balance || 0, notes || '');
    broadcast('cashboxes'); res.json({ id: info.lastInsertRowid });
  });
  app.get('/api/cashboxes/:id', (req, res) => {
    const box = getDb().prepare(`SELECT cb.*, e.full_name as employee_name FROM cash_boxes cb LEFT JOIN employees e ON e.id=cb.employee_id WHERE cb.id=?`).get(req.params.id);
    if (!box) return res.status(404).json({ error: 'الصندوق غير موجود' });
    box.movements = getDb().prepare('SELECT * FROM cash_movements WHERE cash_box_id=? ORDER BY id ASC').all(req.params.id);
    box.expenses = getDb().prepare('SELECT * FROM expenses WHERE cash_box_id=? ORDER BY id ASC').all(req.params.id);
    const calc = getCashboxAvailableBalance(box);
    box.cash_sales = calc.cashSales;
    box.expected_balance = calc.available;
    res.json(box);
  });
  function getCashboxAvailableBalance(box) {
    const cashSales = getDb().prepare(`
      SELECT COALESCE(SUM(paid_amount),0) t FROM invoices
      WHERE employee_id=? AND payment_method='نقدي' AND datetime(invoice_date) >= datetime(?)
    `).get(box.employee_id, box.opening_date).t;
    const movements = getDb().prepare('SELECT * FROM cash_movements WHERE cash_box_id=?').all(box.id);
    const deposits = movements.filter(m => m.type === 'deposit').reduce((s, m) => s + m.amount, 0);
    const withdrawals = movements.filter(m => m.type === 'withdraw').reduce((s, m) => s + m.amount, 0);
    const totalExpenses = getDb().prepare('SELECT COALESCE(SUM(amount),0) t FROM expenses WHERE cash_box_id=?').get(box.id).t;
    return { cashSales, deposits, withdrawals, totalExpenses, available: box.opening_balance + cashSales + deposits - withdrawals - totalExpenses };
  }

  app.post('/api/cashboxes/:id/movements', (req, res) => {
    const { type, amount, reason } = req.body;
    if (!['deposit', 'withdraw'].includes(type)) return res.status(400).json({ error: 'نوع الحركة غير صحيح' });
    if (!(Number(amount) > 0)) return res.status(400).json({ error: 'المبلغ يجب أن يكون أكبر من صفر' });
    const box = getDb().prepare('SELECT * FROM cash_boxes WHERE id=?').get(req.params.id);
    if (!box || box.status !== 'مفتوح') return res.status(400).json({ error: 'الصندوق مغلق أو غير موجود' });
    if (type === 'withdraw') {
      const { available } = getCashboxAvailableBalance(box);
      if (Number(amount) > available) {
        return res.status(400).json({ error: `المبلغ المطلوب سحبه (${amount}) أكبر من المتوفر فعليًا بالصندوق (${available})` });
      }
    }
    getDb().prepare('INSERT INTO cash_movements (cash_box_id, type, amount, reason) VALUES (?,?,?,?)').run(req.params.id, type, amount, reason || '');
    broadcast('cashboxes'); res.json({ ok: true });
  });
  app.post('/api/cashboxes/:id/close', (req, res) => {
    const box = getDb().prepare('SELECT * FROM cash_boxes WHERE id=?').get(req.params.id);
    if (!box) return res.status(404).json({ error: 'الصندوق غير موجود' });
    if (box.status !== 'مفتوح') return res.status(400).json({ error: 'الصندوق مغلق بالفعل' });
    const closing_balance = Number(req.body.closing_balance);
    if (isNaN(closing_balance)) return res.status(400).json({ error: 'الرجاء إدخال المبلغ الفعلي بالصندوق' });
    getDb().prepare("UPDATE cash_boxes SET status='مغلق', closing_balance=?, closing_date=datetime('now') WHERE id=?").run(closing_balance, req.params.id);
    broadcast('cashboxes'); res.json({ ok: true });
  });

  // ---------- المصاريف ----------
  app.get('/api/expenses', (req, res) => {
    const { from, to, employee_id } = req.query;
    let q = `SELECT ex.*, e.full_name as employee_name FROM expenses ex LEFT JOIN employees e ON e.id=ex.employee_id WHERE 1=1`;
    const params = [];
    if (from) { q += ' AND date(ex.expense_date) >= date(?)'; params.push(from); }
    if (to) { q += ' AND date(ex.expense_date) <= date(?)'; params.push(to); }
    if (employee_id) { q += ' AND ex.employee_id=?'; params.push(employee_id); }
    q += ' ORDER BY ex.id DESC';
    res.json(getDb().prepare(q).all(...params));
  });
  app.post('/api/expenses', (req, res) => {
    const { description, amount, category, employee_id, cash_box_id, notes } = req.body;
    if (!description || !String(description).trim()) return res.status(400).json({ error: 'وصف المصروف مطلوب' });
    if (!(Number(amount) > 0)) return res.status(400).json({ error: 'المبلغ يجب أن يكون أكبر من صفر' });
    const info = getDb().prepare('INSERT INTO expenses (description, amount, category, employee_id, cash_box_id, notes) VALUES (?,?,?,?,?,?)')
      .run(description.trim(), amount, category || '', employee_id || null, cash_box_id || null, notes || '');
    broadcast('expenses'); res.json({ id: info.lastInsertRowid });
  });
  app.delete('/api/expenses/:id', (req, res) => {
    getDb().prepare('DELETE FROM expenses WHERE id=?').run(req.params.id);
    broadcast('expenses'); res.json({ ok: true });
  });

  // ---------- الجرد ----------
  app.get('/api/stocktakes', (req, res) => {
    res.json(getDb().prepare(`SELECT st.*, e.full_name as employee_name FROM stock_takes st LEFT JOIN employees e ON e.id=st.employee_id ORDER BY st.id DESC`).all());
  });
  app.post('/api/stocktakes', (req, res) => {
    const { employee_id, notes } = req.body;
    const info = getDb().prepare('INSERT INTO stock_takes (employee_id, notes) VALUES (?,?)').run(employee_id || null, notes || '');
    const stId = info.lastInsertRowid;
    const products = getDb().prepare('SELECT id, stock_qty FROM products').all();
    const insertItem = getDb().prepare('INSERT INTO stock_take_items (stock_take_id, product_id, system_qty, counted_qty) VALUES (?,?,?,NULL)');
    products.forEach(p => insertItem.run(stId, p.id, p.stock_qty));
    broadcast('stocktakes'); res.json({ id: stId });
  });
  app.get('/api/stocktakes/:id', (req, res) => {
    const st = getDb().prepare('SELECT * FROM stock_takes WHERE id=?').get(req.params.id);
    if (!st) return res.status(404).json({ error: 'جلسة الجرد غير موجودة' });
    st.items = getDb().prepare(`
      SELECT sti.*, p.name as product_name, p.barcode FROM stock_take_items sti
      JOIN products p ON p.id = sti.product_id WHERE sti.stock_take_id=? ORDER BY p.name
    `).all(req.params.id);
    res.json(st);
  });
  app.put('/api/stocktakes/:stId/items/:itemId', (req, res) => {
    const st = getDb().prepare('SELECT * FROM stock_takes WHERE id=?').get(req.params.stId);
    if (!st) return res.status(404).json({ error: 'جلسة الجرد غير موجودة' });
    if (st.status === 'مكتمل') return res.status(400).json({ error: 'لا يمكن تعديل جرد مكتمل بالفعل' });
    const item = getDb().prepare('SELECT * FROM stock_take_items WHERE id=? AND stock_take_id=?').get(req.params.itemId, req.params.stId);
    if (!item) return res.status(404).json({ error: 'عنصر الجرد غير موجود' });
    const counted_qty = req.body.counted_qty === '' || req.body.counted_qty === null ? null : Number(req.body.counted_qty);
    getDb().prepare('UPDATE stock_take_items SET counted_qty=? WHERE id=? AND stock_take_id=?').run(counted_qty, req.params.itemId, req.params.stId);
    res.json({ ok: true });
  });
  app.post('/api/stocktakes/:id/complete', (req, res) => {
    const st = getDb().prepare('SELECT * FROM stock_takes WHERE id=?').get(req.params.id);
    if (!st) return res.status(404).json({ error: 'جلسة الجرد غير موجودة' });
    if (st.status === 'مكتمل') return res.status(400).json({ error: 'تم إنهاء هذا الجرد مسبقًا' });
    const items = getDb().prepare('SELECT * FROM stock_take_items WHERE stock_take_id=?').all(req.params.id);
    const updateStock = getDb().prepare('UPDATE products SET stock_qty=? WHERE id=?');
    items.forEach(it => {
      if (it.counted_qty !== null && it.counted_qty !== undefined) updateStock.run(it.counted_qty, it.product_id);
    });
    getDb().prepare("UPDATE stock_takes SET status='مكتمل' WHERE id=?").run(req.params.id);
    broadcast('stocktakes'); broadcast('products');
    res.json({ ok: true });
  });

  // ---------- أرصدة العملاء ----------
  app.get('/api/customer-balances', (req, res) => {
    const rows = getDb().prepare(`
      SELECT p.id, p.full_name, p.phone, COALESCE(SUM(i.total - i.paid_amount),0) as balance
      FROM patients p JOIN invoices i ON i.patient_id = p.id
      WHERE i.status != 'مدفوعة'
      GROUP BY p.id HAVING balance > 0 ORDER BY balance DESC
    `).all();
    res.json(rows);
  });

  app.get('/api/suppliers/:id/statement', (req, res) => {
    const supplier = getDb().prepare('SELECT * FROM suppliers WHERE id=?').get(req.params.id);
    if (!supplier) return res.status(404).json({ error: 'المورد غير موجود' });
    const { from, to } = req.query;
    const all = getDb().prepare('SELECT * FROM supplier_transactions WHERE supplier_id=? ORDER BY transaction_date ASC, id ASC').all(req.params.id);

    let openingBalance = 0;
    const periodEntries = [];
    all.forEach(t => {
      const entryDate = (t.transaction_date || '').split(' ')[0];
      const debit = t.type === 'purchase' ? t.amount : 0;
      const credit = t.type === 'payment' ? t.amount : 0;
      if (from && entryDate < from) {
        openingBalance += debit - credit;
      } else if (!to || entryDate <= to) {
        periodEntries.push({
          date: t.transaction_date,
          description: t.type === 'purchase' ? `فاتورة شراء${t.description ? ' - ' + t.description : ''}` : `تسديد${t.description ? ' - ' + t.description : ''}`,
          debit, credit
        });
      }
    });
    let running = openingBalance;
    const rows = periodEntries.map(e => { running += e.debit - e.credit; return { ...e, balance: running }; });
    res.json({ name: supplier.name, phone: supplier.phone, from: from || null, to: to || null, opening_balance: openingBalance, entries: rows, closing_balance: running });
  });

  app.get('/api/patients/:id/statement', (req, res) => {
    const patient = getDb().prepare('SELECT * FROM patients WHERE id=?').get(req.params.id);
    if (!patient) return res.status(404).json({ error: 'المريض غير موجود' });
    const { from, to } = req.query;

    const invoices = getDb().prepare('SELECT id, invoice_number, invoice_date, total FROM invoices WHERE patient_id=?').all(req.params.id);
    const invoiceIds = invoices.map(i => i.id);
    let payments = [];
    if (invoiceIds.length) {
      const placeholders = invoiceIds.map(() => '?').join(',');
      payments = getDb().prepare(`SELECT * FROM invoice_payments WHERE invoice_id IN (${placeholders})`).all(...invoiceIds);
    }
    const invoiceMap = {}; invoices.forEach(i => invoiceMap[i.id] = i);

    let allEntries = [];
    invoices.forEach(inv => {
      allEntries.push({ date: inv.invoice_date, description: `فاتورة رقم ${inv.invoice_number}`, debit: inv.total, credit: 0, invoice_id: inv.id });
    });
    payments.forEach(p => {
      const inv = invoiceMap[p.invoice_id];
      allEntries.push({ date: p.payment_date, description: `دفعة على فاتورة ${inv ? inv.invoice_number : ''}`, debit: 0, credit: p.amount, invoice_id: p.invoice_id });
    });
    allEntries.sort((a, b) => new Date(a.date) - new Date(b.date));

    let openingBalance = 0;
    const periodEntries = [];
    allEntries.forEach(e => {
      const entryDate = (e.date || '').split(' ')[0];
      if (from && entryDate < from) {
        openingBalance += e.debit - e.credit;
      } else if (!to || entryDate <= to) {
        periodEntries.push(e);
      }
    });
    let running = openingBalance;
    const rows = periodEntries.map(e => { running += e.debit - e.credit; return { ...e, balance: running }; });
    res.json({ name: patient.full_name, phone: patient.phone, from: from || null, to: to || null, opening_balance: openingBalance, entries: rows, closing_balance: running });
  });

  app.use((err, req, res, next) => {
    console.error('خطأ غير متوقع في الخادم:', err);
    res.status(500).json({ error: 'حدث خطأ غير متوقع في الخادم. حاول مرة أخرى.' });
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`تم تشغيل الخادم على المنفذ ${port}`);
    if (typeof onReady === 'function') onReady();
  });

  return { app, server, io };
}

module.exports = { startServer };
