let ALL_EMPLOYEES_CACHE = [];

// الصلاحيات المقترحة تلقائيًا حسب الدور — تُستخدم كنقطة بداية فقط، والمدير يقدر يعدّلها يدويًا بعدها
const ROLE_PERMISSION_PRESETS = {
  'مدير': null, // المدير لديه كل الصلاحيات دائمًا، بلا استثناء
  'كاشير': ['patients', 'sales', 'cashbox'],
  'طبيب فحص': ['patients', 'exams'],
  'موظف': ['patients', 'exams', 'products', 'sales', 'suppliers', 'purchases', 'special-orders', 'inventory'],
};

function allPermissionTabIds() {
  return (typeof TABS !== 'undefined' ? TABS : []).map(t => t.id);
}

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
      <thead><tr><th>#</th><th>الاسم</th><th>اسم المستخدم</th><th>الدور</th><th>الصلاحيات</th><th>الجوال</th><th>الحالة</th><th>إجراءات</th></tr></thead>
      <tbody>
        ${rows.map(e => `
          <tr>
            <td>${e.id}</td>
            <td>${e.full_name}</td>
            <td>${e.username}</td>
            <td>${e.role}</td>
            <td>${permissionsSummaryBadge(e)}</td>
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

function permissionsSummaryBadge(e) {
  if (e.role === 'مدير' || !e.permissions) {
    return `<span class="badge delivered">كل الصلاحيات</span>`;
  }
  const count = e.permissions.length;
  const total = allPermissionTabIds().length;
  if (count === 0) return `<span class="badge unpaid">بلا صلاحيات</span>`;
  return `<span class="badge pending">${count} من ${total} تبويب</span>`;
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
  let e = { full_name: '', username: '', role: 'موظف', phone: '', active: 1, permissions: null };
  if (id) e = ALL_EMPLOYEES_CACHE.find(x => x.id === id) || e;

  // حالة الصلاحيات المبدئية داخل النافذة: إن كانت محددة مسبقًا نستخدمها كما هي،
  // وإن كانت فارغة (موظف قديم قبل هذه الميزة، أو موظف جديد) نستخدم كل التبويبات كنقطة بداية
  // حتى لا نُفاجئ أحدًا بفقدان وصوله فجأة بعد تعديل بسيط لبياناته.
  let workingPermissions = Array.isArray(e.permissions) ? [...e.permissions] : allPermissionTabIds();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="width:560px">
      <h3>${id ? 'تعديل موظف' : 'إضافة موظف جديد'}</h3>
      <div class="grid-2">
        <div class="form-group"><label>الاسم الكامل</label><input id="em-name" value="${e.full_name}"></div>
        <div class="form-group"><label>اسم المستخدم</label><input id="em-username" value="${e.username}" ${id ? 'disabled' : ''}></div>
        ${!id ? `<div class="form-group"><label>كلمة المرور</label><input id="em-password" type="text" placeholder="افتراضي: 123456"></div>` : ''}
        <div class="form-group"><label>الدور</label>
          <select id="em-role" onchange="onEmployeeRoleChange()">
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

      <div class="form-group" id="em-permissions-wrap">
        <label>الصلاحيات (التبويبات المسموح للموظف الوصول إليها)</label>
        <div id="em-permissions-note" class="hint" style="margin-bottom:8px"></div>
        <div id="em-permissions-grid" class="permissions-grid"></div>
      </div>

      <div class="modal-actions">
        <button class="btn secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
        <button class="btn" onclick="saveEmployee(${id || 'null'})">حفظ</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  window.__EM_WORKING_PERMISSIONS = workingPermissions;
  renderPermissionsGrid();
}

// يُستدعى عند تغيير الدور من القائمة المنسدلة: يقترح صلاحيات مناسبة للدور الجديد تلقائيًا
function onEmployeeRoleChange() {
  const role = document.getElementById('em-role').value;
  const preset = ROLE_PERMISSION_PRESETS[role];
  window.__EM_WORKING_PERMISSIONS = preset ? [...preset] : allPermissionTabIds();
  renderPermissionsGrid();
}

function togglePermission(tabId, checked) {
  const list = window.__EM_WORKING_PERMISSIONS || [];
  window.__EM_WORKING_PERMISSIONS = checked ? [...new Set([...list, tabId])] : list.filter(x => x !== tabId);
}

function setAllPermissions(checked) {
  window.__EM_WORKING_PERMISSIONS = checked ? allPermissionTabIds() : [];
  renderPermissionsGrid();
}

function renderPermissionsGrid() {
  const role = document.getElementById('em-role')?.value;
  const note = document.getElementById('em-permissions-note');
  const grid = document.getElementById('em-permissions-grid');
  if (!grid) return;

  if (role === 'مدير') {
    note.innerHTML = '👑 المدير لديه كل الصلاحيات تلقائيًا ولا يمكن تقييده.';
    grid.style.display = 'none';
    return;
  }
  grid.style.display = 'grid';
  note.innerHTML = 'حدّد التبويبات التي يستطيع هذا الموظف الوصول إليها. تم اقتراح صلاحيات مناسبة حسب الدور، وتقدر تعدّلها كما تريد.';

  const tabs = (typeof TABS !== 'undefined' ? TABS : []);
  const working = window.__EM_WORKING_PERMISSIONS || [];
  grid.innerHTML = `
    <label class="permission-item permission-item-all">
      <input type="checkbox" ${working.length === tabs.length ? 'checked' : ''} onchange="setAllPermissions(this.checked)">
      <span>تحديد الكل</span>
    </label>
    ${tabs.map(t => `
      <label class="permission-item">
        <input type="checkbox" ${working.includes(t.id) ? 'checked' : ''} onchange="togglePermission('${t.id}', this.checked)">
        <span>${t.label}</span>
      </label>
    `).join('')}
  `;
}

async function saveEmployee(id) {
  const full_name = document.getElementById('em-name').value.trim();
  const role = document.getElementById('em-role').value;
  const phone = document.getElementById('em-phone').value.trim();
  if (!full_name) { showAlertModal('الرجاء إدخال الاسم'); return; }

  const permissions = role === 'مدير' ? null : (window.__EM_WORKING_PERMISSIONS || []);
  if (role !== 'مدير' && permissions.length === 0) {
    if (!(await showConfirmModal('لم تحدد أي صلاحية لهذا الموظف، ولن يستطيع الوصول لأي تبويب داخل النظام. هل تريد المتابعة؟'))) return;
  }

  try {
    if (id) {
      const active = document.getElementById('em-active').value;
      await API.put(`/api/employees/${id}`, { full_name, role, phone, active: active === '1', permissions });
    } else {
      const username = document.getElementById('em-username').value.trim();
      const password = document.getElementById('em-password').value.trim() || '123456';
      if (!username) { showAlertModal('الرجاء إدخال اسم المستخدم'); return; }
      await API.post('/api/employees', { full_name, username, password, role, phone, permissions });
    }
    closeTopModal();
    loadEmployees();
  } catch (err) {
    showAlertModal('تعذر حفظ بيانات الموظف: ' + err.message);
  }
}
