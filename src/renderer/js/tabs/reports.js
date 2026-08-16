async function renderReportsTab(container) {
  const employees = await API.get('/api/employees');
  container.innerHTML = `
    <div class="card">
      <h2>📊 التقارير وسجل الفواتير</h2>
      <div class="toolbar">
        <select id="r-type" onchange="runReport()">
          <option value="invoices">📋 سجل الفواتير / المبيعات</option>
          <option value="exams">👁️ سجل فحوصات النظر</option>
          <option value="balances">💳 أرصدة العملاء (المبالغ المستحقة)</option>
        </select>
        <select id="r-employee" onchange="runReport()">
          <option value="">كل الموظفين</option>
          ${employees.map(e => `<option value="${e.id}">${e.full_name}</option>`).join('')}
        </select>
        <input type="date" id="r-from" onchange="runReport()">
        <input type="date" id="r-to" onchange="runReport()">
        <input id="r-search" placeholder="بحث سريع بالاسم أو رقم الفاتورة..." style="flex:1;min-width:180px" oninput="filterReportRows()">
        <button class="btn secondary" onclick="printCurrentReport()">🖨️ طباعة التقرير كاملًا</button>
      </div>
      <div class="stat-cards" id="r-stats"></div>
      <div id="r-table"></div>
    </div>
  `;
  runReport();
}

let CURRENT_REPORT_ROWS = [];
let CURRENT_REPORT_TYPE = 'invoices';

function filterReportRows() {
  const q = document.getElementById('r-search').value.trim().toLowerCase();
  if (!q) { renderReportTable(CURRENT_REPORT_ROWS); return; }
  const filtered = CURRENT_REPORT_TYPE === 'invoices'
    ? CURRENT_REPORT_ROWS.filter(r => (r.invoice_number||'').toLowerCase().includes(q) || (r.patient_name||'').toLowerCase().includes(q))
    : CURRENT_REPORT_ROWS.filter(r => (r.patient_name||'').toLowerCase().includes(q) || (r.diagnosis||'').toLowerCase().includes(q));
  renderReportTable(filtered);
}

async function runReport() {
  const type = document.getElementById('r-type').value;
  CURRENT_REPORT_TYPE = type;
  const employee_id = document.getElementById('r-employee').value;
  const from = document.getElementById('r-from').value;
  const to = document.getElementById('r-to').value;

  if (type === 'invoices') {
    const rows = await API.get(`/api/invoices?employee_id=${employee_id}&from=${from}&to=${to}`);
    CURRENT_REPORT_ROWS = rows;
    const summary = await API.get(`/api/reports/summary?employee_id=${employee_id}&from=${from}&to=${to}`);
    document.getElementById('r-stats').innerHTML = `
      <div class="stat-card"><div class="num">${summary.invoice_count}</div><div class="label">عدد الفواتير</div></div>
      <div class="stat-card"><div class="num">${summary.total_sales.toLocaleString('ar')} د.ع</div><div class="label">إجمالي المبيعات</div></div>
      <div class="stat-card"><div class="num">${summary.total_paid.toLocaleString('ar')} د.ع</div><div class="label">إجمالي المدفوع</div></div>
    `;
  } else if (type === 'exams') {
    const rows = await API.get(`/api/exams?employee_id=${employee_id}&from=${from}&to=${to}`);
    CURRENT_REPORT_ROWS = rows;
    document.getElementById('r-stats').innerHTML = `
      <div class="stat-card"><div class="num">${rows.length}</div><div class="label">عدد الفحوصات</div></div>
    `;
  } else {
    const rows = await API.get('/api/customer-balances');
    CURRENT_REPORT_ROWS = rows;
    const totalOwed = rows.reduce((s, r) => s + r.balance, 0);
    document.getElementById('r-stats').innerHTML = `
      <div class="stat-card"><div class="num">${rows.length}</div><div class="label">عدد العملاء المدينين</div></div>
      <div class="stat-card"><div class="num">${totalOwed.toLocaleString('ar')} د.ع</div><div class="label">إجمالي المستحق على العملاء</div></div>
    `;
  }
  document.getElementById('r-search').value = '';
  renderReportTable(CURRENT_REPORT_ROWS);
}

