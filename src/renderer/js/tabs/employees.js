let ALL_EMPLOYEES_CACHE = [];

async function renderEmployeesTab(container) {
  container.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <button class="btn" onclick="openEmployeeModal()">+ إضافة موظف</button>
      </div>
      <div id="employees-table"></div>
    </div>
  `;
  loadEmployees();
}

async function loadEmployees() {
  const rows = await API.get('/api/employees');
  ALL_EMPLOYEES_CACHE = rows;
  const box = document.getElementById('employees-table');
  box.innerHTML = `
    <table>
      <thead><tr><th>#</th><th>الاسم</th><th>اسم المستخدم</th><th>الدور</th><th>الجوال</th><th>الحالة</th><th>إجراءات</th></tr></thead>
      <tbody>
        ${rows.map(e => `
          <tr>
            <td>${e.id}</td>
            <td>${e.full_name}</td>
            <td>${e.username}</td>
            <td>${e.role}</td>
            <td>${e.phone || '-'}</td>
            <td>${e.active ? '✅ نشط' : '⛔ موقوف'}</td>
            <td>
              <button class="btn small" onclick="openEmployeeModal(${e.id})">تعديل</button>
              ${CURRENT_USER && e.id !== CURRENT_USER.id ? `<button class="btn small danger" onclick="deleteEmployee(${e.id}, '${e.full_name.replace(/'/g,"")}')">حذف</button>` : ''}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function deleteEmployee(id, name) {
  if (!(await showConfirmModal(`هل تريد حذف الموظف "${name}"؟`))) return;
  try {
    const res = await API.del(`/api/employees/${id}`);
    if (res.deactivatedInstead) showAlertModal('هذا الموظف له فواتير/فحوصات سابقة، تم إيقافه بدل حذفه للحفاظ على سلامة السجلات.');
    loadEmployees();
  } catch (err) {
    showAlertModal('تعذر حذف الموظف: ' + err.message);
  }
}

async function openEmployeeModal(id) {
  let e = { full_name: '', username: '', role: 'موظف', phone: '', active: 1 };
  if (id) e = ALL_EMPLOYEES_CACHE.find(x => x.id === id) || e;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>${id ? 'تعديل موظف' : 'إضافة موظف جديد'}</h3>
      <div class="grid-2">
        <div class="form-group"><label>الاسم الكامل</label><input id="em-name" value="${e.full_name}"></div>
        <div class="form-group"><label>اسم المستخدم</label><input id="em-username" value="${e.username}" ${id ? 'disabled' : ''}></div>
        ${!id ? `<div class="form-group"><label>كلمة المرور</label><input id="em-password" type="text" placeholder="افتراضي: 123456"></div>` : ''}
        <div class="form-group"><label>الدور</label>
          <select id="em-role">
            <option ${e.role==='مدير'?'selected':''}>مدير</option>
            <option ${e.role==='موظف'?'selected':''}>موظف</option>
            <option ${e.role==='طبيب فحص'?'selected':''}>طبيب فحص</option>
            <option ${e.role==='كاشير'?'selected':''}>كاشير</option>
          </select>
        </div>
        <div class="form-group"><label>الجوال</label><input id="em-phone" value="${e.phone || ''}"></div>
        ${id ? `<div class="form-group"><label>الحالة</label>
          <select id="em-active"><option value="1" ${e.active?'selected':''}>نشط</option><option value="0" ${!e.active?'selected':''}>موقوف</option></select>
        </div>` : ''}
      </div>
      <div class="modal-actions">
        <button class="btn secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
        <button class="btn" onclick="saveEmployee(${id || 'null'})">حفظ</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

async function saveEmployee(id) {
  const full_name = document.getElementById('em-name').value.trim();
  const role = document.getElementById('em-role').value;
  const phone = document.getElementById('em-phone').value.trim();
  if (!full_name) { showAlertModal('الرجاء إدخال الاسم'); return; }
  try {
    if (id) {
      const active = document.getElementById('em-active').value;
      await API.put(`/api/employees/${id}`, { full_name, role, phone, active: active === '1' });
    } else {
      const username = document.getElementById('em-username').value.trim();
      const password = document.getElementById('em-password').value.trim() || '123456';
      if (!username) { showAlertModal('الرجاء إدخال اسم المستخدم'); return; }
      await API.post('/api/employees', { full_name, username, password, role, phone });
    }
    document.querySelector('.modal-overlay').remove();
    loadEmployees();
  } catch (err) {
    showAlertModal('تعذر حفظ بيانات الموظف: ' + err.message);
  }
}
