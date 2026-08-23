async function renderSettingsTab(container) {
  const settings = await API.get('/api/settings');
  const local = await window.desktop.getLocalMode();
  container.innerHTML = `
    <div class="card">
      <h2>🏥 بيانات العيادة</h2>
      <div class="grid-2">
        <div class="form-group"><label>اسم العيادة</label><input id="st-clinic-name" value="${settings.clinic_name || ''}"></div>
        <div class="form-group"><label>رقم الهاتف</label><input id="st-clinic-phone" value="${settings.clinic_phone || ''}"></div>
        <div class="form-group"><label>العنوان</label><input id="st-clinic-address" value="${settings.clinic_address || ''}"></div>
      </div>
      <button class="btn" onclick="saveClinicSettings()">حفظ بيانات العيادة</button>
    </div>

    <div class="card">
      <h2>🖨️ إعدادات الطابعة الحرارية</h2>
      <div class="grid-2">
        <div class="form-group"><label>نوع الاتصال</label>
          <select id="st-printer-interface" onchange="onPrinterInterfaceChange()">
            <option value="usb" ${settings.printer_interface==='usb'?'selected':''}>USB (طابعة مثبّتة على ويندوز)</option>
            <option value="network" ${settings.printer_interface==='network'?'selected':''}>شبكة (عنوان IP)</option>
          </select>
        </div>
        <div class="form-group"><label>عنوان/اسم الطابعة</label>
          <input id="st-printer-address" value="${settings.printer_address || ''}" placeholder="مثال: 192.168.1.50:9100 أو اسم الطابعة بالضبط">
        </div>
      </div>
      <div id="printer-discovery-box" style="margin-bottom:12px"></div>
      <div class="hint" style="margin-bottom:12px">
        <b>USB:</b> اضغط "اكتشاف الطابعات المثبّتة" واختر طابعتك من القائمة مباشرة بدل كتابة الاسم يدويًا. <b>الشبكة:</b> أدخل عنوان الـ IP الخاص بالطابعة يدويًا (مثال: 192.168.1.50:9100).
      </div>

      <div class="grid-2">
        <div class="form-group"><label>وضع الطباعة الحرارية</label>
          <select id="st-thermal-mode" onchange="onThermalModeChange()">
            <option value="image" ${(!settings.thermal_print_mode || settings.thermal_print_mode==='image')?'selected':''}>🖼️ صورة (موصى به — يضمن اتصال الحروف دائمًا)</option>
            <option value="text" ${settings.thermal_print_mode==='text'?'selected':''}>📝 نصي (أسرع — يعتمد على دعم الطابعة للتشكيل التلقائي)</option>
          </select>
        </div>
        <div class="form-group" id="thermal-codepage-group" style="${settings.thermal_print_mode==='text'?'':'display:none'}">
          <label>رقم جدول الحروف (من نتيجة اختبار جداول الحروف أدناه)</label>
          <input id="st-thermal-codepage" type="number" min="0" max="255" value="${settings.thermal_code_page || 37}" placeholder="مثال: 37">
        </div>
      </div>
      <div class="hint" style="margin-bottom:12px" id="thermal-mode-hint">
        ${settings.thermal_print_mode==='text'
          ? 'الوضع النصي أسرع لكنه يعتمد على أن الطابعة تدعم اتصال الحروف العربية تلقائيًا في جدولها الداخلي. إذا ظهرت الحروف متقطّعة بالفاتورة، ارجع لوضع "صورة".'
          : 'الوضع الافتراضي والأكثر أمانًا؛ لا يحتاج ضبط رقم جدول الحروف.'}
      </div>

      <button class="btn" onclick="savePrinterSettings()">حفظ إعدادات الطابعة</button>
      <button class="btn secondary" onclick="testThermalPrinterConnection()">🔎 اختبار الاتصال بالطابعة</button>
      <button class="btn secondary" onclick="testCharacterTables()">🔍 اختبار جداول الحروف (لإصلاح اللغة العربية)</button>
      <button class="btn secondary" onclick="testTextModePrint()">📝 طباعة إيصال تجريبي بالوضع النصي</button>
      <div class="hint" style="margin-top:10px">
        اختبار جداول الحروف يطبع ورقة طويلة فيها نفس الجملة العربية مكررة تحت كل رقم من CP0 إلى CP47 (وCP255) —
        بعد الطباعة، ابحث عن الرقم اللي طبعت تحته الجملة العربية بشكل صحيح ومتصل، وأدخله في حقل "رقم جدول الحروف" أعلاه إذا اخترت الوضع النصي.
        <br><b>للطباعة عبر USB (في وضعَي النصي واختبار الجداول):</b> يجب تفعيل خيار "مشاركة الطابعة" من خصائص الطابعة بويندوز.
      </div>
    </div>

    <div class="card">
      <h2>🖨️ طرق الطباعة المتاحة عند إتمام البيع</h2>
      <div class="hint" style="margin-bottom:10px">فعّل فقط الطرق المستخدمة فعليًا في عيادتك؛ الطرق غير المفعّلة لن تظهر في نافذة اختيار الطباعة بعد كل عملية بيع.</div>
      <div class="grid-3" style="margin-bottom:10px">
        <label style="font-size:13px;display:flex;align-items:center;gap:6px"><input type="checkbox" id="st-print-regular" ${settings.print_regular_enabled!=='0'?'checked':''}> طباعة عادية (A4/A5)</label>
        <label style="font-size:13px;display:flex;align-items:center;gap:6px"><input type="checkbox" id="st-print-thermal80" ${settings.print_thermal80_enabled!=='0'?'checked':''}> طابعة حرارية 80مم</label>
        <label style="font-size:13px;display:flex;align-items:center;gap:6px"><input type="checkbox" id="st-print-thermal58" ${settings.print_thermal58_enabled==='1'?'checked':''}> طابعة حرارية 58مم</label>
      </div>
      <div class="form-group" style="max-width:380px">
        <label>الطابعة الافتراضية عند إتمام البيع</label>
        <select id="st-default-print-method">
          <option value="ask" ${(!settings.default_print_method || settings.default_print_method==='ask')?'selected':''}>❓ اسألني في كل مرة (تظهر نافذة الاختيار)</option>
          <option value="regular" ${settings.default_print_method==='regular'?'selected':''}>🖨️ طباعة عادية مباشرة (بدون سؤال)</option>
          <option value="thermal80" ${settings.default_print_method==='thermal80'?'selected':''}>🧾 طباعة حرارية 80مم مباشرة (بدون سؤال)</option>
          <option value="thermal58" ${settings.default_print_method==='thermal58'?'selected':''}>🧾 طباعة حرارية 58مم مباشرة (بدون سؤال)</option>
        </select>
      </div>
      <div class="hint" style="margin-bottom:12px">إذا اخترت طريقة محددة، ستُطبع الفاتورة بها تلقائيًا فور إتمام البيع دون ظهور أي نافذة اختيار.</div>
      <button class="btn" onclick="savePrintMethodSettings()">حفظ طرق الطباعة</button>
    </div>

    <div class="card">
      <h2>💵 العملة الافتراضية للفواتير</h2>
      <div class="hint" style="margin-bottom:10px">تُطبَّق هذه العملة تلقائيًا على كل فاتورة جديدة من شاشة المبيعات.</div>
      <div class="form-group" style="max-width:320px">
        <label>عملة الفوترة</label>
        <select id="st-default-currency">
          <option value="IQD" ${(!settings.invoice_currency || settings.invoice_currency==='IQD')?'selected':''}>دينار عراقي (د.ع)</option>
          <option value="USD" ${settings.invoice_currency==='USD'?'selected':''}>دولار أمريكي ($)</option>
        </select>
      </div>
      <button class="btn" onclick="saveDefaultCurrencySettings()">حفظ العملة الافتراضية</button>
    </div>

    <div class="card">
      <h2>🔠 حجم خط واجهة البرنامج</h2>
      <div class="hint" style="margin-bottom:10px">يكبّر أو يصغّر خط كل شاشات البرنامج (غير خط الفاتورة المطبوعة).</div>
      <div class="form-group" style="max-width:320px">
        <label>حجم الخط</label>
        <select id="st-ui-fontsize" onchange="previewUiFontSize()">
          <option value="small" ${settings.ui_font_size==='small'?'selected':''}>صغير</option>
          <option value="medium" ${(!settings.ui_font_size || settings.ui_font_size==='medium')?'selected':''}>متوسط (افتراضي)</option>
          <option value="large" ${settings.ui_font_size==='large'?'selected':''}>كبير</option>
          <option value="xlarge" ${settings.ui_font_size==='xlarge'?'selected':''}>كبير جدًا</option>
        </select>
      </div>
      <button class="btn" onclick="saveUiFontSizeSettings()">حفظ حجم الخط</button>
    </div>

    <div class="card">
      <h2>🧾 تخصيص شكل الفاتورة (الطباعة العادية)</h2>
      <div class="grid-3">
        <div class="form-group"><label>حجم الخط</label>
          <select id="st-inv-fontsize">
            <option value="small" ${settings.invoice_font_size==='small'?'selected':''}>صغير</option>
            <option value="medium" ${(!settings.invoice_font_size || settings.invoice_font_size==='medium')?'selected':''}>متوسط</option>
            <option value="large" ${settings.invoice_font_size==='large'?'selected':''}>كبير</option>
          </select>
        </div>
        <div class="form-group"><label>محاذاة النص</label>
          <select id="st-inv-align">
            <option value="right" ${(!settings.invoice_align || settings.invoice_align==='right')?'selected':''}>يمين</option>
            <option value="center" ${settings.invoice_align==='center'?'selected':''}>وسط</option>
            <option value="left" ${settings.invoice_align==='left'?'selected':''}>يسار</option>
          </select>
        </div>
        <div class="form-group"><label>حجم الورق</label>
          <select id="st-inv-papersize">
            <option value="a4" ${(!settings.invoice_paper_size || settings.invoice_paper_size==='a4')?'selected':''}>A4</option>
            <option value="a5" ${settings.invoice_paper_size==='a5'?'selected':''}>A5</option>
          </select>
        </div>
      </div>
      <div class="grid-2">
        <div class="form-group"><label>سعر صرف الدولار (1$ = كم دينار)</label><input id="st-exchange-rate" type="number" value="${settings.exchange_rate || 1310}"></div>
      </div>
      <div class="hint" style="margin-bottom:12px">سعر الصرف يُستخدم فقط عند تفعيل عملة الدولار كعملة افتراضية؛ الأسعار تُدخل وتُحفظ بالدينار العراقي دائمًا.</div>
      <div class="form-group"><label>شعار العيادة (اختياري)</label>
        <input type="file" id="st-inv-logo-file" accept="image/*" onchange="handleLogoUpload(event)">
        <div id="st-inv-logo-preview" style="margin-top:8px">${settings.invoice_logo ? `<img src="${settings.invoice_logo}" style="height:50px"> <button class="btn small danger" onclick="removeLogo()">إزالة الشعار</button>` : ''}</div>
      </div>
      <div class="grid-2">
        <div class="form-group"><label>نص علوي إضافي</label><input id="st-inv-header" value="${settings.invoice_header_text || ''}" placeholder="مثال: السجل الضريبي: 123456789"></div>
        <div class="form-group"><label>نص سفلي / تذييل الفاتورة</label><input id="st-inv-footer" value="${settings.invoice_footer_text || 'شكرًا لزيارتكم — نتمنى لكم دوام الصحة والعافية 🌿'}"></div>
      </div>
      <div class="grid-3" style="margin-bottom:10px">
        <label style="font-size:13px;display:flex;align-items:center;gap:6px"><input type="checkbox" id="st-inv-show-phone" ${settings.invoice_show_phone!=='0'?'checked':''}> إظهار رقم هاتف العيادة</label>
        <label style="font-size:13px;display:flex;align-items:center;gap:6px"><input type="checkbox" id="st-inv-show-address" ${settings.invoice_show_address!=='0'?'checked':''}> إظهار عنوان العيادة</label>
        <label style="font-size:13px;display:flex;align-items:center;gap:6px"><input type="checkbox" id="st-inv-show-employee" ${settings.invoice_show_employee!=='0'?'checked':''}> إظهار اسم الموظف البائع</label>
      </div>
      <button class="btn" onclick="saveInvoiceStyleSettings()">حفظ تخصيص الفاتورة</button>
      <button class="btn secondary" onclick="previewInvoiceStyle()">👁️ معاينة الفاتورة بالشكل الحالي</button>
    </div>

    <div class="card" id="backup-card">
      <h2>💾 النسخ الاحتياطي والاستعادة</h2>
      <div id="backup-content">جاري التحميل...</div>
    </div>

    <div class="card" id="license-card">
      <h2>🔑 ترخيص البرنامج</h2>
      <div id="license-content">جاري التحميل...</div>
    </div>

    <div class="card">
      <h2>🌐 إعدادات الشبكة الحالية</h2>
      <p style="font-size:13px;margin-bottom:8px">وضع هذا الجهاز: <b>${local.mode === 'server' ? 'جهاز رئيسي (خادم)' : 'جهاز عميل'}</b></p>
      ${local.mode === 'server' ? `<p style="font-size:13px">المنفذ: <b>${local.port}</b> — شارك عنوان IP الخاص بجهازك مع باقي الأجهزة (أو عنوان Radmin VPN) ليتصلوا بالمنفذ نفسه.</p>` : `<p style="font-size:13px">متصل بالخادم: <b>${local.serverAddress}</b></p>`}
      <button class="btn danger" onclick="resetNetworkMode()">إعادة ضبط وضع الجهاز (خادم/عميل)</button>
    </div>
  `;
  renderPrinterDiscoveryBox();
  renderBackupCard();
  renderLicenseCard();
}

