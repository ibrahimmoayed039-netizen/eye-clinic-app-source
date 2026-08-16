const SPECIAL_ORDER_STATUS_BADGE = {
  'قيد الانتظار': 'pending',
  'تم الطلب من المورد': 'ordered',
  'وصلت - جاهزة للاستلام': 'arrived',
  'تم التسليم': 'delivered',
  'ملغاة': 'cancelled',
};
let SO_SELECTED_PATIENT = null;

async function renderSpecialOrdersTab(container) {
  container.innerHTML = `
    <div class="card">
      <div class="toolbar" style="justify-content:space-between">
        <div class="toolbar" style="gap:8px;margin:0">
          <input id="so-search" placeholder="بحث باسم الزبون أو وصف القطعة..." style="width:220px" oninput="loadSpecialOrders()">
          <select id="so-status-filter" onchange="loadSpecialOrders()">
            <option value="">كل الحالات</option>
            <option value="قيد الانتظار">قيد الانتظار</option>
            <option value="تم الطلب من المورد">تم الطلب من المورد</option>
            <option value="وصلت - جاهزة للاستلام">وصلت - جاهزة للاستلام</option>
            <option value="تم التسليم">تم التسليم</option>
            <option value="ملغاة">ملغاة</option>
          </select>
        </div>
        <button class="btn" onclick="openNewSpecialOrderModal()">+ طلب خاص جديد</button>
      </div>
      <div id="so-stats" class="stat-cards"></div>
      <div id="special-orders-table"></div>
    </div>
  `;
  loadSpecialOrders();
}

