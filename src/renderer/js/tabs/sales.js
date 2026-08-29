let CART = [];
let SALES_SETTINGS_CACHE = {};
let SALES_PRODUCTS_CACHE = [];
let SALES_CATEGORIES_CACHE = [];
let SALES_DRAFT_DISCOUNT = 0;
let SALES_DRAFT_PAYMENT = 'نقدي';
let SALES_DRAFT_NOTES = '';
let SALES_ACTIVE_CATEGORY = '';
let SALES_ACTIVE_BRANCH = '';
let SALES_UNDERPAY_ACK = false; // تأكيد الموظف بعد تحذير الدفع الناقص، لمرة واحدة فقط لكل محاولة

async function renderSalesTab(container, restoreData) {
  [SALES_SETTINGS_CACHE, SALES_PRODUCTS_CACHE, SALES_CATEGORIES_CACHE] = await Promise.all([
    API.get('/api/settings'), API.get('/api/products'), API.get('/api/categories')
  ]);

  const draft = restoreData || (CART.length ? {
    cart: CART,
    patient: window.SELECTED_PATIENT,
    discount: SALES_DRAFT_DISCOUNT,
    payment: SALES_DRAFT_PAYMENT,
    notes: SALES_DRAFT_NOTES,
  } : null);

  container.innerHTML = `
    <div id="held-invoices-box"></div>
    <div class="card" style="max-width:900px;margin:0 auto">
      <h2>🧾 فاتورة جديدة</h2>
      <div class="grid-2">
        <div class="form-group"><label>المريض / العميل</label>
          <div style="display:flex; gap:8px">
            <input id="s-patient-search" placeholder="ابحث عن مريض..." style="flex:1" oninput="searchPatientForSale()">
            <button class="btn small secondary" onclick="openNewPatientFromSales()">+ جديد</button>
          </div>
          <div id="s-patient-selected" style="font-size:12px;color:#0f766e;margin-top:5px"></div>
        </div>
        <div class="form-group"><label>الباركود</label>
          <input id="s-barcode-scan" placeholder="📷 امسح الباركود هنا (يضاف تلقائيًا)..." style="border-color:#0f766e" onkeydown="handleBarcodeScan(event)">
        </div>
      </div>
      <div class="form-group"><label>الأصناف</label>
        <div id="s-category-tabs" class="category-tabs"></div>
        <div id="s-branch-tabs" class="category-tabs branch-tabs" style="display:none"></div>
      </div>
      <div class="form-group"><label>المنتجات</label>
        <div class="toolbar" style="margin-bottom:8px">
          <input id="s-product-search" placeholder="ابحث بالاسم..." style="flex:1" oninput="loadProductGrid()">
        </div>
        <div id="product-grid" class="product-grid" style="max-height:340px"></div>
      </div>
      <div id="cart-table"></div>
      <div class="grid-3" style="margin-top:12px">
        <div class="form-group"><label>الخصم (د.ع)</label><input id="s-discount" inputmode="decimal" value="${fmtNum(draft ? (draft.discount || 0) : 0)}" oninput="formatNumberInput(this); renderCartTable(); SALES_DRAFT_DISCOUNT=unformatNumber(this.value)"></div>
        <div class="form-group"><label>طريقة الدفع</label>
          <select id="s-payment" onchange="SALES_DRAFT_PAYMENT=this.value">
            <option ${draft && draft.payment==='نقدي' ? 'selected':''}>نقدي</option>
            <option ${draft && draft.payment==='بطاقة' ? 'selected':''}>بطاقة</option>
            <option ${draft && draft.payment==='تحويل بنكي' ? 'selected':''}>تحويل بنكي</option>
          </select>
        </div>
        <div class="form-group"><label>عملة الفاتورة الحالية</label>
          <div class="hint" style="margin-top:9px">${SALES_SETTINGS_CACHE.invoice_currency === 'USD' ? 'دولار أمريكي ($)' : 'دينار عراقي (د.ع)'} — <span style="cursor:pointer;color:#0f766e;text-decoration:underline" onclick="switchTab('settings')">تغييرها من الإعدادات</span></div>
        </div>
      </div>
      <div class="grid-2">
        <div class="form-group"><label>المبلغ المدفوع</label><input id="s-paid" inputmode="decimal" value="0" oninput="formatNumberInput(this); SALES_UNDERPAY_ACK=false"></div>
        <div class="form-group"><label>ملاحظات</label><input id="s-notes" value="${draft ? (draft.notes || '') : ''}" oninput="SALES_DRAFT_NOTES=this.value"></div>
      </div>
      <div id="cart-total" style="font-size:16px;font-weight:700;margin:10px 0"></div>
      <div style="display:flex; gap:8px">
        <button class="btn" style="flex:1" onclick="submitInvoice()">✅ إتمام البيع وطباعة الفاتورة</button>
        <button class="btn secondary" onclick="holdCurrentInvoice()">⏸️ تعليق</button>
      </div>
      <p style="text-align:center;margin-top:14px"><span style="cursor:pointer;color:#0f766e;text-decoration:underline;font-size:13px" onclick="switchTab('reports')">📋 عرض سجل كل الفواتير من تبويب التقارير</span></p>
    </div>
  `;

  if (draft) {
    CART = draft.cart;
    window.SELECTED_PATIENT = draft.patient;
    SALES_DRAFT_DISCOUNT = draft.discount || 0;
    SALES_DRAFT_PAYMENT = draft.payment || 'نقدي';
    SALES_DRAFT_NOTES = draft.notes || '';
    if (draft.patient) {
      document.getElementById('s-patient-search').value = draft.patient.name;
      document.getElementById('s-patient-selected').textContent = `✔ العميل: ${draft.patient.name}`;
    }
  } else {
    CART = [];
    window.SELECTED_PATIENT = null;
    SALES_DRAFT_DISCOUNT = 0;
    SALES_DRAFT_PAYMENT = 'نقدي';
    SALES_DRAFT_NOTES = '';
  }
  SALES_ACTIVE_CATEGORY = '';
  SALES_ACTIVE_BRANCH = '';
  renderCategoryTabs();
  loadProductGrid();
  renderCartTable();
  renderHeldInvoicesBox();
  document.getElementById('s-barcode-scan')?.focus();
}