async function renderLicenseCard() {
  const box = document.getElementById('license-content');
  if (!box) return;
  const status = await window.desktop.getLicenseStatus();
  if (status.activated) {
    box.innerHTML = `
      <p style="font-size:13px;color:#0f766e">✅ البرنامج مُفعّل بشكل دائم على هذا الجهاز.</p>
      <p style="font-size:12px;color:#888">رمز الجهاز: <span style="font-family:monospace">${status.deviceId}</span></p>
    `;
    return;
  }
  box.innerHTML = `
    <p style="font-size:13px;color:${status.daysLeft <= 1 ? '#b91c1c' : '#374151'}">
      ⏳ متبقٍّ من الفترة التجريبية: <b>${status.daysLeft}</b> يوم${status.daysLeft === 1 ? '' : (status.daysLeft === 0 ? ' (انتهت)' : '')}.
    </p>
    <div class="grid-2">
      <div class="form-group"><label>رمز هذا الجهاز (أرسله للحصول على مفتاح)</label>
        <input value="${status.deviceId}" readonly style="font-family:monospace;text-align:center">
      </div>
      <div class="form-group"><label>مفتاح التفعيل</label>
        <input id="st-license-key" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX" style="font-family:monospace;text-align:center">
      </div>
    </div>
    <button class="btn" onclick="activateLicenseFromSettings()">تفعيل البرنامج</button>
  `;
}

