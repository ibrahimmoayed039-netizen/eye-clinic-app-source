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
// قوائم اقتراحات (datalist) للإدخال اليدوي — تسمح بكتابة أي قيمة مباشرة مع اقتراحات سريعة اختيارية
function generateDiopterList(min, max, step) {
  const count = Math.round((max - min) / step);
  const list = [];
  for (let i = 0; i <= count; i++) {
    const val = Math.round((min + i * step) * 100) / 100;
    list.push(formatDiopter(val));
  }
  return list;
}
// SPH: من أقوى قصر نظر (-20.00) إلى أقوى بعد نظر (+20.00)
function sphOptions(selected) { return generateDiopterOptions(-20, 20, 0.25, selected); }
// CYL: من أقوى استجماتيزم سالب (-10.00) إلى أقوى استجماتيزم موجب (+10.00)
function cylOptions(selected) { return generateDiopterOptions(-10, 10, 0.25, selected); }
const SPH_VALUES = generateDiopterList(-20, 20, 0.25);
const CYL_VALUES = generateDiopterList(-10, 10, 0.25);

// قائمة اقتراحات قابلة للتمرير بالماوس (بديل عن datalist الأصلية بالمتصفح التي لا تدعم
// التمرير بعجلة الماوس داخل Electron لما تحتوي على عدد كبير من الخيارات)
function showDiopterSuggestions(inputEl, values) {
  const typed = inputEl.value.trim();
  const matches = (typed ? values.filter(v => v.includes(typed)) : values).slice(0, 8);
  let list = inputEl._suggestBox;
  if (!list) {
    inputEl.parentElement.style.position = 'relative';
    list = document.createElement('div');
    list.style = 'position:absolute;top:100%;left:0;right:0;margin-top:4px;background:#fff;border:1px solid #ddd;border-radius:8px;z-index:50;max-height:180px;overflow-y:auto;box-shadow:0 4px 10px rgba(0,0,0,.1)';
    inputEl.after(list);
    inputEl._suggestBox = list;
  }
  if (!matches.length) { list.remove(); inputEl._suggestBox = null; return; }
  list.innerHTML = matches.map(v => `<div style="padding:7px 12px;cursor:pointer" onmousedown="event.preventDefault(); selectDiopterSuggestion('${inputEl.id}', '${v}')">${v}</div>`).join('');
}
function selectDiopterSuggestion(inputId, value) {
  const el = document.getElementById(inputId);
  el.value = value;
  if (el._suggestBox) { el._suggestBox.remove(); el._suggestBox = null; }
}
// إغلاق قائمة الاقتراحات عند الضغط خارجها
document.addEventListener('click', (e) => {
  document.querySelectorAll('input[id^="x-od-sph"], input[id^="x-os-sph"], input[id^="x-od-cyl"], input[id^="x-os-cyl"]').forEach(el => {
    if (el !== e.target && el._suggestBox) { el._suggestBox.remove(); el._suggestBox = null; }
  });
});

// حدة الإبصار (Visual Acuity) بمقياس Snellen القياسي — من الأضعف إلى الأقوى
const VA_VALUES = ['NPL (لا يوجد إدراك للضوء)', 'PL (إدراك للضوء فقط)', 'HM (حركة اليد)', 'CF (عدّ الأصابع)', '3/60', '6/60', '6/36', '6/24', '6/18', '6/12', '6/9', '6/6'];
function vaOptions(selected) {
  let opts = '<option value="">-- بدون --</option>';
  VA_VALUES.forEach(v => {
    opts += `<option value="${v}" ${selected === v ? 'selected' : ''}>${v}</option>`;
  });
  return opts;
}
function vaDatalist() {
  return VA_VALUES.map(v => `<option value="${v}">`).join('');
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
  if (!(await showConfirmModal('حذف هذا الفحص؟'))) return;
  try {
    await API.del(`/api/exams/${id}`);
    loadExams();
  } catch (err) {
    showAlertModal('تعذر حذف الفحص: ' + err.message);
  }
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
    const anchor = document.getElementById('e-patient-search');
    anchor.parentElement.style.position = 'relative';
    list = document.createElement('div');
    list.id = 'e-patient-results';
    list.style = 'position:absolute;top:100%;left:0;right:0;margin-top:4px;background:#fff;border:1px solid #ddd;border-radius:8px;z-index:50;max-height:200px;overflow:auto;box-shadow:0 4px 10px rgba(0,0,0,.1)';
    anchor.after(list);
  }
  list.innerHTML = rows.slice(0, 8).map(p => `<div style="padding:8px 12px;cursor:pointer" onmousedown="filterExamsByPatient(${p.id}, '${p.full_name.replace(/'/g, "")}'); document.getElementById('e-patient-results').remove(); document.getElementById('e-patient-search').value='${p.full_name.replace(/'/g,"")}'">${p.full_name} - ${p.phone || ''}</div>`).join('') || '<div style="padding:8px 12px;color:#999">لا نتائج</div>';
}