function renderReportTable(rows) {
  const box = document.getElementById('r-table');
  if (!rows.length) { box.innerHTML = '<div class="empty">لا توجد بيانات مطابقة</div>'; return; }

  if (CURRENT_REPORT_TYPE === 'invoices') {
    box.innerHTML = `
      <table>
        <thead><tr><th>رقم الفاتورة</th><th>التاريخ</th><th>العميل</th><th>الموظف</th><th>طريقة الدفع</th><th>الإجمالي</th><th>الحالة</th><th>إجراءات</th></tr></thead>
        <tbody>${rows.map(r => `
          <tr>
            <td>${r.invoice_number.replace('INV-','')}</td>
            <td>${(r.invoice_date||'').split(' ')[0]}</td>
            <td>${r.patient_name||'عميل نقدي'}</td>
            <td>${r.employee_name||'-'}</td>
            <td>${r.payment_method||'-'}</td>
            <td><b>${r.total.toLocaleString('ar')} د.ع</b></td>
            <td><span class="badge ${r.status==='مدفوعة'?'paid':(r.status==='مدفوعة جزئياً'?'partial':'unpaid')}">${r.status}</span></td>
            <td>
              <button class="btn small" onclick="reprintInvoice(${r.id})">🖨️</button>
              <button class="btn small secondary" onclick="viewPaymentHistory(${r.id}, '${r.invoice_number}', ${r.total})">📜 التفاصيل</button>
              ${r.status!=='مدفوعة' ? `<button class="btn small secondary" onclick="collectPayment(${r.id}, ${r.total}, ${r.paid_amount}, runReport)">💰 تسديد</button>` : ''}
            </td>
          </tr>
        `).join('')}</tbody>
      </table>
    `;
  } else if (CURRENT_REPORT_TYPE === 'exams') {
    box.innerHTML = `
      <table>
        <thead><tr><th>التاريخ</th><th>المريض</th><th>الفاحص</th><th>التشخيص</th><th></th></tr></thead>
        <tbody>${rows.map(r => `
          <tr>
            <td>${(r.exam_date||'').split(' ')[0]}</td>
            <td>${r.patient_name||'-'}</td>
            <td>${r.employee_name||'-'}</td>
            <td>${r.diagnosis||'-'}</td>
            <td><button class="btn small" onclick='printExamReport(${JSON.stringify(r).replace(/'/g, "&apos;")})'>🖨️</button></td>
          </tr>
        `).join('')}</tbody>
      </table>
    `;
  } else {
    box.innerHTML = `
      <table>
        <thead><tr><th>العميل</th><th>الجوال</th><th>المبلغ المستحق</th><th></th></tr></thead>
        <tbody>${rows.map(r => `
          <tr>
            <td>${r.full_name}</td>
            <td>${r.phone || '-'}</td>
            <td><b style="color:#dc2626">${r.balance.toLocaleString('ar')} د.ع</b></td>
            <td><button class="btn small" onclick="goToPatientInvoices('${r.full_name.replace(/'/g,"")}')">عرض فواتيره</button></td>
          </tr>
        `).join('')}</tbody>
      </table>
    `;
  }
}

async function goToPatientInvoices(patientName) {
  document.getElementById('r-type').value = 'invoices';
  await runReport();
  document.getElementById('r-search').value = patientName;
  filterReportRows();
}

function printCurrentReport() {
  if (!CURRENT_REPORT_ROWS.length) { alert('لا توجد بيانات لطباعتها'); return; }
  API.get('/api/settings').then(settings => {
    let html;
    if (CURRENT_REPORT_TYPE === 'invoices') {
      html = buildReportHtml('تقرير المبيعات', CURRENT_REPORT_ROWS.map(r => ({...r, invoice_date:(r.invoice_date||'').split(' ')[0]})), [
        { key: 'invoice_number', label: 'رقم الفاتورة' },
        { key: 'invoice_date', label: 'التاريخ' },
        { key: 'patient_name', label: 'العميل' },
        { key: 'employee_name', label: 'الموظف' },
        { key: 'total', label: 'الإجمالي' },
        { key: 'status', label: 'الحالة' },
      ], settings);
    } else {
      html = buildReportHtml('تقرير فحوصات النظر', CURRENT_REPORT_ROWS.map(r => ({...r, exam_date:(r.exam_date||'').split(' ')[0]})), [
        { key: 'exam_date', label: 'التاريخ' },
        { key: 'patient_name', label: 'المريض' },
        { key: 'employee_name', label: 'الفاحص' },
        { key: 'diagnosis', label: 'التشخيص' },
      ], settings);
    }
    window.desktop.printPreview({ htmlContent: html, title: 'التقرير' });
  });
}