async function activateLicenseFromSettings() {
  const key = document.getElementById('st-license-key').value.trim();
  if (!key) { showAlertModal('الرجاء إدخال مفتاح التفعيل'); return; }
  const result = await window.desktop.activateLicense(key);
  if (!result.ok) { showAlertModal(result.error || 'مفتاح غير صحيح'); return; }
  showAlertModal('تم التفعيل بنجاح، سيُعاد تشغيل البرنامج الآن.');
  setTimeout(() => window.desktop.relaunchApp(), 900);
}

function formatBackupSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' كيلوبايت';
  return (bytes / (1024 * 1024)).toFixed(1) + ' ميجابايت';
}

function formatBackupDate(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleString('ar');
}

async function renderBackupCard() {
  const box = document.getElementById('backup-content');
  const info = await window.desktop.getBackupInfo();

  if (!info.ok) {
    box.innerHTML = `<p class="hint">${info.error}</p>`;
    return;
  }

  const autoRows = info.autoBackups.length
    ? info.autoBackups.map(b => `
        <tr>
          <td>${b.name}</td>
          <td>${formatBackupSize(b.sizeBytes)}</td>
          <td>${formatBackupDate(b.mtime)}</td>
        </tr>`).join('')
    : `<tr><td colspan="3" style="text-align:center;color:#888">لا توجد نسخ تلقائية بعد — تُنشأ نسخة واحدة تلقائيًا كل يوم عند تشغيل البرنامج.</td></tr>`;

  box.innerHTML = `
    <p style="font-size:13px;margin-bottom:10px">
      حجم قاعدة البيانات الحالية: <b>${formatBackupSize(info.sizeBytes)}</b> —
      آخر تعديل: <b>${formatBackupDate(info.lastModified)}</b>
    </p>
    <p style="font-size:12px;margin-bottom:10px;color:#555;word-break:break-all">
      📁 مسار ملف قاعدة البيانات على هذا الجهاز: <code>${info.dbPath}</code><br>
      <span style="color:#999">إذا تغيّر هذا المسار بين مرة وأخرى، فهذا يعني أن الإعدادات/البيانات تُحفظ في مكان مختلف كل مرة ولهذا تبدو أنها "ترجع للوضع الطبيعي" بعد الإغلاق.</span>
    </p>
    <div class="hint" style="margin-bottom:12px">
      يأخذ البرنامج نسخة احتياطية تلقائية يومية (يُحتفظ بآخر 14 نسخة) داخل مجلد بيانات البرنامج على هذا الجهاز.
      هذه النسخ تحميك من عطل البرنامج أو الحذف الخاطئ، لكنها <b>لا تحميك من عطل القرص الصلب نفسه</b> —
      لذلك يُنصح بأخذ نسخة يدوية بشكل دوري وحفظها في مكان آخر (فلاشة، قرص خارجي، تخزين سحابي).
    </div>
    <div class="toolbar" style="margin-bottom:14px">
      <button class="btn" onclick="createBackupNow()">📥 أخذ نسخة احتياطية الآن (احفظها بمكان تختاره)</button>
      <button class="btn secondary" onclick="openAutoBackupFolderNow()">📂 فتح مجلد النسخ التلقائية</button>
      <button class="btn danger" onclick="restoreBackupNow()">♻️ استعادة من نسخة احتياطية</button>
    </div>
    <h3 style="font-size:14px;margin-bottom:8px">آخر النسخ التلقائية على هذا الجهاز</h3>
    <table>
      <thead><tr><th>اسم الملف</th><th>الحجم</th><th>التاريخ</th></tr></thead>
      <tbody>${autoRows}</tbody>
    </table>
  `;
}