async function openExamModal() {
  const employees = await API.get('/api/employees');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="width:760px">
      <h3>فحص نظر جديد</h3>
      <div class="grid-2">
        <div class="form-group"><label>المريض *</label>
          <div style="display:flex;gap:6px">
            <input id="x-patient-search" placeholder="ابحث باسم المريض..." style="flex:1" autocomplete="off" oninput="searchPatientForExamModal()">
            <button type="button" class="btn small secondary" onclick="addPatientFromExamModal()">+ مريض جديد</button>
          </div>
          <input type="hidden" id="x-patient">
        </div>
        <div class="form-group"><label>الموظف الفاحص</label>
          <select id="x-employee">${employees.map(e => `<option value="${e.id}" ${CURRENT_USER && e.id===CURRENT_USER.id ? 'selected':''}>${e.full_name}</option>`).join('')}</select>
        </div>
      </div>

      <div class="hint" style="margin-bottom:8px">👁️ حدة الإبصار: سجّل قراءة المريض بدون تصحيح (قبل الفحص)، ثم قراءته مع النظارة/التصحيح الموصوف (بعد الفحص) — بمقياس Snellen القياسي. الحقول اختيارية وتُكتب يدويًا (مع اقتراحات سريعة عند الكتابة).</div>
      <datalist id="va-suggestions">${vaDatalist()}</datalist>
      <table class="eye-table" style="margin-bottom:12px">
        <thead><tr><th>العين</th><th>قبل الفحص (بدون تصحيح)</th><th>بعد الفحص (مع النظارة)</th></tr></thead>
        <tbody>
          <tr><td>اليمنى (OD)</td>
            <td><input id="x-od-va-before" list="va-suggestions" placeholder="مثال: 6/6"></td>
            <td><input id="x-od-va-after" list="va-suggestions" placeholder="مثال: 6/6"></td>
          </tr>
          <tr><td>اليسرى (OS)</td>
            <td><input id="x-os-va-before" list="va-suggestions" placeholder="مثال: 6/6"></td>
            <td><input id="x-os-va-after" list="va-suggestions" placeholder="مثال: 6/6"></td>
          </tr>
        </tbody>
      </table>

      <div class="hint" style="margin-bottom:8px">اكتب قوة العدسة (SPH) والاستجماتيزم (CYL) يدويًا (اختيارية) — تظهر لك اقتراحات سريعة أثناء الكتابة، أو اترك الحقل فارغًا.</div>
      <table class="eye-table" style="margin-bottom:12px">
        <thead><tr><th>العين</th><th>SPH</th><th>CYL</th><th>AXIS (0-180)</th><th>PD (مم)</th><th>ADD (قراءة)</th></tr></thead>
        <tbody>
          <tr><td>اليمنى (OD)</td>
            <td><input id="x-od-sph" autocomplete="off" placeholder="مثال: -2.25" oninput="showDiopterSuggestions(this, SPH_VALUES)"></td>
            <td><input id="x-od-cyl" autocomplete="off" placeholder="مثال: -0.75" oninput="showDiopterSuggestions(this, CYL_VALUES)"></td>
            <td><input id="x-od-axis" type="number" min="0" max="180" placeholder="0-180"></td>
            <td><input id="x-od-pd" type="number" step="0.5" placeholder="مم"></td>
            <td><input id="x-od-add" placeholder="مثال: +1.50"></td>
          </tr>
          <tr><td>اليسرى (OS)</td>
            <td><input id="x-os-sph" autocomplete="off" placeholder="مثال: -2.25" oninput="showDiopterSuggestions(this, SPH_VALUES)"></td>
            <td><input id="x-os-cyl" autocomplete="off" placeholder="مثال: -0.75" oninput="showDiopterSuggestions(this, CYL_VALUES)"></td>
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

async function searchPatientForExamModal() {
  const q = document.getElementById('x-patient-search').value.trim();
  document.getElementById('x-patient').value = ''; // إلغاء التحديد السابق لحين اختيار نتيجة جديدة
  if (q.length < 2) { document.getElementById('x-patient-results')?.remove(); return; }
  const rows = await API.get(`/api/patients?search=${encodeURIComponent(q)}`);
  let list = document.getElementById('x-patient-results');
  if (!list) {
    const anchor = document.getElementById('x-patient-search');
    anchor.parentElement.style.position = 'relative';
    list = document.createElement('div');
    list.id = 'x-patient-results';
    list.style = 'position:absolute;top:100%;left:0;right:0;margin-top:4px;background:#fff;border:1px solid #ddd;border-radius:8px;z-index:50;max-height:200px;overflow:auto;box-shadow:0 4px 10px rgba(0,0,0,.1)';
    anchor.after(list);
  }
  list.innerHTML = rows.slice(0, 8).map(p => `
    <div style="padding:8px 12px;cursor:pointer" onmousedown="selectPatientForExamModal(${p.id}, '${p.full_name.replace(/'/g, "")}')">${p.full_name} - ${p.phone || ''}</div>
  `).join('') || `<div style="padding:8px 12px;color:#999">لا نتائج — اضغط "+ مريض جديد" لإضافته</div>`;
}

function selectPatientForExamModal(id, name) {
  document.getElementById('x-patient').value = id;
  document.getElementById('x-patient-search').value = name;
  document.getElementById('x-patient-results')?.remove();
}

function addPatientFromExamModal() {
  openPatientModal(null, (newId, name) => {
    document.getElementById('x-patient').value = newId;
    document.getElementById('x-patient-search').value = name;
    document.getElementById('x-patient-results')?.remove();
  });
}

async function saveExam() {
  const patientId = document.getElementById('x-patient').value;
  if (!patientId) { showAlertModal('الرجاء اختيار المريض من نتائج البحث، أو إضافته كمريض جديد أولًا'); return; }
  const data = {
    patient_id: patientId,
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
    closeTopModal();
    loadExams();
  } catch (err) {
    showAlertModal('تعذر حفظ الفحص: ' + err.message);
  }
}

async function printExamReport(exam) {
  const settings = await API.get('/api/settings');
  const html = buildExamReportHtml(exam, settings);
  window.desktop.printPreview({ htmlContent: html, title: 'تقرير الفحص' });
}
