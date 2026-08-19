let examFilterPatientId = null;
let examFilterPatientName = null;
let EXAMS_ROWS_CACHE = [];

// ===== توليد قوائم تدرّجات القوة النظرية (من الأقوى سالب إلى الأقوى موجب) =====
function formatDiopter(val) {
  if (val === 0) return '0.00';
  const sign = val > 0 ? '+' : '-';
  return sign + Math.abs(val).toFixed(2);
}
function generateDiopterOptions(min, max, step, selected) {
  const count = Math.round((max - min) / step);
  let opts = '<option value="">-- بدون --</option>';
  for (let i = 0; i <= count; i++) {
    const val = Math.round((min + i * step) * 100) / 100;
    const label = formatDiopter(val);
    const sel = (String(selected) === label) ? 'selected' : '';
    opts += `<option value="${label}" ${sel}>${label}</option>`;
  }
  return opts;
}
// SPH: من أقوى قصر نظر (-20.00) إلى أقوى بعد نظر (+20.00)
function sphOptions(selected) { return generateDiopterOptions(-20, 20, 0.25, selected); }
// CYL: من أقوى استجماتيزم سالب (-10.00) إلى أقوى استجماتيزم موجب (+10.00)
function cylOptions(selected) { return generateDiopterOptions(-10, 10, 0.25, selected); }

// حدة الإبصار (Visual Acuity) بمقياس Snellen القياسي — من الأضعف إلى الأقوى
const VA_VALUES = ['NPL (لا يوجد إدراك للضوء)', 'PL (إدراك للضوء فقط)', 'HM (حركة اليد)', 'CF (عدّ الأصابع)', '3/60', '6/60', '6/36', '6/24', '6/18', '6/12', '6/9', '6/6'];
function vaOptions(selected) {
  let opts = '<option value="">-- بدون --</option>';
  VA_VALUES.forEach(v => {
    opts += `<option value="${v}" ${selected === v ? 'selected' : ''}>${v}</option>`;
  });
  return opts;
}