// تُرجع أسماء الفئة الرئيسية + جميع فروعها (لتصفية منتجات الفئة بالكامل عند عدم تحديد فرع)
function categoryAndBranchNames(mainName) {
  const main = SALES_CATEGORIES_CACHE.find(c => c.name === mainName && !c.parent_id);
  if (!main) return [mainName];
  const branches = SALES_CATEGORIES_CACHE.filter(c => c.parent_id === main.id).map(c => c.name);
  return [mainName, ...branches];
}

function renderCategoryTabs() {
  const box = document.getElementById('s-category-tabs');
  if (!box) return;
  const mains = SALES_CATEGORIES_CACHE.filter(c => !c.parent_id);
  const countAll = SALES_PRODUCTS_CACHE.length;
  const tabs = [{ name: '', label: 'الكل', count: countAll }, ...mains.map(c => ({
    name: c.name,
    label: c.name,
    count: SALES_PRODUCTS_CACHE.filter(p => categoryAndBranchNames(c.name).includes(p.category)).length,
  }))];
  box.innerHTML = tabs.map(t => `
    <button type="button" class="category-tab ${SALES_ACTIVE_CATEGORY === t.name ? 'active' : ''}" onclick="selectSalesCategory('${t.name.replace(/'/g, "")}')">
      ${t.label} <span class="category-tab-count">${t.count}</span>
    </button>
  `).join('');

  const branchBox = document.getElementById('s-branch-tabs');
  if (!branchBox) return;
  const activeMain = mains.find(c => c.name === SALES_ACTIVE_CATEGORY);
  const branches = activeMain ? SALES_CATEGORIES_CACHE.filter(c => c.parent_id === activeMain.id) : [];
  if (!branches.length) { branchBox.innerHTML = ''; branchBox.style.display = 'none'; return; }
  branchBox.style.display = 'flex';
  const branchTabs = [{ name: '', label: 'كل ' + activeMain.name }, ...branches.map(b => ({ name: b.name, label: b.name }))];
  branchBox.innerHTML = branchTabs.map(t => `
    <button type="button" class="category-tab branch-tab ${SALES_ACTIVE_BRANCH === t.name ? 'active' : ''}" onclick="selectSalesBranch('${t.name.replace(/'/g, "")}')">
      ${t.label}
    </button>
  `).join('');
}

function selectSalesCategory(name) {
  SALES_ACTIVE_CATEGORY = name;
  SALES_ACTIVE_BRANCH = '';
  renderCategoryTabs();
  loadProductGrid();
}

