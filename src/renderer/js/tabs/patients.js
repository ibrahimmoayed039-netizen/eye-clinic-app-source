async function renderPatientsTab(container) {
  container.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <input id="p-search" placeholder="بحث بالاسم أو الجوال..." style="width:260px" oninput="loadPatients()">
        <button class="btn" onclick="openPatientModal()">+ إضافة مريض</button>
      </div>
      <div id="patients-table"></div>
    </div>
  `;
  loadPatients();
}

async function loadPatients() {
  const search = document.getElementById('p-search')?.value || '';
  const rows = await API.get(`/api/patients?search=${encodeURIComponent(search)}`);
  const box = document.getElementById('patients-table');
  if (!rows.length) { box.innerHTML = '<div class="empty">لا يوجد مرضى بعد</div>'; return; }
  box.innerHTML = `
    <table>
      <thead><tr><th>#</th><th>الاسم</th><th>الجوال</th><th>الجنس</th><th>تاريخ الميلاد</th><th>إجراءات</th></tr></thead>
      <tbody>
        ${rows.map(p => `
          <tr>
            <td>${p.id}</td>
            <td>${p.full_name}</td>
            <td>${p.phone || '-'}</td>
            <td>${p.gender || '-'}</td>
            <td>${p.birth_date || '-'}</td>
            <td>
              <button class="btn small" onclick="openPatientModal(${p.id})">تعديل</button>
              <button class="btn small secondary" onclick="goToExamsFor(${p.id}, '${p.full_name.replace(/'/g, "")}')">الفحوصات</button>
              <button class="btn small secondary" onclick="openCustomerStatement(${p.id}, '${p.full_name.replace(/'/g, "")}')">💳 كشف حساب</button>
              <button class="btn small danger" onclick="deletePatient(${p.id})">حذف</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function goToExamsFor(id, name) {
  switchTab('exams');
  setTimeout(() => filterExamsByPatient(id, name), 50);
}

async function deletePatient(id) {
  if (!(await showConfirmModal('هل أنت متأكد من حذف هذا المريض؟'))) return;
  await API.del(`/api/patients/${id}`);
  loadPatients();
}

let PATIENT_MODAL_CALLBACK = null;

async function openPatientModal(id, onSavedCallback) {
  PATIENT_MODAL_CALLBACK = onSavedCallback || null;
  let patient = { full_name: '', phone: '', gender: 'ذكر', birth_date: '', address: '', notes: '' };
  if (id) patient = await API.get(`/api/patients/${id}`);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>${id ? 'تعديل بيانات المريض' : 'إضافة مريض جديد'}</h3>
      <div class="grid-2">
        <div class="form-group"><label>الاسم الكامل</label><input id="f-name" value="${patient.full_name}"></div>
        <div class="form-group"><label>رقم الجوال</label><input id="f-phone" value="${patient.phone || ''}"></div>
        <div class="form-group"><label>الجنس</label>
          <select id="f-gender">
            <option ${patient.gender === 'ذكر' ? 'selected' : ''}>ذكر</option>
            <option ${patient.gender === 'أنثى' ? 'selected' : ''}>أنثى</option>
          </select>
        </div>
        <div class="form-group"><label>تاريخ الميلاد</label><input type="date" id="f-birth" value="${patient.birth_date || ''}"></div>
      </div>
      <div class="form-group"><label>العنوان</label><input id="f-address" value="${patient.address || ''}"></div>
      <div class="form-group"><label>ملاحظات</label><textarea id="f-notes" rows="2">${patient.notes || ''}</textarea></div>
      <div class="modal-actions">
        <button class="btn secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
        <button class="btn" onclick="savePatient(${id || 'null'})">حفظ</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

async function openCustomerStatement(id, name) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="width:520px">
      <h3>💳 كشف حساب: ${name}</h3>
      <div class="grid-3" style="margin-bottom:10px">
        <div class="form-group"><label>من تاريخ</label><input type="date" id="cust-stmt-from"></div>
        <div class="form-group"><label>إلى تاريخ</label><input type="date" id="cust-stmt-to"></div>
        <div class="form-group"><label>&nbsp;</label><button class="btn" style="width:100%" onclick="loadCustomerStatementPreview(${id})">تحديث المعاينة</button></div>
      </div>
      <div id="cust-stmt-preview"></div>
      <div class="modal-actions">
        <button class="btn secondary" onclick="this.closest('.modal-overlay').remove()">إغلاق</button>
        <button class="btn" onclick="printCustomerStatement(${id}, '${name.replace(/'/g,"")}')">🖨️ طباعة كشف الحساب</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  loadCustomerStatementPreview(id);
}

async function loadCustomerStatementPreview(id) {
  const from = document.getElementById('cust-stmt-from').value;
  const to = document.getElementById('cust-stmt-to').value;
  const statement = await API.get(`/api/patients/${id}/statement?from=${from}&to=${to}`);
  const box = document.getElementById('cust-stmt-preview');
  box.innerHTML = `
    <p style="margin-bottom:8px;font-size:13px">الرصيد الافتتاحي: <b>${statement.opening_balance.toLocaleString('ar')} د.ع</b></p>
    <table>
      <thead><tr><th>التاريخ</th><th>البيان</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead>
      <tbody>
        ${statement.entries.length ? statement.entries.map(e => `
          <tr>
            <td>${(e.date||'').split(' ')[0]}</td>
            <td>${e.description}</td>
            <td>${e.debit ? e.debit.toLocaleString('ar') : '-'}</td>
            <td>${e.credit ? e.credit.toLocaleString('ar') : '-'}</td>
            <td>${e.balance.toLocaleString('ar')}</td>
          </tr>
        `).join('') : '<tr><td colspan="5" class="empty">لا توجد حركات بهذه الفترة</td></tr>'}
      </tbody>
    </table>
    <p style="margin-top:8px;font-size:14px"><b>الرصيد الختامي: ${statement.closing_balance.toLocaleString('ar')} د.ع</b></p>
  `;
}

async function printCustomerStatement(id, name) {
  const from = document.getElementById('cust-stmt-from')?.value || '';
  const to = document.getElementById('cust-stmt-to')?.value || '';
  const [statement, settings] = await Promise.all([
    API.get(`/api/patients/${id}/statement?from=${from}&to=${to}`),
    API.get('/api/settings')
  ]);
  const html = buildStatementHtml(name, statement, settings);
  window.desktop.printPreview({ htmlContent: html, title: 'كشف حساب عميل' });
}

async function savePatient(id) {
  const data = {
    full_name: document.getElementById('f-name').value.trim(),
    phone: document.getElementById('f-phone').value.trim(),
    gender: document.getElementById('f-gender').value,
    birth_date: document.getElementById('f-birth').value,
    address: document.getElementById('f-address').value.trim(),
    notes: document.getElementById('f-notes').value.trim(),
  };
  if (!data.full_name) { showAlertModal('الرجاء إدخال اسم المريض'); return; }
  try {
    let newId = id;
    if (id) {
      await API.put(`/api/patients/${id}`, data);
    } else {
      const result = await API.post('/api/patients', data);
      newId = result.id;
    }
    document.querySelector('.modal-overlay').remove();
    if (document.getElementById('patients-table')) loadPatients();
    if (!id && PATIENT_MODAL_CALLBACK) {
      PATIENT_MODAL_CALLBACK(newId, data.full_name);
    }
    PATIENT_MODAL_CALLBACK = null;
  } catch (err) {
    showAlertModal('تعذر حفظ بيانات المريض: ' + err.message);
  }
}
