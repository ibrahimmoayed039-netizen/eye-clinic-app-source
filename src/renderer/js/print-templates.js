const FONT_SIZE_MAP = { small: '12px', medium: '14px', large: '17px' };
const PAPER_SIZE_MAP = { a4: 'A4', a5: 'A5' };

function printBoilerplate(title, bodyHtml, styleOptions) {
  const opts = styleOptions || {};
  const fontSize = FONT_SIZE_MAP[opts.invoice_font_size] || FONT_SIZE_MAP.medium;
  const textAlign = opts.invoice_align || 'right';
  const paperSize = PAPER_SIZE_MAP[opts.invoice_paper_size] || 'A4';
  return `
  <!DOCTYPE html>
  <html lang="ar" dir="rtl">
  <head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    @page { size: ${paperSize}; margin: 14mm; }
    * { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; box-sizing:border-box; }
    body { padding:30px; direction:rtl; color:#111; font-size:${fontSize}; text-align:${textAlign}; }
    .header { text-align:center; margin-bottom:20px; border-bottom:2px solid #0f766e; padding-bottom:12px; }
    .header img.logo { max-height:60px; margin-bottom:8px; }
    .header h1 { color:#0f766e; font-size:calc(${fontSize} + 8px); }
    table { width:100%; border-collapse:collapse; margin:14px 0; font-size:${fontSize}; }
    th, td { border:1px solid #ddd; padding:8px; text-align:center; }
    th { background:#f4f6f7; }
    .totals { text-align:${textAlign==='right' ? 'left' : textAlign}; margin-top:10px; font-size:${fontSize}; }
    .totals .grand { font-size:calc(${fontSize} + 4px); font-weight:700; color:#0f766e; }
    .footer { margin-top:30px; text-align:center; font-size:calc(${fontSize} - 2px); color:#888; }
    .print-bar { text-align:center; margin-bottom:20px; }
    .print-bar button { padding:10px 24px; background:#0f766e; color:#fff; border:none; border-radius:8px; font-size:14px; cursor:pointer; margin:0 4px; }
    @media print { .print-bar { display:none; } }
  </style>
  </head>
  <body>
    <div class="print-bar">
      <button onclick="window.print()">🖨️ طباعة الآن</button>
      <button onclick="window.close()" style="background:#6b7280">إغلاق المعاينة</button>
    </div>
    ${bodyHtml}
  </body>
  </html>
  `;
}