async function createBackupNow() {
  const res = await window.desktop.createBackup();
  if (res.canceled) return;
  if (res.ok) showAlertModal('✅ تم إنشاء النسخة الاحتياطية بنجاح في:\n' + res.filePath);
  else showAlertModal('❌ ' + res.error);
}

async function openAutoBackupFolderNow() {
  await window.desktop.openAutoBackupFolder();
}

async function restoreBackupNow() {
  if (!(await showConfirmModal('تحذير: ستستبدل هذه العملية كل البيانات الحالية بمحتوى النسخة الاحتياطية المختارة، وسيعاد تشغيل البرنامج تلقائيًا. هل تريد المتابعة؟'))) return;
  const res = await window.desktop.restoreBackup();
  if (res.canceled) return;
  if (!res.ok) showAlertModal('❌ ' + res.error);
  // عند النجاح سيُغلق البرنامج ويعيد التشغيل تلقائيًا من نفسه، لا حاجة لأي إجراء إضافي هنا.
}

async function saveClinicSettings() {
  try {
    await API.post('/api/settings', {
      clinic_name: document.getElementById('st-clinic-name').value,
      clinic_phone: document.getElementById('st-clinic-phone').value,
      clinic_address: document.getElementById('st-clinic-address').value,
    });
    showAlertModal('تم الحفظ بنجاح');
  } catch (e) {
    showAlertModal('❌ تعذّر الحفظ:\n' + e.message);
  }
}

