let ALL_SUPPLIERS_CACHE = [];

async function renderSuppliersTab(container) {
  container.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <input id="sup-search" placeholder="بحث بالاسم أو الجوال..." style="width:240px" oninput="loadSuppliers()">
        <button class="btn" onclick="openSupplierModal()">+ إضافة مورد</button>
      </div>
      <div id="suppliers-table"></div>
    </div>
  `;
  loadSuppliers();
}

async function loadSuppliers() {
  const rows = await API.get('/api/suppliers');
  ALL_SUPPLIERS_CACHE = rows;
  const search = (document.getElementById('sup-search')?.value || '').toLowerCase();
  const filtered = search ? rows.filter(s => s.name.toLowerCase().includes(search) || (s.phone||'').includes(search)) : rows;
  const box = document.getElementById('suppliers-table');
  if (!filtered.length) { box.innerHTML = '<div class="empty">لا يوجد موردون بعد</div>'; return; }
  box.innerHTML = `
    <table>
      <thead><tr><th>#</th><th>الاسم</th><th>الجوال</th><th>العنوان</th><th>الرصيد (مستحق له)</th><th>إجراءات</th></tr></thead>
      <tbody>
        ${filtered.map(s => `
          <tr>
            <td>${s.id}</td>
            <td>${s.name}</td>
            <td>${s.phone || '-'}</td>
            <td>${s.address || '-'}</td>
            <td>${s.balance > 0 ? `<span style="color:#dc2626;font-weight:600">${s.balance.toLocaleString('ar')} د.ع</span>` : '<span style="color:#166534">0 د.ع</span>'}</td>
            <td>
              <button class="btn small" onclick="openSupplierLedger(${s.id})">💳 كشف حساب</button>
              <button class="btn small secondary" onclick="openSupplierModal(${s.id})">تعديل</button>
              <button class="btn small danger" onclick="deleteSupplier(${s.id})">حذف</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function deleteSupplier(id) {
  if (!confirm('حذف هذا المورد وكل سجل معاملاته؟')) return;
  await API.del(`/api/suppliers/${id}`);
  loadSuppliers();
}

async function openSupplierModal(id) {
  let s = { name: '', phone: '', address: '', notes: '' };
  if (id) s = ALL_SUPPLIERS_CACHE.find(x => x.id === id) || s;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>${id ? 'تعديل مورد' : 'إضافة مورد جديد'}</h3>
      <div class="grid-2">
        <div class="form-group"><label>اسم المورد</label><input id="sup-name" value="${s.name}"></div>
        <div class="form-group"><label>رقم الجوال</label><input id="sup-phone" value="${s.phone || ''}"></div>
      </div>
      <div class="form-group"><label>العنوان</label><input id="sup-address" value="${s.address || ''}"></div>
      <div class="form-group"><label>ملاحظات</label><textarea id="sup-notes" rows="2">${s.notes || ''}</textarea></div>
      <div class="modal-actions">
        <button class="btn secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
        <button class="btn" onclick="saveSupplier(${id || 'null'})">حفظ</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

async function saveSupplier(id) {
  const data = {
    name: document.getElementById('sup-name').value.trim(),
    phone: document.getElementById('sup-phone').value.trim(),
    address: document.getElementById('sup-address').value.trim(),
    notes: document.getElementById('sup-notes').value.trim(),
  };
  if (!data.name) { alert('الرجاء إدخال اسم المورد'); return; }
  try {
    if (id) await API.put(`/api/suppliers/${id}`, data);
    else await API.post('/api/suppliers', data);
    document.querySelector('.modal-overlay').remove();
    loadSuppliers();
  } catch (err) {
    alert('تعذر حفظ بيانات المورد: ' + err.message);
  }
}

async function openSupplierLedger(id) {
  const supplier = ALL_SUPPLIERS_CACHE.find(s => s.id === id);
  const transactions = await API.get(`/api/suppliers/${id}/transactions`);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="width:600px">
      <h3>💳 كشف حساب: ${supplier.name}</h3>
      <p style="margin-bottom:10px">الرصيد الحالي (مستحق له): <b style="color:${supplier.balance>0?'#dc2626':'#166534'}">${supplier.balance.toLocaleString('ar')} د.ع</b></p>
      <div class="grid-2" style="margin-bottom:10px">
        <button class="btn" onclick="addSupplierTransaction(${id}, 'purchase')">+ فاتورة شراء (زيادة الدين)</button>
        <button class="btn secondary" onclick="addSupplierTransaction(${id}, 'payment')">+ تسديد للمورد</button>
      </div>
      <div class="grid-3" style="margin-bottom:10px">
        <div class="form-group"><label>من تاريخ</label><input type="date" id="sup-stmt-from"></div>
        <div class="form-group"><label>إلى تاريخ</label><input type="date" id="sup-stmt-to"></div>
        <div class="form-group"><label>&nbsp;</label><button class="btn secondary" style="width:100%" onclick="printSupplierStatement(${id}, '${supplier.name.replace(/'/g,"")}')">🖨️ طباعة كشف الحساب للفترة</button></div>
      </div>
      <table>
        <thead><tr><th>التاريخ</th><th>النوع</th><th>المبلغ</th><th>الوصف</th></tr></thead>
        <tbody>
          ${transactions.length ? transactions.map(t => `
            <tr>
              <td>${(t.transaction_date||'').split(' ')[0]}</td>
              <td>${t.type === 'purchase' ? '🛒 شراء' : '💰 تسديد'}</td>
              <td>${t.amount.toLocaleString('ar')} د.ع</td>
              <td>${t.description || '-'}</td>
            </tr>
          `).join('') : '<tr><td colspan="4" class="empty">لا توجد معاملات بعد</td></tr>'}
        </tbody>
      </table>
      <div class="modal-actions">
        <button class="btn secondary" onclick="this.closest('.modal-overlay').remove()">إغلاق</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

async function printSupplierStatement(id, name) {
  const from = document.getElementById('sup-stmt-from').value;
  const to = document.getElementById('sup-stmt-to').value;
  const [statement, settings] = await Promise.all([
    API.get(`/api/suppliers/${id}/statement?from=${from}&to=${to}`),
    API.get('/api/settings')
  ]);
  const html = buildStatementHtml(name, statement, settings);
  window.desktop.printPreview({ htmlContent: html, title: 'كشف حساب مورد' });
}

async function addSupplierTransaction(supplierId, type) {
  const label = type === 'purchase' ? 'مبلغ فاتورة الشراء' : 'مبلغ التسديد';
  const amountStr = await showPromptModal(`${label}:`, '0');
  if (amountStr === null) return;
  const amount = parseFloat(amountStr);
  if (!amount || amount <= 0) { alert('الرجاء إدخال مبلغ صحيح أكبر من صفر'); return; }
  const description = await showPromptModal('وصف مختصر (اختياري):', '');
  try {
    await API.post(`/api/suppliers/${supplierId}/transactions`, {
      type, amount, description: description || '', employee_id: CURRENT_USER.id
    });
    document.querySelector('.modal-overlay').remove();
    await loadSuppliers();
    openSupplierLedger(supplierId);
  } catch (err) {
    alert('تعذر تسجيل العملية: ' + err.message);
  }
}