function buildInvoiceHtml(invoice, settings) {
  const s = settings || {};
  const isUSD = invoice.currency === 'USD';
  const rate = invoice.exchange_rate || 1310;
  const conv = (n) => isUSD ? (n / rate) : n;
  const currency = isUSD ? '$' : (s.currency_symbol || 'د.ع');
  const decimals = isUSD ? 2 : (s.invoice_decimals === '2' ? 2 : 0);
  const fmt = (n) => Number(conv(n)).toLocaleString('ar', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + ' ' + currency;
  const showPhone = s.invoice_show_phone !== '0';
  const showAddress = s.invoice_show_address !== '0';
  const showEmployee = s.invoice_show_employee !== '0';

  const body = `
    <div class="header">
      ${s.invoice_logo ? `<img class="logo" src="${s.invoice_logo}">` : ''}
      <h1>${s.clinic_name || 'فاتورة مبيعات'}</h1>
      ${showPhone && s.clinic_phone ? `<p>${s.clinic_phone}</p>` : ''}
      ${showAddress && s.clinic_address ? `<p>${s.clinic_address}</p>` : ''}
      ${s.invoice_header_text ? `<p>${s.invoice_header_text}</p>` : ''}
      <p>رقم الفاتورة: ${invoice.invoice_number} | التاريخ: ${(invoice.invoice_date||'').split('.')[0]}</p>
    </div>
    <p><b>العميل:</b> ${invoice.patient_name || 'عميل نقدي'} ${invoice.patient_phone ? '- ' + invoice.patient_phone : ''}</p>
    ${showEmployee ? `<p><b>الموظف:</b> ${invoice.employee_name || '-'}</p>` : ''}
    <table>
      <thead><tr><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
      <tbody>
        ${invoice.items.map(it => `<tr><td>${it.description}</td><td>${it.qty}</td><td>${fmt(it.unit_price)}</td><td>${fmt(it.total)}</td></tr>`).join('')}
      </tbody>
    </table>
    <div class="totals">
      <p>الإجمالي الفرعي: ${fmt(invoice.subtotal)}</p>
      <p>الخصم: ${fmt(invoice.discount)}</p>
      <p class="grand">الإجمالي الكلي: ${fmt(invoice.total)}</p>
      <p>المدفوع: ${fmt(invoice.paid_amount)} | طريقة الدفع: ${invoice.payment_method}</p>
      ${isUSD ? `<p style="font-size:12px;color:#777">(سعر الصرف المعتمد: 1$ = ${rate.toLocaleString('ar')} د.ع)</p>` : ''}
    </div>
    <div class="footer">${s.invoice_footer_text || 'شكرًا لزيارتكم — نتمنى لكم دوام الصحة والعافية 🌿'}</div>
  `;
  return printBoilerplate('فاتورة ' + invoice.invoice_number, body, s);
}

function buildPurchaseInvoiceHtml(purchase, settings) {
  const s = settings || {};
  const fmt = (n) => Number(n).toLocaleString('ar', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' ' + (s.currency_symbol || 'د.ع');
  const body = `
    <div class="header">
      ${s.invoice_logo ? `<img class="logo" src="${s.invoice_logo}">` : ''}
      <h1>فاتورة مشتريات</h1>
      ${s.clinic_name ? `<p>${s.clinic_name}</p>` : ''}
      <p>رقم الفاتورة: ${purchase.purchase_number} | التاريخ: ${(purchase.purchase_date||'').split('.')[0]}</p>
    </div>
    <p><b>المورد:</b> ${purchase.supplier_name || '-'} ${purchase.supplier_phone ? '- ' + purchase.supplier_phone : ''}</p>
    <p><b>الموظف:</b> ${purchase.employee_name || '-'}</p>
    <table>
      <thead><tr><th>الصنف</th><th>الكمية</th><th>سعر التكلفة</th><th>الإجمالي</th></tr></thead>
      <tbody>
        ${purchase.items.map(it => `<tr><td>${it.description}</td><td>${it.qty}</td><td>${fmt(it.unit_cost)}</td><td>${fmt(it.total)}</td></tr>`).join('')}
      </tbody>
    </table>
    <div class="totals">
      <p>الإجمالي الفرعي: ${fmt(purchase.subtotal)}</p>
      <p>الخصم: ${fmt(purchase.discount)}</p>
      <p class="grand">الإجمالي الكلي: ${fmt(purchase.total)}</p>
      <p>المدفوع: ${fmt(purchase.paid_amount)} | المتبقي: ${fmt(purchase.total - purchase.paid_amount)}</p>
    </div>
    ${purchase.notes ? `<p><b>ملاحظات:</b> ${purchase.notes}</p>` : ''}
    <div class="footer">تم إنشاء هذه الفاتورة آليًا بواسطة نظام إدارة عيادة النظر</div>
  `;
  return printBoilerplate('فاتورة مشتريات ' + purchase.purchase_number, body, s);
}

function buildSpecialOrderReceiptHtml(order, settings) {
  const s = settings || {};
  const fmt = (n) => Number(n).toLocaleString('ar', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' ' + (s.currency_symbol || 'د.ع');
  const body = `
    <div class="header">
      ${s.invoice_logo ? `<img class="logo" src="${s.invoice_logo}">` : ''}
      <h1>إيصال طلب خاص</h1>
      ${s.clinic_name ? `<p>${s.clinic_name}</p>` : ''}
      <p>الرقم المرجعي: ${order.order_number} | التاريخ: ${(order.order_date || '').split('.')[0]}</p>
    </div>
    <p><b>اسم الزبون:</b> ${order.customer_name} ${order.customer_phone ? '- ' + order.customer_phone : ''}</p>
    <p><b>القطعة المطلوبة:</b> ${order.item_description}</p>
    ${order.supplier_name ? `<p><b>المورد المتوقع:</b> ${order.supplier_name}</p>` : ''}
    <p><b>السعر المتوقع:</b> ${fmt(order.expected_price)}</p>
    <p><b>العربون المدفوع:</b> ${fmt(order.deposit_amount)}</p>
    ${order.notes ? `<p><b>ملاحظات:</b> ${order.notes}</p>` : ''}
    <div class="footer">احتفظ بهذا الإيصال لاستلام القطعة عند وصولها — استخدم الرقم المرجعي أعلاه</div>
  `;
  return printBoilerplate('إيصال طلب خاص ' + order.order_number, body, s);
}

function buildExamReportHtml(exam, settings) {
  const s = settings || {};
  const body = `
    <div class="header">
      ${s.invoice_logo ? `<img class="logo" src="${s.invoice_logo}">` : ''}
      <h1>تقرير فحص النظر</h1>
      <p>التاريخ: ${(exam.exam_date||'').split(' ')[0]} | الفاحص: ${exam.employee_name || '-'}</p>
    </div>
    <p><b>اسم المريض:</b> ${exam.patient_name}</p>
    <table>
      <thead><tr><th>العين</th><th>حدة الإبصار قبل الفحص</th><th>حدة الإبصار بعد الفحص (مع النظارة)</th></tr></thead>
      <tbody>
        <tr><td>اليمنى (OD)</td><td>${exam.od_va_before||'-'}</td><td>${exam.od_va_after||'-'}</td></tr>
        <tr><td>اليسرى (OS)</td><td>${exam.os_va_before||'-'}</td><td>${exam.os_va_after||'-'}</td></tr>
      </tbody>
    </table>
    <table>
      <thead><tr><th>العين</th><th>SPH</th><th>CYL</th><th>AXIS</th><th>PD</th><th>ADD</th></tr></thead>
      <tbody>
        <tr><td>اليمنى (OD)</td><td>${exam.od_sph||'-'}</td><td>${exam.od_cyl||'-'}</td><td>${exam.od_axis||'-'}</td><td>${exam.od_pd||'-'}</td><td>${exam.od_add||'-'}</td></tr>
        <tr><td>اليسرى (OS)</td><td>${exam.os_sph||'-'}</td><td>${exam.os_cyl||'-'}</td><td>${exam.os_axis||'-'}</td><td>${exam.os_pd||'-'}</td><td>${exam.os_add||'-'}</td></tr>
      </tbody>
    </table>
    <p><b>التشخيص:</b> ${exam.diagnosis || '-'}</p>
    <p><b>ملاحظات طبية:</b> ${exam.medical_notes || '-'}</p>
    <p><b>التوصيات:</b> ${exam.recommendations || '-'}</p>
    <p><b>موعد المراجعة القادم:</b> ${exam.next_visit_date || '-'}</p>
    <div class="footer">${s.invoice_footer_text || 'نتمنى لكم دوام الصحة والعافية 🌿'}</div>
  `;
  return printBoilerplate('تقرير فحص', body, s);
}

function buildReportHtml(title, rows, columns, settings) {
  const s = settings || {};
  const body = `
    <div class="header">
      ${s.invoice_logo ? `<img class="logo" src="${s.invoice_logo}">` : ''}
      <h1>${title}</h1><p>تاريخ الطباعة: ${new Date().toLocaleString('ar')}</p>
    </div>
    <table>
      <thead><tr>${columns.map(c => `<th>${c.label}</th>`).join('')}</tr></thead>
      <tbody>
        ${rows.map(r => `<tr>${columns.map(c => `<td>${r[c.key] ?? '-'}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table>
    <div class="footer">تم إنشاء هذا التقرير آليًا بواسطة نظام إدارة عيادة النظر</div>
  `;
  return printBoilerplate(title, body, s);
}

function buildThermalReceiptHtml(invoice, settings, width) {
  const s = settings || {};
  const isUSD = invoice.currency === 'USD';
  const rate = invoice.exchange_rate || 1310;
  const conv = (n) => isUSD ? (n / rate) : n;
  const cur = isUSD ? '$' : (s.currency_symbol || 'د.ع');
  const decimals = isUSD ? 2 : 0;
  const fmt = (n) => Number(conv(n)).toLocaleString('ar', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + ' ' + cur;
  const isSmall = width !== 80;
  const baseFont = isSmall ? '22px' : '26px';
  const smallFont = isSmall ? '18px' : '21px';

  return `
  <!DOCTYPE html>
  <html lang="ar" dir="rtl">
  <head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing:border-box; margin:0; padding:0; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; }
    html, body { width:100%; background:#fff; color:#000; }
    body { padding:14px 10px; direction:rtl; text-align:center; font-size:${baseFont}; line-height:1.5; }
    .clinic-name { font-weight:700; font-size:calc(${baseFont} + 4px); margin-bottom:4px; }
    .divider { border-top:2px dashed #000; margin:8px 0; }
    .row-info { text-align:right; font-size:${smallFont}; margin:2px 0; }
    .items { text-align:right; margin:8px 0; }
    .item-row { display:flex; justify-content:space-between; font-size:${smallFont}; margin:4px 0; }
    .item-name { flex:1; padding-left:8px; }
    .totals { text-align:right; margin-top:8px; }
    .totals .line { display:flex; justify-content:space-between; font-size:${smallFont}; margin:3px 0; }
    .totals .grand { font-weight:700; font-size:calc(${baseFont} + 2px); border-top:1px solid #000; padding-top:6px; margin-top:6px; }
    .footer { margin-top:12px; font-size:${smallFont}; }
  </style>
  </head>
  <body>
    ${s.invoice_logo ? `<div style="margin-bottom:6px"><img src="${s.invoice_logo}" style="max-height:70px"></div>` : ''}
    <div class="clinic-name">${s.clinic_name || 'عيادة فحص النظر'}</div>
    ${s.clinic_phone ? `<div class="row-info" style="text-align:center">${s.clinic_phone}</div>` : ''}
    <div class="divider"></div>
    <div class="row-info">رقم الفاتورة: ${invoice.invoice_number}</div>
    <div class="row-info">التاريخ: ${(invoice.invoice_date || '').split('.')[0]}</div>
    ${invoice.patient_name ? `<div class="row-info">العميل: ${invoice.patient_name}</div>` : ''}
    <div class="divider"></div>
    <div class="items">
      ${invoice.items.map(it => `
        <div class="item-row"><span class="item-name">${it.description} × ${it.qty}</span><span>${fmt(it.qty * it.unit_price)}</span></div>
      `).join('')}
    </div>
    <div class="divider"></div>
    <div class="totals">
      <div class="line"><span>الإجمالي الفرعي</span><span>${fmt(invoice.subtotal)}</span></div>
      ${invoice.discount ? `<div class="line"><span>الخصم</span><span>${fmt(invoice.discount)}</span></div>` : ''}
      <div class="line grand"><span>الإجمالي الكلي</span><span>${fmt(invoice.total)}</span></div>
      <div class="line"><span>المدفوع</span><span>${fmt(invoice.paid_amount)}</span></div>
    </div>
    <div class="footer">${s.invoice_footer_text || 'شكرًا لزيارتكم 🌿'}</div>
  </body>
  </html>
  `;
}

function buildStatementHtml(title, statement, settings) {
  const s = settings || {};
  const fmt = (n) => Number(n).toLocaleString('ar') + ' د.ع';
  const body = `
    <div class="header">
      ${s.invoice_logo ? `<img class="logo" src="${s.invoice_logo}">` : ''}
      <h1>كشف حساب: ${title}</h1>
      <p>الفترة: ${statement.from ? statement.from : 'بداية السجل'} إلى ${statement.to ? statement.to : 'اليوم'}</p>
    </div>
    <p><b>الرصيد الافتتاحي (قبل هذه الفترة):</b> ${fmt(statement.opening_balance)}</p>
    <table>
      <thead><tr><th>التاريخ</th><th>البيان</th><th>مدين (عليه)</th><th>دائن (له)</th><th>الرصيد بعد الحركة</th></tr></thead>
      <tbody>
        ${statement.entries.length ? statement.entries.map(e => `
          <tr>
            <td>${(e.date||'').split(' ')[0]}</td>
            <td>${e.description}</td>
            <td>${e.debit ? fmt(e.debit) : '-'}</td>
            <td>${e.credit ? fmt(e.credit) : '-'}</td>
            <td>${fmt(e.balance)}</td>
          </tr>
        `).join('') : '<tr><td colspan="5" style="text-align:center;color:#999">لا توجد حركات خلال هذه الفترة</td></tr>'}
      </tbody>
    </table>
    <div class="totals">
      <p class="grand">الرصيد الختامي: ${fmt(statement.closing_balance)}</p>
    </div>
    <div class="footer">تم إنشاء هذا الكشف آليًا بواسطة نظام إدارة عيادة النظر بتاريخ ${new Date().toLocaleString('ar')}</div>
  `;
  return printBoilerplate('كشف حساب - ' + title, body, s);
}