async function savePrinterSettings() {
  try {
    await API.post('/api/settings', {
      printer_interface: document.getElementById('st-printer-interface').value,
      printer_address: document.getElementById('st-printer-address').value,
      thermal_print_mode: document.getElementById('st-thermal-mode').value,
      thermal_code_page: document.getElementById('st-thermal-codepage').value,
    });
    showAlertModal('تم حفظ إعدادات الطابعة');
  } catch (e) {
    showAlertModal('❌ تعذّر حفظ إعدادات الطابعة:\n' + e.message);
  }
}

function onThermalModeChange() {
  const mode = document.getElementById('st-thermal-mode').value;
  document.getElementById('thermal-codepage-group').style.display = mode === 'text' ? '' : 'none';
  document.getElementById('thermal-mode-hint').innerHTML = mode === 'text'
    ? 'الوضع النصي أسرع لكنه يعتمد على أن الطابعة تدعم اتصال الحروف العربية تلقائيًا في جدولها الداخلي. إذا ظهرت الحروف متقطّعة بالفاتورة، ارجع لوضع "صورة".'
    : 'الوضع الافتراضي والأكثر أمانًا؛ لا يحتاج ضبط رقم جدول الحروف.';
}

async function testTextModePrint() {
  const interfaceType = document.getElementById('st-printer-interface').value;
  const address = document.getElementById('st-printer-address').value;
  const codePage = parseInt(document.getElementById('st-thermal-codepage').value) || 37;
  if (!address || !address.trim()) { showAlertModal('الرجاء إدخال عنوان/اسم الطابعة أولًا'); return; }
  const settings = await API.get('/api/settings');
  const sampleInvoice = {
    invoice_number: 'TEST-' + Date.now(),
    invoice_date: new Date().toLocaleString('ar'),
    patient_name: 'مريض تجريبي',
    items: [{ description: 'عدسة طبية', qty: 1, unit_price: 45000, total: 45000 }],
    subtotal: 45000, discount: 0, total: 45000, paid_amount: 45000,
    currency: 'IQD', exchange_rate: settings.exchange_rate || 1310,
  };
  const res = await window.desktop.printThermalText({ invoice: sampleInvoice, clinic: settings, interfaceType, address, codePage, width: 80 });
  if (res.ok) showAlertModal('✅ تم إرسال الإيصال التجريبي. تحقق من الطباعة الفعلية.');
  else showAlertModal('❌ تعذّرت الطباعة النصية:\n' + res.error);
}