async function renderExamsTab(container) {
  const employees = await API.get('/api/employees');
  container.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <input id="e-patient-search" placeholder="بحث باسم المريض..." style="width:220px" oninput="searchPatientForExam()">
        <select id="e-employee-filter" onchange="loadExams()">
          <option value="">كل الموظفين</option>
          ${employees.map(e => `<option value="${e.id}">${e.full_name}</option>`).join('')}
        </select>
        <input type="date" id="e-from" onchange="loadExams()">
        <input type="date" id="e-to" onchange="loadExams()">
        <button class="btn secondary" onclick="clearExamFilter()">مسح الفلتر</button>
        <button class="btn" onclick="openExamModal()">+ فحص جديد</button>
      </div>
      <div id="exam-filter-badge"></div>
      <div id="exams-table"></div>
    </div>
  `;
  loadExams();
}

function filterExamsByPatient(id, name) {
  examFilterPatientId = id;
  examFilterPatientName = name;
  loadExams();
}
function clearExamFilter() { examFilterPatientId = null; loadExams(); }

async function loadExams() {
  const employee_id = document.getElementById('e-employee-filter')?.value || '';
  const from = document.getElementById('e-from')?.value || '';
  const to = document.getElementById('e-to')?.value || '';
  let url = `/api/exams?employee_id=${employee_id}&from=${from}&to=${to}`;
  if (examFilterPatientId) url += `&patient_id=${examFilterPatientId}`;
  const rows = await API.get(url);
  EXAMS_ROWS_CACHE = rows;

  const badge = document.getElementById('exam-filter-badge');
  badge.innerHTML = examFilterPatientId ? `<p style="margin-bottom:10px;font-size:13px">🔎 عرض فحوصات: <b>${examFilterPatientName}</b></p>` : '';

  const box = document.getElementById('exams-table');
  if (!rows.length) { box.innerHTML = '<div class="empty">لا توجد فحوصات مطابقة</div>'; return; }
  box.innerHTML = `
    <table class="eye-table">
      <thead><tr><th>التاريخ</th><th>المريض</th><th>OD (يمين) SPH/CYL/AXIS</th><th>OS (يسار) SPH/CYL/AXIS</th><th>التشخيص</th><th>الموظف</th><th>إجراءات</th></tr></thead>
      <tbody>
        ${rows.map(e => `
          <tr>
            <td>${(e.exam_date || '').split(' ')[0]}</td>
            <td>${e.patient_name || '-'}</td>
            <td>${e.od_sph || '-'} / ${e.od_cyl || '-'} / ${e.od_axis || '-'}</td>
            <td>${e.os_sph || '-'} / ${e.os_cyl || '-'} / ${e.os_axis || '-'}</td>
            <td>${e.diagnosis || '-'}</td>
            <td>${e.employee_name || '-'}</td>
            <td>
              <button class="btn small" onclick="viewExamById(${e.id})">عرض</button>
              <button class="btn small secondary" onclick="printExamReportById(${e.id})">🖨️ طباعة</button>
              <button class="btn small danger" onclick="deleteExam(${e.id})">حذف</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function deleteExam(id) {
  if (!confirm('حذف هذا الفحص؟')) return;
  await API.del(`/api/exams/${id}`);
  loadExams();
}

function viewExamById(id) {
  const e = EXAMS_ROWS_CACHE.find(r => r.id === id);
  if (e) viewExam(e);
}
function printExamReportById(id) {
  const e = EXAMS_ROWS_CACHE.find(r => r.id === id);
  if (e) printExamReport(e);
}

function viewExam(e) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>تفاصيل الفحص - ${e.patient_name}</h3>
      <table class="eye-table" style="margin-bottom:12px">
        <thead><tr><th>العين</th><th>حدة الإبصار قبل الفحص</th><th>حدة الإبصار بعد الفحص (مع النظارة)</th></tr></thead>
        <tbody>
          <tr><td>اليمنى (OD)</td><td>${e.od_va_before||'-'}</td><td>${e.od_va_after||'-'}</td></tr>
          <tr><td>اليسرى (OS)</td><td>${e.os_va_before||'-'}</td><td>${e.os_va_after||'-'}</td></tr>
        </tbody>
      </table>
      <table class="eye-table">
        <thead><tr><th>العين</th><th>SPH</th><th>CYL</th><th>AXIS</th><th>PD</th><th>ADD</th></tr></thead>
        <tbody>
          <tr><td>اليمنى (OD)</td><td>${e.od_sph||'-'}</td><td>${e.od_cyl||'-'}</td><td>${e.od_axis||'-'}</td><td>${e.od_pd||'-'}</td><td>${e.od_add||'-'}</td></tr>
          <tr><td>اليسرى (OS)</td><td>${e.os_sph||'-'}</td><td>${e.os_cyl||'-'}</td><td>${e.os_axis||'-'}</td><td>${e.os_pd||'-'}</td><td>${e.os_add||'-'}</td></tr>
        </tbody>
      </table>
      <div class="form-group" style="margin-top:14px"><label>التشخيص</label><div>${e.diagnosis || '-'}</div></div>
      <div class="form-group"><label>ملاحظات طبية</label><div>${e.medical_notes || '-'}</div></div>
      <div class="form-group"><label>التوصيات</label><div>${e.recommendations || '-'}</div></div>
      <div class="form-group"><label>موعد المراجعة القادم</label><div>${e.next_visit_date || '-'}</div></div>
      <div class="modal-actions">
        <button class="btn secondary" onclick="this.closest('.modal-overlay').remove()">إغلاق</button>
        <button class="btn" onclick="printExamReportById(${e.id})">🖨️ طباعة</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

async function searchPatientForExam() {
  const q = document.getElementById('e-patient-search').value.trim();
  if (q.length < 2) { document.getElementById('e-patient-results')?.remove(); return; }
  const rows = await API.get(`/api/patients?search=${encodeURIComponent(q)}`);
  let list = document.getElementById('e-patient-results');
  if (!list) {
    list = document.createElement('div');
    list.id = 'e-patient-results';
    list.style = 'position:absolute;background:#fff;border:1px solid #ddd;border-radius:8px;z-index:50;max-height:200px;overflow:auto;box-shadow:0 4px 10px rgba(0,0,0,.1)';
    document.getElementById('e-patient-search').after(list);
  }
  list.innerHTML = rows.slice(0, 8).map(p => `<div style="padding:8px 12px;cursor:pointer" onmousedown="filterExamsByPatient(${p.id}, '${p.full_name.replace(/'/g, "")}'); document.getElementById('e-patient-results').remove(); document.getElementById('e-patient-search').value='${p.full_name.replace(/'/g,"")}'">${p.full_name} - ${p.phone || ''}</div>`).join('') || '<div style="padding:8px 12px;color:#999">لا نتائج</div>';
}

async function openExamModal() {
  const patients = await API.get('/api/patients');
  const employees = await API.get('/api/employees');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="width:760px">
      <h3>فحص نظر جديد</h3>
      <div class="grid-2">
        <div class="form-group"><label>المريض</label>
          <select id="x-patient">${patients.map(p => `<option value="${p.id}">${p.full_name}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label>الموظف الفاحص</label>
          <select id="x-employee">${employees.map(e => `<option value="${e.id}" ${CURRENT_USER && e.id===CURRENT_USER.id ? 'selected':''}>${e.full_name}</option>`).join('')}</select>
        </div>
      </div>

      <div class="hint" style="margin-bottom:8px">👁️ حدة الإبصار: سجّل قراءة المريض بدون تصحيح (قبل الفحص)، ثم قراءته مع النظارة/التصحيح الموصوف (بعد الفحص) — بمقياس Snellen القياسي.</div>
      <table class="eye-table" style="margin-bottom:12px">
        <thead><tr><th>العين</th><th>قبل الفحص (بدون تصحيح)</th><th>بعد الفحص (مع النظارة)</th></tr></thead>
        <tbody>
          <tr><td>اليمنى (OD)</td>
            <td><select id="x-od-va-before">${vaOptions()}</select></td>
            <td><select id="x-od-va-after">${vaOptions()}</select></td>
          </tr>
          <tr><td>اليسرى (OS)</td>
            <td><select id="x-os-va-before">${vaOptions()}</select></td>
            <td><select id="x-os-va-after">${vaOptions()}</select></td>
          </tr>
        </tbody>
      </table>

      <div class="hint" style="margin-bottom:8px">اختر قوة العدسة (SPH) والاستجماتيزم (CYL) من القوائم مباشرة — من الأقوى سالب (قصر نظر) إلى الأقوى موجب (بعد نظر)، بدون كتابة يدوية.</div>
      <table class="eye-table" style="margin-bottom:12px">
        <thead><tr><th>العين</th><th>SPH</th><th>CYL</th><th>AXIS (0-180)</th><th>PD (مم)</th><th>ADD (قراءة)</th></tr></thead>
        <tbody>
          <tr><td>اليمنى (OD)</td>
            <td><select id="x-od-sph">${sphOptions()}</select></td>
            <td><select id="x-od-cyl">${cylOptions()}</select></td>
            <td><input id="x-od-axis" type="number" min="0" max="180" placeholder="0-180"></td>
            <td><input id="x-od-pd" type="number" step="0.5" placeholder="مم"></td>
            <td><input id="x-od-add" placeholder="مثال: +1.50"></td>
          </tr>
          <tr><td>اليسرى (OS)</td>
            <td><select id="x-os-sph">${sphOptions()}</select></td>
            <td><select id="x-os-cyl">${cylOptions()}</select></td>
            <td><input id="x-os-axis" type="number" min="0" max="180" placeholder="0-180"></td>
            <td><input id="x-os-pd" type="number" step="0.5" placeholder="مم"></td>
            <td><input id="x-os-add" placeholder="مثال: +1.50"></td>
          </tr>
        </tbody>
      </table>

      <div class="form-group"><label>التشخيص (مثال: قصر نظر / بعد نظر / استجماتيزم)</label>
        <select id="x-diagnosis">
          <option>قصر نظر (Myopia)</option>
          <option>بعد نظر (Hyperopia)</option>
          <option>استجماتيزم (Astigmatism)</option>
          <option>طول النظر الشيخوخي (Presbyopia)</option>
          <option>حالة طبيعية</option>
          <option>أخرى</option>
        </select>
      </div>
      <div class="form-group"><label>ملاحظات طبية إضافية</label><textarea id="x-notes" rows="2" placeholder="ضغط العين، حالة الشبكية، حساسية، إلخ"></textarea></div>
      <div class="form-group"><label>التوصيات</label><textarea id="x-recommendations" rows="2" placeholder="نوع العدسات الموصى بها، إرشادات..."></textarea></div>
      <div class="form-group"><label>موعد المراجعة القادم</label><input type="date" id="x-next-visit"></div>

      <div class="modal-actions">
        <button class="btn secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
        <button class="btn" onclick="saveExam()">حفظ الفحص</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

async function saveExam() {
  const data = {
    patient_id: document.getElementById('x-patient').value,
    employee_id: document.getElementById('x-employee').value,
    od_va_before: document.getElementById('x-od-va-before').value,
    os_va_before: document.getElementById('x-os-va-before').value,
    od_va_after: document.getElementById('x-od-va-after').value,
    os_va_after: document.getElementById('x-os-va-after').value,
    od_sph: document.getElementById('x-od-sph').value,
    od_cyl: document.getElementById('x-od-cyl').value,
    od_axis: document.getElementById('x-od-axis').value,
    od_pd: document.getElementById('x-od-pd').value,
    od_add: document.getElementById('x-od-add').value,
    os_sph: document.getElementById('x-os-sph').value,
    os_cyl: document.getElementById('x-os-cyl').value,
    os_axis: document.getElementById('x-os-axis').value,
    os_pd: document.getElementById('x-os-pd').value,
    os_add: document.getElementById('x-os-add').value,
    diagnosis: document.getElementById('x-diagnosis').value,
    medical_notes: document.getElementById('x-notes').value,
    recommendations: document.getElementById('x-recommendations').value,
    next_visit_date: document.getElementById('x-next-visit').value,
  };
  try {
    await API.post('/api/exams', data);
    document.querySelector('.modal-overlay').remove();
    loadExams();
  } catch (err) {
    alert('تعذر حفظ الفحص: ' + err.message);
  }
}

async function printExamReport(exam) {
  const settings = await API.get('/api/settings');
  const html = buildExamReportHtml(exam, settings);
  window.desktop.printPreview({ htmlContent: html, title: 'تقرير الفحص' });
}
