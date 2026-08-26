async function renderCashboxTab(container) {
  const [openBoxes, employees] = await Promise.all([
    API.get('/api/cashboxes?status=مفتوح'),
    API.get('/api/employees')
  ]);
  container.innerHTML = `
    <div class="card">
      <h2>💰 الصناديق المفتوحة حاليًا</h2>
      <div id="open-boxes-list"></div>
      <div class="toolbar" style="margin-top:14px">
        <select id="cb-employee">
          <option value="">-- اختر الموظف لفتح صندوق جديد --</option>
          ${employees.map(e => `<option value="${e.id}">${e.full_name}</option>`).join('')}
        </select>
        <input id="cb-opening" type="number" placeholder="الرصيد الافتتاحي" value="0" style="width:160px">
        <button class="btn" onclick="openNewCashbox()">+ فتح صندوق جديد</button>
      </div>
    </div>

    <div class="card">
      <h2>🧾 صندوق المصاريف</h2>
      <div class="toolbar">
        <input type="date" id="exp-from" onchange="loadExpenses()">
        <input type="date" id="exp-to" onchange="loadExpenses()">
        <button class="btn" onclick="openAddExpenseModal()">+ تسجيل مصروف</button>
      </div>
      <div class="stat-cards" id="exp-stats"></div>
      <div id="expenses-table"></div>
    </div>

    <div class="card">
      <h2>📜 سجل الصناديق المغلقة سابقًا</h2>
      <div id="closed-boxes-list"></div>
    </div>
  `;
  renderOpenBoxes(openBoxes);
  loadExpenses();
  loadClosedBoxes();
}