function onPrinterInterfaceChange() { renderPrinterDiscoveryBox(); }

function renderPrinterDiscoveryBox() {
  const box = document.getElementById('printer-discovery-box');
  const iface = document.getElementById('st-printer-interface').value;
  if (iface === 'usb') {
    box.innerHTML = `<button class="btn small secondary" onclick="discoverPrinters()">🔍 اكتشاف الطابعات المثبّتة على هذا الجهاز</button><div id="printer-discovery-results" style="margin-top:8px"></div>`;
  } else {
    box.innerHTML = '';
  }
}

async function discoverPrinters() {
  const resultsBox = document.getElementById('printer-discovery-results');
  resultsBox.innerHTML = '⏳ جاري البحث عن الطابعات...';
  const res = await window.desktop.listPrinters();
  if (!res.ok) { resultsBox.innerHTML = `<span style="color:#dc2626;font-size:12px">${res.error}</span>`; return; }
  if (!res.printers.length) { resultsBox.innerHTML = `<span style="color:#dc2626;font-size:12px">لم يتم العثور على أي طابعة مثبّتة على هذا الجهاز.</span>`; return; }
  resultsBox.innerHTML = `
    <label style="font-size:12px;color:#555">اختر الطابعة من القائمة:</label>
    <select onchange="document.getElementById('st-printer-address').value=this.value" style="width:100%;padding:9px 10px;border:1px solid #ddd;border-radius:8px;font-size:13px">
      <option value="">-- اختر --</option>
      ${res.printers.map(name => `<option value="${name}">${name}</option>`).join('')}
    </select>
  `;
}

async function testThermalPrinterConnection() {
  const interfaceType = document.getElementById('st-printer-interface').value;
  const address = document.getElementById('st-printer-address').value;
  const res = await window.desktop.testPrinterConnection({ interfaceType, address });
  if (res.ok) showAlertModal('✅ ' + res.message);
  else showAlertModal('❌ ' + res.error);
}

async function testCharacterTables() {
  const interfaceType = document.getElementById('st-printer-interface').value;
  const address = document.getElementById('st-printer-address').value;
  if (!address || !address.trim()) { showAlertModal('الرجاء إدخال عنوان/اسم الطابعة أولًا'); return; }
  if (!(await showConfirmModal('سيتم طباعة ورقة طويلة نسبيًا (49 سطر اختبار). هل تريد المتابعة؟'))) return;
  const res = await window.desktop.testCodePages({ interfaceType, address });
  if (res.ok) showAlertModal('✅ تم إرسال اختبار جداول الحروف للطابعة. راجع الورقة المطبوعة وحدد الرقم الذي ظهرت تحته الجملة العربية بشكل صحيح.');
  else showAlertModal('❌ تعذّر تنفيذ الاختبار:\n' + res.error);
}