function selectSalesBranch(name) {
  SALES_ACTIVE_BRANCH = name;
  renderCategoryTabs();
  loadProductGrid();
}

function loadProductGrid() {
  const search = (document.getElementById('s-product-search')?.value || '').toLowerCase();
  let filtered = SALES_PRODUCTS_CACHE;
  if (search) filtered = filtered.filter(p => p.name.toLowerCase().includes(search));
  if (SALES_ACTIVE_BRANCH) {
    filtered = filtered.filter(p => p.category === SALES_ACTIVE_BRANCH);
  } else if (SALES_ACTIVE_CATEGORY) {
    const names = categoryAndBranchNames(SALES_ACTIVE_CATEGORY);
    filtered = filtered.filter(p => names.includes(p.category));
  }
  const box = document.getElementById('product-grid');
  if (!filtered.length) { box.innerHTML = '<div class="empty" style="grid-column:1/-1">لا توجد منتجات مطابقة</div>'; return; }
  box.innerHTML = filtered.map(p => `
    <div class="product-card ${p.stock_qty <= 0 ? 'out-of-stock' : ''}" onclick="${p.stock_qty > 0 ? `addToCart(${p.id}, '${p.name.replace(/'/g,"")}', ${p.price})` : ''}">
      <div class="product-card-name">${p.name}</div>
      <div class="product-card-price">${p.price.toLocaleString('ar')} د.ع</div>
      <div class="product-card-stock">المخزون: ${p.stock_qty}</div>
    </div>
  `).join('');
}

function handleBarcodeScan(event) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  const input = event.target;
  const code = input.value.trim();
  input.value = '';
  if (!code) return;
  const product = SALES_PRODUCTS_CACHE.find(p => p.barcode && p.barcode === code);
  if (!product) { showAlertModal(`لا يوجد منتج بهذا الباركود: ${code}`); return; }
  addToCart(product.id, product.name, product.price);
  input.focus();
}

async function searchPatientForSale() {
  const q = document.getElementById('s-patient-search').value.trim();
  if (q.length < 2) return;
  const rows = await API.get(`/api/patients?search=${encodeURIComponent(q)}`);
  let list = document.getElementById('s-patient-results');
  if (!list) {
    const anchor = document.getElementById('s-patient-search');
    anchor.parentElement.style.position = 'relative';
    list = document.createElement('div');
    list.id = 's-patient-results';
    list.style = 'position:absolute;top:100%;left:0;right:0;margin-top:4px;background:#fff;border:1px solid #ddd;border-radius:8px;z-index:50;max-height:180px;overflow:auto;box-shadow:0 4px 10px rgba(0,0,0,.1)';
    anchor.after(list);
  }
  list.innerHTML = rows.slice(0, 8).map(p => `<div style="padding:8px 12px;cursor:pointer" onmousedown='selectSalePatient(${p.id}, "${p.full_name.replace(/"/g,"")}")'>${p.full_name} - ${p.phone || ''}</div>`).join('') || '<div style="padding:8px;color:#999">لا نتائج</div>';
}

function selectSalePatient(id, name) {
  window.SELECTED_PATIENT = { id, name };
  document.getElementById('s-patient-selected').textContent = `✔ العميل: ${name}`;
  document.getElementById('s-patient-search').value = name;
  document.getElementById('s-patient-results')?.remove();
}

function openNewPatientFromSales() {
  openPatientModal(null, (newId, fullName) => {
    selectSalePatient(newId, fullName);
  });
}

function addToCart(productId, name, price) {
  const product = SALES_PRODUCTS_CACHE.find(p => p.id === productId);
  const existing = CART.find(c => c.product_id === productId);
  const currentQty = existing ? existing.qty : 0;
  if (product && (currentQty + 1) > product.stock_qty) {
    showAlertModal(`الكمية المطلوبة تتجاوز المتوفر بالمخزون (${product.stock_qty})`);
    return;
  }
  if (existing) existing.qty += 1;
  else CART.push({ product_id: productId, description: name, qty: 1, unit_price: price });
  renderCartTable();
}

async function addCustomItem() {
  const name = await showPromptModal('اسم الخدمة/المنتج المخصص:');
  if (!name) return;
  const priceStr = await showPromptModal('السعر:', '0', { money: true });
  const price = parseFloat(priceStr) || 0;
  CART.push({ product_id: null, description: name, qty: 1, unit_price: price });
  renderCartTable();
}

function updateCartQty(idx, qty) {
  const newQty = Math.max(0.01, parseFloat(qty) || 1);
  const item = CART[idx];
  if (item.product_id) {
    const product = SALES_PRODUCTS_CACHE.find(p => p.id === item.product_id);
    if (product && newQty > product.stock_qty) {
      showAlertModal(`الكمية المطلوبة (${newQty}) تتجاوز المتوفر بالمخزون (${product.stock_qty})`);
      renderCartTable();
      return;
    }
  }
  item.qty = newQty;
  renderCartTable();
}
function removeCartItem(idx) {
  CART.splice(idx, 1);
  renderCartTable();
}

function renderCartTable() {
  SALES_UNDERPAY_ACK = false; // أي تغيير بالسلة أو الخصم يلغي أي تأكيد سابق على الدفع الناقص
  const box = document.getElementById('cart-table');
  if (!CART.length) {
    box.innerHTML = '<div class="empty" style="padding:16px">أضف منتجات للفاتورة <br><button class="btn small secondary" style="margin-top:8px" onclick="addCustomItem()">+ إضافة عنصر مخصص</button></div>';
  } else {
    box.innerHTML = `
      <table>
        <thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th><th></th></tr></thead>
        <tbody>
          ${CART.map((c, idx) => `
            <tr>
              <td>${c.description}</td>
              <td><input type="number" value="${c.qty}" style="width:60px" onchange="updateCartQty(${idx}, this.value)"></td>
              <td>${c.unit_price.toFixed(2)}</td>
              <td>${(c.qty * c.unit_price).toFixed(2)}</td>
              <td><button class="btn small danger" onclick="removeCartItem(${idx})">×</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <button class="btn small secondary" style="margin-top:8px" onclick="addCustomItem()">+ عنصر مخصص</button>
    `;
  }
  const subtotal = CART.reduce((s, c) => s + c.qty * c.unit_price, 0);
  const discount = unformatNumber(document.getElementById('s-discount')?.value);
  const total = Math.max(0, subtotal - discount);
  const currency = SALES_SETTINGS_CACHE.invoice_currency || 'IQD';
  const rate = parseFloat(SALES_SETTINGS_CACHE.exchange_rate) || 1310;
  if (currency === 'USD') {
    document.getElementById('cart-total').textContent = `الإجمالي: ${(total / rate).toFixed(2)} $ (يعادل ${total.toLocaleString('ar')} د.ع)`;
  } else {
    document.getElementById('cart-total').textContent = `الإجمالي: ${total.toLocaleString('ar')} د.ع`;
  }
}

async function submitInvoice() {
  if (!CART.length) { showAlertModal('أضف عناصر للفاتورة أولاً'); return; }
  const subtotal = CART.reduce((s, c) => s + c.qty * c.unit_price, 0);
  const discount = unformatNumber(document.getElementById('s-discount').value);
  const total = Math.max(0, subtotal - discount);
  const paid = unformatNumber(document.getElementById('s-paid').value);

  if (paid < total && !SALES_UNDERPAY_ACK) {
    SALES_UNDERPAY_ACK = true;
    showAlertModal('⚠️ لا يمكن ذلك — المبلغ المدفوع أقل من إجمالي الفاتورة.\nإذا كان هذا مقصودًا (بيع بالدين)، اضغط "إتمام البيع" مرة أخرى للتأكيد.');
    return;
  }

  const payload = {
    patient_id: window.SELECTED_PATIENT ? window.SELECTED_PATIENT.id : null,
    employee_id: CURRENT_USER.id,
    items: CART,
    discount,
    paid_amount: paid,
    payment_method: document.getElementById('s-payment').value,
    currency: SALES_SETTINGS_CACHE.invoice_currency || 'IQD',
    exchange_rate: parseFloat(SALES_SETTINGS_CACHE.exchange_rate) || 1310,
    notes: document.getElementById('s-notes').value,
  };
  try {
    const result = await API.post('/api/invoices', payload);
    SALES_UNDERPAY_ACK = false;
    await promptPrintChoice(result.id);
    CART = [];
    window.SELECTED_PATIENT = null;
    renderSalesTab(document.getElementById('content'));
  } catch (err) {
    showAlertModal('تعذر حفظ الفاتورة: ' + err.message);
  }
}

async function reprintInvoice(id) { promptPrintChoice(id); }

async function collectPayment(invoiceId, total, paidAmount, refreshFn) {
  const remaining = total - paidAmount;
  const input = await showPromptModal(`المتبقي على هذه الفاتورة: ${remaining.toLocaleString('ar')} د.ع<br>أدخل المبلغ المُسدَّد الآن:`, remaining, { money: true });
  if (input === null) return;
  const amount = parseFloat(input);
  if (!amount || amount <= 0) { showAlertModal('الرجاء إدخال مبلغ صحيح أكبر من صفر'); return; }
  try {
    const res = await API.post(`/api/invoices/${invoiceId}/pay`, { amount, employee_id: CURRENT_USER.id });
    showAlertModal(`✅ تم تسجيل التسديد بنجاح.\nالحالة الآن: ${res.status}${res.remaining > 0 ? `\nالمتبقي: ${res.remaining.toLocaleString('ar')} د.ع` : ''}`);
    if (typeof refreshFn === 'function') refreshFn();
  } catch (err) {
    showAlertModal('تعذر تسجيل التسديد: ' + err.message);
  }
}

async function viewPaymentHistory(invoiceId, invoiceNumber, total) {
  const payments = await API.get(`/api/invoices/${invoiceId}/payments`);
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="width:480px">
      <h3>📜 سجل تسديدات الفاتورة ${invoiceNumber.replace('INV-','')}</h3>
      ${!payments.length ? '<div class="empty">لا توجد أي عملية تسديد مسجّلة على هذه الفاتورة بعد</div>' : `
        <table>
          <thead><tr><th>#</th><th>التاريخ والوقت</th><th>المبلغ</th><th>سجّلها</th></tr></thead>
          <tbody>
            ${payments.map((p, i) => `<tr><td>${i+1}</td><td>${p.payment_date}</td><td>${p.amount.toLocaleString('ar')} د.ع</td><td>${p.employee_name || '-'}</td></tr>`).join('')}
          </tbody>
        </table>
        <p style="margin-top:12px;font-size:14px"><b>إجمالي المسدَّد عبر كل الدفعات:</b> ${totalPaid.toLocaleString('ar')} د.ع من أصل ${total.toLocaleString('ar')} د.ع</p>
      `}
      <div class="modal-actions">
        <button class="btn secondary" onclick="this.closest('.modal-overlay').remove()">إغلاق</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

// ================== تعليق الفواتير (Hold/Park) ==================
function loadHeldInvoices() {
  try { return JSON.parse(localStorage.getItem('clinic_held_invoices') || '[]'); } catch (e) { return []; }
}
function saveHeldInvoicesList(list) {
  localStorage.setItem('clinic_held_invoices', JSON.stringify(list));
}

async function holdCurrentInvoice() {
  if (!CART.length) { showAlertModal('لا يوجد شيء بالسلة لتعليقه'); return; }
  const suggested = window.SELECTED_PATIENT ? window.SELECTED_PATIENT.name : '';
  const label = await showPromptModal('اسم أو ملاحظة لتمييز الفاتورة المعلّقة:', suggested);
  if (label === null) return;
  const held = loadHeldInvoices();
  held.push({
    id: Date.now(),
    label: label || 'فاتورة معلّقة',
    time: new Date().toLocaleTimeString('ar'),
    cart: CART,
    patient: window.SELECTED_PATIENT,
    discount: unformatNumber(document.getElementById('s-discount').value),
    payment: document.getElementById('s-payment').value,
    notes: document.getElementById('s-notes').value,
  });
  saveHeldInvoicesList(held);
  CART = [];
  window.SELECTED_PATIENT = null;
  renderSalesTab(document.getElementById('content'));
}

function renderHeldInvoicesBox() {
  const held = loadHeldInvoices();
  const box = document.getElementById('held-invoices-box');
  if (!box) return;
  if (!held.length) { box.innerHTML = ''; return; }
  box.innerHTML = `
    <div class="card" style="background:#fffbeb;border:1px solid #fde68a">
      <h2>⏸️ فواتير معلّقة (${held.length})</h2>
      ${held.map(h => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #fde68a">
          <div><b>${h.label}</b> <span class="hint">(${h.time} — ${h.cart.length} عنصر)</span></div>
          <div>
            <button class="btn small" onclick="resumeHeldInvoice(${h.id})">▶️ استئناف</button>
            <button class="btn small danger" onclick="deleteHeldInvoice(${h.id})">حذف</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

async function resumeHeldInvoice(id) {
  const held = loadHeldInvoices();
  const item = held.find(h => h.id === id);
  if (!item) return;
  if (CART.length && !(await showConfirmModal('يوجد عناصر بالفاتورة الحالية، سيتم استبدالها بالفاتورة المعلّقة. متابعة؟'))) return;
  saveHeldInvoicesList(held.filter(h => h.id !== id));
  renderSalesTab(document.getElementById('content'), item);
}

async function deleteHeldInvoice(id) {
  if (!(await showConfirmModal('حذف هذه الفاتورة المعلّقة نهائيًا؟'))) return;
  saveHeldInvoicesList(loadHeldInvoices().filter(h => h.id !== id));
  renderHeldInvoicesBox();
}

// ================== نافذة اختيار طريقة الطباعة ==================
async function promptPrintChoice(invoiceId) {
  const invoice = await API.get(`/api/invoices/${invoiceId}`);
  const settings = await API.get('/api/settings');
  const showRegular = settings.print_regular_enabled !== '0';
  const showThermal80 = settings.print_thermal80_enabled !== '0';
  const showThermal58 = settings.print_thermal58_enabled === '1';

  const defaultMethod = settings.default_print_method || 'ask';
  if (defaultMethod === 'regular' && showRegular) { printInvoiceRegular(invoice); return; }
  if (defaultMethod === 'thermal80' && showThermal80) { printInvoiceThermal(invoice, 80); return; }
  if (defaultMethod === 'thermal58' && showThermal58) { printInvoiceThermal(invoice, 58); return; }

  window.__PRINT_CHOICE_INVOICE = invoice;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="width:380px;text-align:center">
      <h3>✅ تم حفظ الفاتورة رقم ${invoice.invoice_number.replace('INV-', '')}</h3>
      <p style="color:#555;margin-bottom:16px">اختر طريقة الطباعة</p>
      ${showRegular ? `<button class="btn" style="width:100%;margin-bottom:8px" onclick="printInvoiceRegular(window.__PRINT_CHOICE_INVOICE)">🖨️ طباعة عادية (معاينة قبل الطباعة)</button>` : ''}
      ${showThermal80 ? `<button class="btn secondary" style="width:100%;margin-bottom:8px" onclick="printInvoiceThermal(window.__PRINT_CHOICE_INVOICE, 80)">🧾 طابعة حرارية 80مم</button>` : ''}
      ${showThermal58 ? `<button class="btn secondary" style="width:100%;margin-bottom:8px" onclick="printInvoiceThermal(window.__PRINT_CHOICE_INVOICE, 58)">🧾 طابعة حرارية 58مم</button>` : ''}
      ${(!showRegular && !showThermal80 && !showThermal58) ? `<p class="hint">لا توجد طريقة طباعة مفعّلة حاليًا — فعّلها من تبويب الإعدادات.</p>` : ''}
      <button class="btn secondary" style="width:100%" onclick="this.closest('.modal-overlay').remove()">تخطي</button>
    </div>
  `;
  document.body.appendChild(overlay);
}

async function printInvoiceRegular(invoice) {
  const settings = await API.get('/api/settings');
  const html = buildInvoiceHtml(invoice, settings);
  window.desktop.printPreview({ htmlContent: html, title: 'معاينة الفاتورة' });
}

async function printInvoiceThermal(invoice, width) {
  const settings = await API.get('/api/settings');
  const interfaceType = settings.printer_interface || 'usb';
  const address = settings.printer_address || '';

  if (settings.thermal_print_mode === 'text') {
    const codePage = parseInt(settings.thermal_code_page) || 37;
    const res = await window.desktop.printThermalText({
      invoice, clinic: settings, interfaceType, address, codePage, width
    });
    if (!res.ok) showAlertModal('تعذر الطباعة الحرارية:\n' + res.error);
    return;
  }

  const receiptHtml = buildThermalReceiptHtml(invoice, settings, width);
  const res = await window.desktop.printThermalImage({ receiptHtml, width, interfaceType, address });
  if (!res.ok) showAlertModal('تعذر الطباعة الحرارية:\n' + res.error);
}