function renderOpenBoxes(boxes) {
  const box = document.getElementById('open-boxes-list');
  if (!boxes.length) { box.innerHTML = '<div class="empty">لا توجد صناديق مفتوحة حاليًا</div>'; return; }
  box.innerHTML = `
    <div class="grid-2">
      ${boxes.map(b => `
        <div class="card" style="background:#f0fdfa;border:1px solid #99f6e4">
          <h3 style="font-size:14px;margin-bottom:8px">👤 ${b.employee_name}</h3>
          <p class="hint">فُتح: ${(b.opening_date||'').split(' ')[0]} | افتتاحي: ${b.opening_balance.toLocaleString('ar')} د.ع</p>
          <div style="display:flex;gap:6px;margin-top:8px">
            <button class="btn small" onclick="viewCashboxDetails(${b.id})">📊 التفاصيل</button>
            <button class="btn small secondary" onclick="addCashMovement(${b.id}, 'deposit')">+ إيداع</button>
            <button class="btn small secondary" onclick="addCashMovement(${b.id}, 'withdraw')">- سحب</button>
            <button class="btn small danger" onclick="closeCashbox(${b.id})">🔒 إغلاق</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

async function loadClosedBoxes() {
  const rows = await API.get('/api/cashboxes?status=مغلق');
  const box = document.getElementById('closed-boxes-list');
  if (!rows.length) { box.innerHTML = '<div class="empty">لا يوجد سجل بعد</div>'; return; }
  box.innerHTML = `
    <table>
      <thead><tr><th>الموظف</th><th>الفتح</th><th>الإغلاق</th><th>الافتتاحي</th><th>الفعلي عند الإغلاق</th><th></th></tr></thead>
      <tbody>
        ${rows.slice(0, 20).map(b => `
          <tr>
            <td>${b.employee_name}</td>
            <td>${(b.opening_date||'').split(' ')[0]}</td>
            <td>${(b.closing_date||'').split(' ')[0]}</td>
            <td>${b.opening_balance.toLocaleString('ar')} د.ع</td>
            <td>${(b.closing_balance||0).toLocaleString('ar')} د.ع</td>
            <td><button class="btn small" onclick="viewCashboxDetails(${b.id})">📊 التفاصيل</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function openNewCashbox() {
  const employee_id = document.getElementById('cb-employee').value;
  const opening_balance = parseFloat(document.getElementById('cb-opening').value) || 0;
  if (!employee_id) { showAlertModal('الرجاء اختيار الموظف'); return; }
  try {
    await API.post('/api/cashboxes', { employee_id, opening_balance });
    renderCashboxTab(document.getElementById('content'));
  } catch (err) {
    showAlertModal('تعذر فتح الصندوق: ' + err.message);
  }
}

async function addCashMovement(boxId, type) {
  const label = type === 'deposit' ? 'مبلغ الإيداع' : 'مبلغ السحب';
  const amountStr = await showPromptModal(`${label}:`, '0');
  if (amountStr === null) return;
  const amount = parseFloat(amountStr);
  if (!amount || amount <= 0) { showAlertModal('الرجاء إدخال مبلغ صحيح أكبر من صفر'); return; }
  const reason = await showPromptModal('السبب (اختياري):', '');
  try {
    await API.post(`/api/cashboxes/${boxId}/movements`, { type, amount, reason: reason || '' });
    renderCashboxTab(document.getElementById('content'));
  } catch (err) {
    showAlertModal('تعذر تسجيل الحركة: ' + err.message);
  }
}

async function viewCashboxDetails(boxId) {
  const box = await API.get(`/api/cashboxes/${boxId}`);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="width:560px">
      <h3>📊 تفاصيل صندوق: ${box.employee_name}</h3>
      <div class="stat-cards">
        <div class="stat-card"><div class="num">${box.opening_balance.toLocaleString('ar')}</div><div class="label">الرصيد الافتتاحي</div></div>
        <div class="stat-card"><div class="num">${box.cash_sales.toLocaleString('ar')}</div><div class="label">مبيعات نقدية</div></div>
        <div class="stat-card"><div class="num">${box.expected_balance.toLocaleString('ar')}</div><div class="label">المتوقع بالصندوق الآن</div></div>
      </div>
      ${box.status==='مغلق' ? `<p style="margin-bottom:10px">الفعلي عند الإغلاق: <b>${(box.closing_balance||0).toLocaleString('ar')} د.ع</b> ${box.closing_balance !== box.expected_balance ? `<span style="color:#dc2626">(فرق: ${(box.closing_balance-box.expected_balance).toLocaleString('ar')} د.ع)</span>` : '<span style="color:#166534">(مطابق تمامًا ✓)</span>'}</p>` : ''}
      <h4 style="font-size:13px;margin:10px 0">الحركات اليدوية (إيداع/سحب)</h4>
      <table>
        <thead><tr><th>النوع</th><th>المبلغ</th><th>السبب</th><th>التاريخ</th></tr></thead>
        <tbody>
          ${box.movements.length ? box.movements.map(m => `<tr><td>${m.type==='deposit'?'⬆️ إيداع':'⬇️ سحب'}</td><td>${m.amount.toLocaleString('ar')}</td><td>${m.reason||'-'}</td><td>${(m.movement_date||'').split(' ')[0]}</td></tr>`).join('') : '<tr><td colspan="4" class="empty">لا توجد حركات</td></tr>'}
        </tbody>
      </table>
      <h4 style="font-size:13px;margin:10px 0">المصاريف المرتبطة بهذا الصندوق</h4>
      <table>
        <thead><tr><th>الوصف</th><th>المبلغ</th></tr></thead>
        <tbody>
          ${box.expenses.length ? box.expenses.map(e => `<tr><td>${e.description}</td><td>${e.amount.toLocaleString('ar')}</td></tr>`).join('') : '<tr><td colspan="2" class="empty">لا توجد مصاريف</td></tr>'}
        </tbody>
      </table>
      <div class="modal-actions">
        <button class="btn secondary" onclick="this.closest('.modal-overlay').remove()">إغلاق</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

async function closeCashbox(boxId) {
  const box = await API.get(`/api/cashboxes/${boxId}`);
  const input = await showPromptModal(`المبلغ المتوقع بالصندوق: ${box.expected_balance.toLocaleString('ar')} د.ع<br>أدخل المبلغ الفعلي بعد العد اليدوي:`, box.expected_balance);
  if (input === null) return;
  const closing_balance = parseFloat(input);
  if (isNaN(closing_balance)) { showAlertModal('الرجاء إدخال رقم صحيح'); return; }
  try {
    await API.post(`/api/cashboxes/${boxId}/close`, { closing_balance });
    renderCashboxTab(document.getElementById('content'));
  } catch (err) {
    showAlertModal('تعذر إغلاق الصندوق: ' + err.message);
  }
}

// ================== المصاريف ==================
async function loadExpenses() {
  const from = document.getElementById('exp-from')?.value || '';
  const to = document.getElementById('exp-to')?.value || '';
  const rows = await API.get(`/api/expenses?from=${from}&to=${to}`);
  const total = rows.reduce((s, e) => s + e.amount, 0);
  document.getElementById('exp-stats').innerHTML = `
    <div class="stat-card"><div class="num">${rows.length}</div><div class="label">عدد المصاريف</div></div>
    <div class="stat-card"><div class="num">${total.toLocaleString('ar')} د.ع</div><div class="label">إجمالي المصاريف</div></div>
    <div class="stat-card"><div class="num">-</div><div class="label"></div></div>
  `;
  const box = document.getElementById('expenses-table');
  box.innerHTML = !rows.length ? '<div class="empty">لا توجد مصاريف مسجّلة</div>' : `
    <table>
      <thead><tr><th>التاريخ</th><th>الوصف</th><th>الفئة</th><th>المبلغ</th><th>سجّلها</th><th></th></tr></thead>
      <tbody>
        ${rows.map(e => `
          <tr>
            <td>${(e.expense_date||'').split(' ')[0]}</td>
            <td>${e.description}</td>
            <td>${e.category || '-'}</td>
            <td>${e.amount.toLocaleString('ar')} د.ع</td>
            <td>${e.employee_name || '-'}</td>
            <td><button class="btn small danger" onclick="deleteExpense(${e.id})">حذف</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function openAddExpenseModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>+ تسجيل مصروف جديد</h3>
      <div class="grid-2">
        <div class="form-group"><label>الوصف</label><input id="ex-desc" placeholder="مثال: فاتورة كهرباء"></div>
        <div class="form-group"><label>المبلغ (د.ع)</label><input id="ex-amount" type="number"></div>
        <div class="form-group"><label>الفئة</label>
          <select id="ex-category">
            <option>إيجار</option><option>كهرباء وماء</option><option>رواتب</option>
            <option>صيانة</option><option>مشتريات</option><option>أخرى</option>
          </select>
        </div>
      </div>
      <div class="form-group"><label>ملاحظات</label><textarea id="ex-notes" rows="2"></textarea></div>
      <div class="modal-actions">
        <button class="btn secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
        <button class="btn" onclick="saveExpense()">حفظ</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

async function saveExpense() {
  const data = {
    description: document.getElementById('ex-desc').value.trim(),
    amount: parseFloat(document.getElementById('ex-amount').value) || 0,
    category: document.getElementById('ex-category').value,
    notes: document.getElementById('ex-notes').value.trim(),
    employee_id: CURRENT_USER.id,
  };
  if (!data.description) { showAlertModal('الرجاء إدخال وصف المصروف'); return; }
  if (data.amount <= 0) { showAlertModal('الرجاء إدخال مبلغ صحيح'); return; }
  try {
    await API.post('/api/expenses', data);
    closeTopModal();
    loadExpenses();
  } catch (err) {
    showAlertModal('تعذر حفظ المصروف: ' + err.message);
  }
}

async function deleteExpense(id) {
  if (!(await showConfirmModal('حذف هذا المصروف؟'))) return;
  await API.del(`/api/expenses/${id}`);
  loadExpenses();
}