async function loadSpecialOrders() {
  const statusFilter = document.getElementById('so-status-filter')?.value || '';
  const rows = await API.get(`/api/special-orders${statusFilter ? '?status=' + encodeURIComponent(statusFilter) : ''}`);
  const search = (document.getElementById('so-search')?.value || '').toLowerCase();
  const filtered = search
    ? rows.filter(o => o.customer_name.toLowerCase().includes(search) || o.item_description.toLowerCase().includes(search))
    : rows;

  const readyCount = rows.filter(o => o.status === 'وصلت - جاهزة للاستلام').length;
  document.getElementById('so-stats').innerHTML = `
    <div class="stat-card"><div class="num">${rows.length}</div><div class="label">إجمالي الطلبات</div></div>
    <div class="stat-card" style="${readyCount ? 'background:#ccfbf1' : ''}"><div class="num">${readyCount}</div><div class="label">🔔 جاهزة للاستلام</div></div>
    <div class="stat-card"><div class="num">${rows.filter(o => o.status === 'تم التسليم').length}</div><div class="label">تم تسليمها</div></div>
  `;

  const box = document.getElementById('special-orders-table');
  if (!filtered.length) { box.innerHTML = '<div class="empty">لا توجد طلبات خاصة بعد</div>'; return; }
  box.innerHTML = `
    <table>
      <thead><tr><th>الرقم</th><th>الزبون</th><th>القطعة المطلوبة</th><th>المورد</th><th>السعر المتوقع</th><th>العربون</th><th>الحالة</th><th>إجراءات</th></tr></thead>
      <tbody>
        ${filtered.map(o => `
          <tr>
            <td>${o.order_number.replace('SO-', '')}</td>
            <td>${o.customer_name}${o.customer_phone ? `<br><span class="hint">${o.customer_phone}</span>` : ''}</td>
            <td>${o.item_description}</td>
            <td>${o.supplier_name || '-'}</td>
            <td>${o.expected_price.toLocaleString('ar')} د.ع</td>
            <td>${o.deposit_amount.toLocaleString('ar')} د.ع</td>
            <td><span class="badge ${SPECIAL_ORDER_STATUS_BADGE[o.status] || ''}">${o.status}</span></td>
            <td>${specialOrderActionButtons(o)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function specialOrderActionButtons(o) {
  let buttons = '';
  if (o.status === 'قيد الانتظار') {
    buttons += `<button class="btn small secondary" onclick="advanceSpecialOrderStatus(${o.id}, 'تم الطلب من المورد')">📦 تم الطلب من المورد</button>`;
  }
  if (o.status === 'تم الطلب من المورد') {
    buttons += `<button class="btn small secondary" onclick="advanceSpecialOrderStatus(${o.id}, 'وصلت - جاهزة للاستلام')">✅ وصلت</button>`;
  }
  if (o.status === 'وصلت - جاهزة للاستلام') {
    buttons += `<button class="btn small" onclick="openDeliverSpecialOrderModal(${o.id})">🏁 تسليم للزبون</button>`;
  }
  if (o.status === 'تم التسليم' && o.invoice_id) {
    buttons += `<button class="btn small secondary" onclick="promptPrintChoice(${o.invoice_id})">🖨️ الفاتورة</button>`;
  }
  if (o.status !== 'تم التسليم' && o.status !== 'ملغاة') {
    buttons += `<button class="btn small danger" onclick="advanceSpecialOrderStatus(${o.id}, 'ملغاة')">إلغاء</button>`;
  }
  buttons += `<button class="btn small secondary" onclick="printSpecialOrderReceipt(${o.id})">🧾</button>`;
  if (o.status !== 'تم التسليم') {
    buttons += `<button class="btn small danger" onclick="deleteSpecialOrder(${o.id})">حذف</button>`;
  }
  return buttons;
}

async function advanceSpecialOrderStatus(id, status) {
  const confirmMsg = status === 'ملغاة' ? 'هل تريد إلغاء هذا الطلب؟' : null;
  if (confirmMsg && !confirm(confirmMsg)) return;
  try {
    await API.post(`/api/special-orders/${id}/status`, { status });
    loadSpecialOrders();
  } catch (err) {
    alert('تعذر تحديث حالة الطلب: ' + err.message);
  }
}

async function deleteSpecialOrder(id) {
  if (!confirm('حذف هذا الطلب الخاص نهائيًا؟')) return;
  try {
    await API.del(`/api/special-orders/${id}`);
    loadSpecialOrders();
  } catch (err) {
    alert('تعذر حذف الطلب: ' + err.message);
  }
}

async function printSpecialOrderReceipt(id) {
  const [order, settings] = await Promise.all([API.get(`/api/special-orders/${id}`), API.get('/api/settings')]);
  const html = buildSpecialOrderReceiptHtml(order, settings);
  window.desktop.printPreview({ htmlContent: html, title: 'إيصال طلب خاص' });
}

// ================== طلب خاص جديد ==================
function openNewSpecialOrderModal() {
  SO_SELECTED_PATIENT = null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="width:520px">
      <h3>+ طلب خاص جديد</h3>
      <div class="form-group"><label>اسم الزبون *</label>
        <div style="display:flex;gap:8px">
          <input id="so-customer-search" placeholder="ابحث عن مريض موجود أو اكتب اسمًا جديدًا..." style="flex:1" oninput="searchPatientForSpecialOrder()">
        </div>
        <div id="so-patient-selected" style="font-size:12px;color:#0f766e;margin-top:5px"></div>
      </div>
      <div class="form-group"><label>رقم الهاتف</label><input id="so-customer-phone" placeholder="07xxxxxxxxx"></div>
      <div class="form-group"><label>وصف القطعة المطلوبة *</label><textarea id="so-item-desc" rows="2" placeholder="مثال: إطار Ray-Ban موديل RB2140 لون أسود لامع، مقاس 52"></textarea></div>
      <div class="grid-2">
        <div class="form-group"><label>المورد المتوقع</label>
          <select id="so-supplier">
            <option value="">-- غير محدد --</option>
          </select>
        </div>
        <div class="form-group"><label>السعر المتوقع للزبون (د.ع)</label><input id="so-expected-price" type="number" value="0"></div>
      </div>
      <div class="form-group"><label>العربون المدفوع الآن (د.ع)</label><input id="so-deposit" type="number" value="0"></div>
      <div class="form-group"><label>ملاحظات</label><input id="so-notes" placeholder="أي تفاصيل إضافية..."></div>
      <div class="modal-actions">
        <button class="btn secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
        <button class="btn" onclick="submitNewSpecialOrder()">✅ حفظ وطباعة الإيصال</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  API.get('/api/suppliers').then(suppliers => {
    const sel = document.getElementById('so-supplier');
    if (sel) sel.innerHTML += suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  });
}

async function searchPatientForSpecialOrder() {
  const q = document.getElementById('so-customer-search').value.trim();
  SO_SELECTED_PATIENT = null;
  document.getElementById('so-patient-selected').textContent = '';
  if (q.length < 2) { document.getElementById('so-results')?.remove(); return; }
  const rows = await API.get(`/api/patients?search=${encodeURIComponent(q)}`);
  let list = document.getElementById('so-results');
  if (!list) {
    list = document.createElement('div');
    list.id = 'so-results';
    list.style = 'position:absolute;background:#fff;border:1px solid #ddd;border-radius:8px;z-index:50;max-height:160px;overflow:auto;box-shadow:0 4px 10px rgba(0,0,0,.1)';
    document.getElementById('so-customer-search').after(list);
  }
  list.innerHTML = rows.slice(0, 8).map(p => `<div style="padding:8px 12px;cursor:pointer" onmousedown='selectSpecialOrderPatient(${p.id}, "${p.full_name.replace(/"/g, '')}", "${(p.phone || '').replace(/"/g, '')}")'>${p.full_name} - ${p.phone || ''}</div>`).join('') || '<div style="padding:8px;color:#999">لا نتائج — سيُسجَّل كزبون جديد بهذا الاسم</div>';
}

function selectSpecialOrderPatient(id, name, phone) {
  SO_SELECTED_PATIENT = { id, name };
  document.getElementById('so-customer-search').value = name;
  document.getElementById('so-patient-selected').textContent = `✔ مرتبط بسجل المريض: ${name}`;
  if (phone) document.getElementById('so-customer-phone').value = phone;
  document.getElementById('so-results')?.remove();
}

async function submitNewSpecialOrder() {
  const customerName = document.getElementById('so-customer-search').value.trim();
  const itemDesc = document.getElementById('so-item-desc').value.trim();
  if (!customerName) { alert('الرجاء إدخال اسم الزبون'); return; }
  if (!itemDesc) { alert('الرجاء إدخال وصف القطعة المطلوبة'); return; }
  const payload = {
    patient_id: SO_SELECTED_PATIENT ? SO_SELECTED_PATIENT.id : null,
    customer_name: customerName,
    customer_phone: document.getElementById('so-customer-phone').value.trim(),
    item_description: itemDesc,
    supplier_id: document.getElementById('so-supplier').value || null,
    expected_price: parseFloat(document.getElementById('so-expected-price').value) || 0,
    deposit_amount: parseFloat(document.getElementById('so-deposit').value) || 0,
    notes: document.getElementById('so-notes').value.trim(),
    employee_id: CURRENT_USER.id,
  };
  try {
    const result = await API.post('/api/special-orders', payload);
    document.querySelector('.modal-overlay')?.remove();
    await printSpecialOrderReceipt(result.id);
    loadSpecialOrders();
  } catch (err) {
    alert('تعذر حفظ الطلب: ' + err.message);
  }
}

// ================== تسليم الطلب وتحويله لفاتورة ==================
async function openDeliverSpecialOrderModal(id) {
  const order = await API.get(`/api/special-orders/${id}`);
  const products = await API.get('/api/products');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="width:520px">
      <h3>🏁 تسليم الطلب رقم ${order.order_number.replace('SO-', '')}</h3>
      <p class="hint">${order.item_description} — الزبون: ${order.customer_name}</p>
      <p style="margin:8px 0"><b>العربون المدفوع مسبقًا:</b> ${order.deposit_amount.toLocaleString('ar')} د.ع (سيُحسب تلقائيًا ضمن فاتورة البيع)</p>
      <div class="form-group"><label>ربط بمنتج من المخزون (اختياري — يخصم الكمية تلقائيًا)</label>
        <select id="do-product">
          <option value="">-- بدون ربط بالمخزون --</option>
          ${products.map(p => `<option value="${p.id}" data-price="${p.price}">${p.name} (المخزون: ${p.stock_qty})</option>`).join('')}
        </select>
      </div>
      <div class="grid-2">
        <div class="form-group"><label>الكمية</label><input id="do-qty" type="number" value="1"></div>
        <div class="form-group"><label>سعر البيع النهائي للوحدة (د.ع)</label><input id="do-price" type="number" value="${order.expected_price}"></div>
      </div>
      <div class="grid-2">
        <div class="form-group"><label>الخصم (د.ع)</label><input id="do-discount" type="number" value="0"></div>
        <div class="form-group"><label>طريقة الدفع</label>
          <select id="do-payment">
            <option>نقدي</option>
            <option>بطاقة</option>
            <option>تحويل بنكي</option>
          </select>
        </div>
      </div>
      <div class="form-group"><label>مبلغ إضافي يُدفع الآن (بخلاف العربون)</label><input id="do-paid" type="number" value="0"></div>
      <div class="modal-actions">
        <button class="btn secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
        <button class="btn" onclick="submitDeliverSpecialOrder(${id})">✅ تسليم وإصدار فاتورة</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('do-product').addEventListener('change', function () {
    const opt = this.selectedOptions[0];
    const price = opt ? opt.dataset.price : null;
    if (price) document.getElementById('do-price').value = price;
  });
}

async function submitDeliverSpecialOrder(id) {
  const payload = {
    product_id: document.getElementById('do-product').value || null,
    qty: parseFloat(document.getElementById('do-qty').value) || 1,
    unit_price: parseFloat(document.getElementById('do-price').value),
    discount: parseFloat(document.getElementById('do-discount').value) || 0,
    payment_method: document.getElementById('do-payment').value,
    paid_amount: parseFloat(document.getElementById('do-paid').value) || 0,
    employee_id: CURRENT_USER.id,
  };
  if (isNaN(payload.unit_price) || payload.unit_price < 0) { alert('الرجاء إدخال سعر بيع صحيح'); return; }
  try {
    const result = await API.post(`/api/special-orders/${id}/deliver`, payload);
    document.querySelector('.modal-overlay')?.remove();
    alert(`✅ تم تسليم الطلب وإصدار فاتورة رقم ${result.invoice_number.replace('INV-', '')} بنجاح`);
    await promptPrintChoice(result.invoice_id);
    loadSpecialOrders();
  } catch (err) {
    alert('تعذر تسليم الطلب: ' + err.message);
  }
}