async function savePrintMethodSettings() {
  const regular = document.getElementById('st-print-regular').checked;
  const thermal80 = document.getElementById('st-print-thermal80').checked;
  const thermal58 = document.getElementById('st-print-thermal58').checked;
  if (!regular && !thermal80 && !thermal58) { showAlertModal('يجب تفعيل طريقة طباعة واحدة على الأقل'); return; }
  let defaultMethod = document.getElementById('st-default-print-method').value;
  if ((defaultMethod === 'regular' && !regular) || (defaultMethod === 'thermal80' && !thermal80) || (defaultMethod === 'thermal58' && !thermal58)) defaultMethod = 'ask';
  await API.post('/api/settings', {
    print_regular_enabled: regular ? '1' : '0',
    print_thermal80_enabled: thermal80 ? '1' : '0',
    print_thermal58_enabled: thermal58 ? '1' : '0',
    default_print_method: defaultMethod,
  });
  showAlertModal('تم حفظ طرق الطباعة المتاحة');
}

async function saveDefaultCurrencySettings() {
  await API.post('/api/settings', { invoice_currency: document.getElementById('st-default-currency').value });
  showAlertModal('تم حفظ العملة الافتراضية للفواتير');
}

function previewUiFontSize() {
  applyUiFontSizeClass(document.getElementById('st-ui-fontsize').value);
}

async function saveUiFontSizeSettings() {
  const val = document.getElementById('st-ui-fontsize').value;
  await API.post('/api/settings', { ui_font_size: val });
  applyUiFontSizeClass(val);
  showAlertModal('تم حفظ حجم خط الواجهة');
}

let PENDING_LOGO_DATAURL = null;

function handleLogoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    PENDING_LOGO_DATAURL = e.target.result;
    document.getElementById('st-inv-logo-preview').innerHTML = `<img src="${PENDING_LOGO_DATAURL}" style="height:50px">`;
  };
  reader.readAsDataURL(file);
}

async function removeLogo() {
  PENDING_LOGO_DATAURL = '';
  await API.post('/api/settings', { invoice_logo: '' });
  document.getElementById('st-inv-logo-preview').innerHTML = '';
}

async function saveInvoiceStyleSettings() {
  const payload = {
    invoice_font_size: document.getElementById('st-inv-fontsize').value,
    invoice_align: document.getElementById('st-inv-align').value,
    invoice_paper_size: document.getElementById('st-inv-papersize').value,
    exchange_rate: document.getElementById('st-exchange-rate').value,
    invoice_header_text: document.getElementById('st-inv-header').value,
    invoice_footer_text: document.getElementById('st-inv-footer').value,
    invoice_show_phone: document.getElementById('st-inv-show-phone').checked ? '1' : '0',
    invoice_show_address: document.getElementById('st-inv-show-address').checked ? '1' : '0',
    invoice_show_employee: document.getElementById('st-inv-show-employee').checked ? '1' : '0',
  };
  if (PENDING_LOGO_DATAURL !== null) payload.invoice_logo = PENDING_LOGO_DATAURL;
  await API.post('/api/settings', payload);
  showAlertModal('تم حفظ تخصيص الفاتورة بنجاح');
}

async function previewInvoiceStyle() {
  const settings = await API.get('/api/settings');
  const sampleInvoice = {
    invoice_number: 'INV-DEMO', invoice_date: new Date().toLocaleString('ar'),
    patient_name: 'مريض تجريبي', patient_phone: '0500000000',
    employee_name: CURRENT_USER ? CURRENT_USER.full_name : 'موظف تجريبي',
    items: [
      { description: 'عدسة طبية', qty: 1, unit_price: 45000, total: 45000 },
      { description: 'إطار نظارة', qty: 1, unit_price: 65000, total: 65000 },
    ],
    subtotal: 110000, discount: 5000, total: 105000, paid_amount: 105000, payment_method: 'نقدي', currency: 'IQD', exchange_rate: parseFloat(settings.exchange_rate) || 1310
  };
  const html = buildInvoiceHtml(sampleInvoice, settings);
  window.desktop.printPreview({ htmlContent: html, title: 'معاينة تخصيص الفاتورة' });
}

async function resetNetworkMode() {
  if (!(await showConfirmModal('سيتم إعادة تشغيل إعداد وضع الجهاز. هل أنت متأكد؟'))) return;
  await window.desktop.resetSetup();
  location.reload();
}
