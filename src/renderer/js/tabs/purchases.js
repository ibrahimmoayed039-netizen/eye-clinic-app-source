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
  const input = await showPromptModal(`المتبقي على فاتورة الشراء هذه: ${remaining.toLocaleString('ar')} د.ع<br>أدخل المبلغ المُسدَّد الآن:`, remaining, { money: true });
  if (input === null) return;
  const amount = parseFloat(input);
  if (!amount || amount <= 0) { showAlertModal('الرجاء إدخال مبلغ صحيح أكبر من صفر'); return; }
  try {
    const res = await API.post(`/api/purchases/${id}/pay`, { amount, employee_id: CURRENT_USER.id });
    showAlertModal(`✅ تم تسجيل التسديد بنجاح.\nالحالة الآن: ${res.status}${res.remaining > 0 ? `\nالمتبقي: ${res.remaining.toLocaleString('ar')} د.ع` : ''}`);
    loadPurchases();
  } catch (err) {
    showAlertModal('تعذر تسجيل التسديد: ' + err.message);
  }
}

async function deletePurchase(id) {
  if (!(await showConfirmModal('حذف فاتورة الشراء هذه؟ سيتم خصم الكميات المضافة للمخزون منها وحذف حركة الدين المرتبطة بها من كشف حساب المورد.'))) return;
  try {
    await API.del(`/api/purchases/${id}`);
    loadPurchases();
  } catch (err) {
    showAlertModal('تعذر حذف فاتورة الشراء: ' + err.message);
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
    <div class="card">
      <div class="toolbar" style="justify-content:space-between">
        <h2>🛒 فاتورة شراء جديدة من مورد</h2>
        <button class="btn secondary" onclick="renderPurchasesTab(document.getElementById('content'))">◀ رجوع لسجل المشتريات</button>
      </div>
      <div class="grid-2">
        <div class="form-group"><label>المورد</label>
          <select id="pu-supplier" onchange="renderPurchaseCartTable()">
            <option value="">-- اختر المورد --</option>
            ${PURCHASES_SUPPLIERS_CACHE.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>الباركود</label>
          <input id="pu-barcode-scan" placeholder="📷 امسح الباركود هنا (يضاف تلقائيًا)..." style="border-color:#0f766e" onkeydown="handlePurchaseBarcodeScan(event)">
        </div>
      </div>

      <div class="purchase-layout">
        <div>
          <div class="form-group"><label>المنتجات</label>
            <div class="toolbar" style="margin-bottom:8px">
              <input id="pu-product-search" placeholder="ابحث بالاسم..." style="flex:1" oninput="loadPurchaseProductGrid()">
              <select id="pu-product-category" onchange="loadPurchaseProductGrid()">
                <option value="">كل الفئات</option>
                ${categoryOptionsHtml(PURCHASES_CATEGORIES_CACHE, '')}
              </select>
            </div>
            <div id="purchase-product-grid" class="product-grid" style="max-height:420px"></div>
          </div>
        </div>

        <div class="cart-panel">
          <div class="cart-panel-header">
            <h3>🧾 قائمة الشراء <span class="cart-count-badge" id="cart-count-badge">0</span></h3>
            <button class="btn small secondary" onclick="addCustomPurchaseItem()">+ صنف مخصص</button>
          </div>
          <div id="pu-supplier-tag" style="font-size:12px;color:#0f766e;margin-bottom:10px;min-height:16px"></div>
          <div id="purchase-cart-table"></div>
          <div class="cart-summary-row"><span>الإجمالي الفرعي</span><span id="pu-subtotal-display">0 د.ع</span></div>
          <div class="cart-summary-row"><span>الخصم (د.ع)</span><input id="pu-discount" inputmode="decimal" value="0" oninput="formatNumberInput(this); renderPurchaseCartTable()"></div>
          <div class="cart-summary-total"><span>الإجمالي</span><span id="purchase-cart-total"></span></div>
          <div class="form-group" style="margin-top:10px"><label>المبلغ المدفوع الآن</label><input id="pu-paid" inputmode="decimal" value="0" oninput="formatNumberInput(this)"></div>
          <div class="form-group"><label>ملاحظات</label><input id="pu-notes" placeholder="رقم فاتورة المورد الأصلية، تفاصيل الشحنة..."></div>
          <button class="btn" style="width:100%;margin-top:6px" onclick="submitPurchase()">✅ حفظ فاتورة الشراء</button>
        </div>
      </div>
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
  if (!product) { showAlertModal(`لا يوجد منتج بهذا الباركود: ${code}`); return; }
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
  const costStr = await showPromptModal('سعر التكلفة للوحدة:', '0', { money: true });
  const cost = parseFloat(costStr) || 0;
  PURCHASE_CART.push({ product_id: null, description: name, qty: 1, unit_cost: cost });
  renderPurchaseCartTable();
}

function updatePurchaseCartQty(idx, qty) {
  PURCHASE_CART[idx].qty = Math.max(1, parseFloat(qty) || 1);
  renderPurchaseCartTable();
}
function updatePurchaseCartCost(idx, cost) {
  PURCHASE_CART[idx].unit_cost = Math.max(0, unformatNumber(cost));
  renderPurchaseCartTable();
}
function removePurchaseCartItem(idx) {
  PURCHASE_CART.splice(idx, 1);
  renderPurchaseCartTable();
}

function renderPurchaseCartTable() {
  const box = document.getElementById('purchase-cart-table');
  const countBadge = document.getElementById('cart-count-badge');
  const itemCount = PURCHASE_CART.reduce((s, c) => s + Number(c.qty || 0), 0);
  if (countBadge) countBadge.textContent = itemCount;

  const supplierTag = document.getElementById('pu-supplier-tag');
  if (supplierTag) {
    const supplierId = document.getElementById('pu-supplier')?.value;
    const supplier = PURCHASES_SUPPLIERS_CACHE.find(s => String(s.id) === String(supplierId));
    supplierTag.textContent = supplier ? `📦 المورد: ${supplier.name}` : '';
  }

  if (!PURCHASE_CART.length) {
    box.innerHTML = `
      <div class="empty-cart-panel">
        <span class="icon">🛍️</span>
        قائمة الشراء فارغة<br>اختر منتجات من القائمة، أو امسح باركود، أو أضف صنفًا مخصصًا
      </div>
    `;
  } else {
    box.innerHTML = `
      <div class="cart-list">
        ${PURCHASE_CART.map((c, idx) => `
          <div class="cart-row">
            <div class="cart-row-info">
              <div class="cart-row-name">${c.description}</div>
              <div class="cart-row-unit">تكلفة الوحدة: <input inputmode="decimal" value="${fmtNum(c.unit_cost)}" oninput="formatNumberInput(this)" onchange="updatePurchaseCartCost(${idx}, this.value)"></div>
            </div>
            <div class="qty-stepper">
              <button type="button" onclick="updatePurchaseCartQty(${idx}, ${c.qty} - 1)">−</button>
              <input type="number" value="${c.qty}" onchange="updatePurchaseCartQty(${idx}, this.value)">
              <button type="button" onclick="updatePurchaseCartQty(${idx}, ${c.qty} + 1)">+</button>
            </div>
            <div class="cart-row-total">${(c.qty * c.unit_cost).toLocaleString('ar')}</div>
            <button class="cart-row-remove" onclick="removePurchaseCartItem(${idx})">×</button>
          </div>
        `).join('')}
      </div>
    `;
  }
  const subtotal = PURCHASE_CART.reduce((s, c) => s + c.qty * c.unit_cost, 0);
  const discount = unformatNumber(document.getElementById('pu-discount')?.value);
  const total = Math.max(0, subtotal - discount);
  const subtotalEl = document.getElementById('pu-subtotal-display');
  if (subtotalEl) subtotalEl.textContent = `${subtotal.toLocaleString('ar')} د.ع`;
  document.getElementById('purchase-cart-total').textContent = `${total.toLocaleString('ar')} د.ع`;
}

async function submitPurchase() {
  const supplierId = document.getElementById('pu-supplier').value;
  if (!supplierId) { showAlertModal('الرجاء اختيار المورد أولاً'); return; }
  if (!PURCHASE_CART.length) { showAlertModal('أضف أصنافًا لفاتورة الشراء أولاً'); return; }
  const payload = {
    supplier_id: parseInt(supplierId),
    employee_id: CURRENT_USER.id,
    items: PURCHASE_CART,
    discount: unformatNumber(document.getElementById('pu-discount').value),
    paid_amount: unformatNumber(document.getElementById('pu-paid').value),
    notes: document.getElementById('pu-notes').value,
  };
  try {
    const result = await API.post('/api/purchases', payload);
    showAlertModal(`✅ تم حفظ فاتورة الشراء رقم ${result.purchase_number.replace('PUR-', '')} وتحديث المخزون بنجاح`);
    await printPurchaseInvoice(result.id);
    renderPurchasesTab(document.getElementById('content'));
  } catch (err) {
    showAlertModal('تعذر حفظ فاتورة الشراء: ' + err.message);
  }
}
