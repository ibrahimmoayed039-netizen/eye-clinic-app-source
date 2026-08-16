let PURCHASE_CART = [];
let PURCHASES_PRODUCTS_CACHE = [];
let PURCHASES_CATEGORIES_CACHE = [];
let PURCHASES_SUPPLIERS_CACHE = [];
let SELECTED_PURCHASE_SUPPLIER = null;

async function renderPurchasesTab(container) {
  container.innerHTML = `
    <div class="card">
      <div class="toolbar" style="justify-content:space-between">
        <div class="toolbar" style="gap:8px;margin:0">
          <input id="pur-search" placeholder="بحث برقم الفاتورة أو المورد..." style="width:220px" oninput="loadPurchases()">
          <input type="date" id="pur-from" onchange="loadPurchases()">
          <input type="date" id="pur-to" onchange="loadPurchases()">
        </div>
        <button class="btn" onclick="renderNewPurchaseForm(document.getElementById('content'))">+ فاتورة شراء جديدة</button>
      </div>
      <div id="purchases-table"></div>
    </div>
  `;
  loadPurchases();
}

async function loadPurchases() {
  const from = document.getElementById('pur-from')?.value || '';
  const to = document.getElementById('pur-to')?.value || '';
  const params = [];
  if (from) params.push(`from=${from}`);
  if (to) params.push(`to=${to}`);
  const rows = await API.get(`/api/purchases${params.length ? '?' + params.join('&') : ''}`);
  const search = (document.getElementById('pur-search')?.value || '').toLowerCase();
  const filtered = search
    ? rows.filter(p => p.purchase_number.toLowerCase().includes(search) || (p.supplier_name || '').toLowerCase().includes(search))
    : rows;

  const box = document.getElementById('purchases-table');
  if (!filtered.length) { box.innerHTML = '<div class="empty">لا توجد فواتير مشتريات بعد</div>'; return; }
  box.innerHTML = `
    <table>
      <thead><tr><th>رقم الفاتورة</th><th>المورد</th><th>التاريخ</th><th>الإجمالي</th><th>المدفوع</th><th>الحالة</th><th>إجراءات</th></tr></thead>
      <tbody>
        ${filtered.map(p => `
          <tr>
            <td>${p.purchase_number.replace('PUR-', '')}</td>
            <td>${p.supplier_name || '-'}</td>
            <td>${(p.purchase_date || '').split(' ')[0]}</td>
            <td><b>${p.total.toLocaleString('ar')} د.ع</b></td>
            <td>${p.paid_amount.toLocaleString('ar')} د.ع</td>
            <td><span class="badge ${p.status === 'مدفوعة' ? 'paid' : (p.status === 'مدفوعة جزئياً' ? 'partial' : 'unpaid')}">${p.status}</span></td>
            <td>
              <button class="btn small" onclick="viewPurchaseDetails(${p.id})">عرض</button>
              <button class="btn small secondary" onclick="printPurchaseInvoice(${p.id})">🖨️</button>
              ${p.status !== 'مدفوعة' ? `<button class="btn small secondary" onclick="collectPurchasePayment(${p.id}, ${p.total}, ${p.paid_amount})">💰 تسديد</button>` : ''}
              <button class="btn small danger" onclick="deletePurchase(${p.id})">حذف</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function viewPurchaseDetails(id) {
  const purchase = await API.get(`/api/purchases/${id}`);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="width:600px">
      <h3>🛒 فاتورة مشتريات رقم ${purchase.purchase_number.replace('PUR-', '')}</h3>
      <p><b>المورد:</b> ${purchase.supplier_name || '-'} ${purchase.supplier_phone ? '- ' + purchase.supplier_phone : ''}</p>
      <p><b>التاريخ:</b> ${(purchase.purchase_date || '').split(' ')[0]} | <b>الموظف:</b> ${purchase.employee_name || '-'}</p>
      <table>
        <thead><tr><th>الصنف</th><th>الكمية</th><th>سعر التكلفة</th><th>الإجمالي</th></tr></thead>
        <tbody>
          ${purchase.items.map(it => `<tr><td>${it.description}</td><td>${it.qty}</td><td>${it.unit_cost.toLocaleString('ar')}</td><td>${it.total.toLocaleString('ar')}</td></tr>`).join('')}
        </tbody>
      </table>
      <div style="margin-top:10px;font-size:14px">
        <p>الإجمالي الفرعي: ${purchase.subtotal.toLocaleString('ar')} د.ع</p>
        <p>الخصم: ${purchase.discount.toLocaleString('ar')} د.ع</p>
        <p style="font-weight:700;color:#0f766e">الإجمالي الكلي: ${purchase.total.toLocaleString('ar')} د.ع</p>
        <p>المدفوع: ${purchase.paid_amount.toLocaleString('ar')} د.ع | المتبقي: ${(purchase.total - purchase.paid_amount).toLocaleString('ar')} د.ع</p>
        ${purchase.notes ? `<p><b>ملاحظات:</b> ${purchase.notes}</p>` : ''}
      </div>
      <div class="modal-actions">
        <button class="btn secondary" onclick="this.closest('.modal-overlay').remove()">إغلاق</button>
        <button class="btn" onclick="printPurchaseInvoice(${purchase.id})">🖨️ طباعة</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

async function printPurchaseInvoice(id) {
  const [purchase, settings] = await Promise.all([API.get(`/api/purchases/${id}`), API.get('/api/settings')]);
  const html = buildPurchaseInvoiceHtml(purchase, settings);
  window.desktop.printPreview({ htmlContent: html, title: 'فاتورة مشتريات' });
}

async function collectPurchasePayment(id, total, paidAmount) {
  const remaining = total - paidAmount;
  const input = await showPromptModal(`المتبقي على فاتورة الشراء هذه: ${remaining.toLocaleString('ar')} د.ع<br>أدخل المبلغ المُسدَّد الآن:`, remaining);
  if (input === null) return;
  const amount = parseFloat(input);
  if (!amount || amount <= 0) { alert('الرجاء إدخال مبلغ صحيح أكبر من صفر'); return; }
  try {
    const res = await API.post(`/api/purchases/${id}/pay`, { amount, employee_id: CURRENT_USER.id });
    alert(`✅ تم تسجيل التسديد بنجاح.\nالحالة الآن: ${res.status}${res.remaining > 0 ? `\nالمتبقي: ${res.remaining.toLocaleString('ar')} د.ع` : ''}`);
    loadPurchases();
  } catch (err) {
    alert('تعذر تسجيل التسديد: ' + err.message);
  }
}

async function deletePurchase(id) {
  if (!confirm('حذف فاتورة الشراء هذه؟ سيتم خصم الكميات المضافة للمخزون منها وحذف حركة الدين المرتبطة بها من كشف حساب المورد.')) return;
  try {
    await API.del(`/api/purchases/${id}`);
    loadPurchases();
  } catch (err) {
    alert('تعذر حذف فاتورة الشراء: ' + err.message);
  }
}

// ================== فاتورة شراء جديدة ==================
async function renderNewPurchaseForm(container) {
  [PURCHASES_SUPPLIERS_CACHE, PURCHASES_PRODUCTS_CACHE, PURCHASES_CATEGORIES_CACHE] = await Promise.all([
    API.get('/api/suppliers'), API.get('/api/products'), API.get('/api/categories')
  ]);
  PURCHASE_CART = [];
  SELECTED_PURCHASE_SUPPLIER = null;

  container.innerHTML = `
    <div class="card" style="max-width:900px;margin:0 auto">
      <div class="toolbar" style="justify-content:space-between">
        <h2>🛒 فاتورة شراء جديدة من مورد</h2>
        <button class="btn secondary" onclick="renderPurchasesTab(document.getElementById('content'))">◀ رجوع لسجل المشتريات</button>
      </div>
      <div class="grid-2">
        <div class="form-group"><label>المورد</label>
          <select id="pu-supplier">
            <option value="">-- اختر المورد --</option>
            ${PURCHASES_SUPPLIERS_CACHE.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>الباركود</label>
          <input id="pu-barcode-scan" placeholder="📷 امسح الباركود هنا (يضاف تلقائيًا)..." style="border-color:#0f766e" onkeydown="handlePurchaseBarcodeScan(event)">
        </div>
      </div>
      <div class="form-group"><label>المنتجات</label>
        <div class="toolbar" style="margin-bottom:8px">
          <input id="pu-product-search" placeholder="ابحث بالاسم..." style="flex:1" oninput="loadPurchaseProductGrid()">
          <select id="pu-product-category" onchange="loadPurchaseProductGrid()">
            <option value="">كل الفئات</option>
            ${PURCHASES_CATEGORIES_CACHE.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
          </select>
        </div>
        <div id="purchase-product-grid" class="product-grid" style="max-height:280px"></div>
      </div>
      <div id="purchase-cart-table"></div>
      <div class="grid-2" style="margin-top:12px">
        <div class="form-group"><label>الخصم (د.ع)</label><input id="pu-discount" type="number" value="0" oninput="renderPurchaseCartTable()"></div>
        <div class="form-group"><label>المبلغ المدفوع الآن</label><input id="pu-paid" type="number" value="0"></div>
      </div>
      <div class="form-group"><label>ملاحظات</label><input id="pu-notes" placeholder="رقم فاتورة المورد الأصلية، تفاصيل الشحنة..."></div>
      <div id="purchase-cart-total" style="font-size:16px;font-weight:700;margin:10px 0"></div>
      <button class="btn" style="width:100%" onclick="submitPurchase()">✅ حفظ فاتورة الشراء (تحديث المخزون تلقائيًا)</button>
    </div>
  `;
  loadPurchaseProductGrid();
  renderPurchaseCartTable();
  document.getElementById('pu-barcode-scan')?.focus();
}

function loadPurchaseProductGrid() {
  const search = (document.getElementById('pu-product-search')?.value || '').toLowerCase();
  const cat = document.getElementById('pu-product-category')?.value || '';
  let filtered = PURCHASES_PRODUCTS_CACHE;
  if (search) filtered = filtered.filter(p => p.name.toLowerCase().includes(search));
  if (cat) filtered = filtered.filter(p => p.category === cat);
  const box = document.getElementById('purchase-product-grid');
  if (!filtered.length) { box.innerHTML = '<div class="empty" style="grid-column:1/-1">لا توجد منتجات مطابقة</div>'; return; }
  box.innerHTML = filtered.map(p => `
    <div class="product-card" onclick="addToPurchaseCart(${p.id}, '${p.name.replace(/'/g, "")}', ${p.cost})">
      <div class="product-card-name">${p.name}</div>
      <div class="product-card-price">تكلفة: ${p.cost.toLocaleString('ar')} د.ع</div>
      <div class="product-card-stock">المخزون الحالي: ${p.stock_qty}</div>
    </div>
  `).join('');
}

function handlePurchaseBarcodeScan(event) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  const input = event.target;
  const code = input.value.trim();
  input.value = '';
  if (!code) return;
  const product = PURCHASES_PRODUCTS_CACHE.find(p => p.barcode && p.barcode === code);
  if (!product) { alert(`لا يوجد منتج بهذا الباركود: ${code}`); return; }
  addToPurchaseCart(product.id, product.name, product.cost);
  input.focus();
}

function addToPurchaseCart(productId, name, cost) {
  const existing = PURCHASE_CART.find(c => c.product_id === productId);
  if (existing) existing.qty += 1;
  else PURCHASE_CART.push({ product_id: productId, description: name, qty: 1, unit_cost: cost });
  renderPurchaseCartTable();
}

async function addCustomPurchaseItem() {
  const name = await showPromptModal('اسم الصنف المخصص:');
  if (!name) return;
  const costStr = await showPromptModal('سعر التكلفة للوحدة:', '0');
  const cost = parseFloat(costStr) || 0;
  PURCHASE_CART.push({ product_id: null, description: name, qty: 1, unit_cost: cost });
  renderPurchaseCartTable();
}

function updatePurchaseCartQty(idx, qty) {
  PURCHASE_CART[idx].qty = Math.max(0.01, parseFloat(qty) || 1);
  renderPurchaseCartTable();
}
function updatePurchaseCartCost(idx, cost) {
  PURCHASE_CART[idx].unit_cost = Math.max(0, parseFloat(cost) || 0);
  renderPurchaseCartTable();
}
function removePurchaseCartItem(idx) {
  PURCHASE_CART.splice(idx, 1);
  renderPurchaseCartTable();
}

function renderPurchaseCartTable() {
  const box = document.getElementById('purchase-cart-table');
  if (!PURCHASE_CART.length) {
    box.innerHTML = '<div class="empty" style="padding:16px">أضف منتجات لفاتورة الشراء <br><button class="btn small secondary" style="margin-top:8px" onclick="addCustomPurchaseItem()">+ إضافة صنف مخصص</button></div>';
  } else {
    box.innerHTML = `
      <table>
        <thead><tr><th>الصنف</th><th>الكمية</th><th>سعر التكلفة</th><th>الإجمالي</th><th></th></tr></thead>
        <tbody>
          ${PURCHASE_CART.map((c, idx) => `
            <tr>
              <td>${c.description}</td>
              <td><input type="number" value="${c.qty}" style="width:60px" onchange="updatePurchaseCartQty(${idx}, this.value)"></td>
              <td><input type="number" step="0.01" value="${c.unit_cost}" style="width:90px" onchange="updatePurchaseCartCost(${idx}, this.value)"></td>
              <td>${(c.qty * c.unit_cost).toFixed(2)}</td>
              <td><button class="btn small danger" onclick="removePurchaseCartItem(${idx})">×</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <button class="btn small secondary" style="margin-top:8px" onclick="addCustomPurchaseItem()">+ صنف مخصص</button>
    `;
  }
  const subtotal = PURCHASE_CART.reduce((s, c) => s + c.qty * c.unit_cost, 0);
  const discount = parseFloat(document.getElementById('pu-discount')?.value) || 0;
  const total = Math.max(0, subtotal - discount);
  document.getElementById('purchase-cart-total').textContent = `الإجمالي: ${total.toLocaleString('ar')} د.ع`;
}

async function submitPurchase() {
  const supplierId = document.getElementById('pu-supplier').value;
  if (!supplierId) { alert('الرجاء اختيار المورد أولاً'); return; }
  if (!PURCHASE_CART.length) { alert('أضف أصنافًا لفاتورة الشراء أولاً'); return; }
  const payload = {
    supplier_id: parseInt(supplierId),
    employee_id: CURRENT_USER.id,
    items: PURCHASE_CART,
    discount: parseFloat(document.getElementById('pu-discount').value) || 0,
    paid_amount: parseFloat(document.getElementById('pu-paid').value) || 0,
    notes: document.getElementById('pu-notes').value,
  };
  try {
    const result = await API.post('/api/purchases', payload);
    alert(`✅ تم حفظ فاتورة الشراء رقم ${result.purchase_number.replace('PUR-', '')} وتحديث المخزون بنجاح`);
    await printPurchaseInvoice(result.id);
    renderPurchasesTab(document.getElementById('content'));
  } catch (err) {
    alert('تعذر حفظ فاتورة الشراء: ' + err.message);
  }
}
