let CURRENT_USER = null;

const TABS = [
  { id: 'patients', label: '👤 المرضى', render: renderPatientsTab },
  { id: 'exams', label: '👁️ فحص النظر', render: renderExamsTab },
  { id: 'products', label: '📦 المنتجات', render: renderProductsTab },
  { id: 'sales', label: '🧾 المبيعات', render: renderSalesTab },
  { id: 'suppliers', label: '🏢 الموردين', render: renderSuppliersTab },
  { id: 'purchases', label: '🛒 المشتريات', render: renderPurchasesTab },
  { id: 'special-orders', label: '📋 الطلبات الخاصة', render: renderSpecialOrdersTab },
  { id: 'cashbox', label: '💰 الصندوق والمصاريف', render: renderCashboxTab },
  { id: 'inventory', label: '📋 الجرد', render: renderInventoryTab },
  { id: 'reports', label: '📊 التقارير', render: renderReportsTab },
  { id: 'employees', label: '🧑‍💼 الموظفين', render: renderEmployeesTab },
  { id: 'settings', label: '⚙️ الإعدادات', render: renderSettingsTab },
  { id: 'about', label: 'ℹ️ حول البرنامج', render: renderAboutTab },
];

let activeTab = 'patients';

async function doLogin() {
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  const errBox = document.getElementById('login-error');
  errBox.textContent = '';
  try {
    const user = await API.post('/api/login', { username, password });
    CURRENT_USER = user;
    localStorage.setItem('clinic_user', JSON.stringify(user));
    startApp();
  } catch (e) {
    errBox.textContent = e.message;
  }
}

function logout() {
  localStorage.removeItem('clinic_user');
  CURRENT_USER = null;
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
}

function startApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('current-user').textContent = `👋 ${CURRENT_USER.full_name} (${CURRENT_USER.role})`;
  document.getElementById('conn-status').textContent = `متصل بـ: ${API.base}`;
  buildTabs();
  switchTab(activeTab);
  API.get('/api/settings').then(s => applyUiFontSizeClass(s.ui_font_size || 'medium')).catch(() => {});
}

function applyUiFontSizeClass(size) {
  document.body.classList.remove('ui-font-small', 'ui-font-medium', 'ui-font-large', 'ui-font-xlarge');
  document.body.classList.add('ui-font-' + (size || 'medium'));
}

// إغلاق أعلى نافذة منبثقة مفتوحة حاليًا (الأحدث فتحًا) — مهم عند وجود نافذة فوق نافذة
// (مثال: نافذة "إضافة مريض جديد" فوق نافذة "فحص جديد")، لتفادي إغلاق النافذة الخلفية بالخطأ.
function closeTopModal() {
  const overlays = document.querySelectorAll('.modal-overlay');
  if (overlays.length) overlays[overlays.length - 1].remove();
}

// نوافذ رسائل مخصّصة (alert/confirm/prompt) بديلة عن نوافذ المتصفح الأصلية.
// السبب: نوافذ window.alert()/confirm()/prompt() الأصلية في Electron على ويندوز
// تسبب أحيانًا تعليق تركيز لوحة المفاتيح على النافذة الرئيسية بعد إغلاقها
// (خصوصًا عند عدم وجود شريط قوائم للنافذة)، فيتوقف البرنامج عن قبول أي إدخال نصوص
// بعدها حتى يضغط المستخدم بالماوس على الشاشة يدويًا. لتفادي هذه المشكلة تمامًا
// نستخدم نوافذ HTML مخصّصة بنفس شكل النظام بدلًا من الاعتماد على نوافذ المتصفح.

function showAlertModal(message) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="width:380px">
        <h3 style="white-space:pre-line">${message}</h3>
        <div class="modal-actions">
          <button class="btn" id="alert-modal-ok">حسنًا</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const okBtn = overlay.querySelector('#alert-modal-ok');
    okBtn.focus();
    const cleanup = () => { overlay.remove(); resolve(true); };
    okBtn.onclick = cleanup;
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') cleanup();
    });
  });
}

function showConfirmModal(message) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="width:380px">
        <h3 style="white-space:pre-line">${message}</h3>
        <div class="modal-actions">
          <button class="btn secondary" id="confirm-modal-cancel">إلغاء</button>
          <button class="btn" id="confirm-modal-ok">موافق</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#confirm-modal-ok').focus();
    const cleanup = (result) => { overlay.remove(); resolve(result); };
    overlay.querySelector('#confirm-modal-ok').onclick = () => cleanup(true);
    overlay.querySelector('#confirm-modal-cancel').onclick = () => cleanup(false);
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') cleanup(true);
      if (e.key === 'Escape') cleanup(false);
    });
  });
}

// نافذة إدخال نص مخصصة — بديل ضروري لأن window.prompt() غير مدعوم فعليًا في Electron
// إضافة فواصل الآلاف أثناء الكتابة بحقول المبالغ (لتسهيل قراءة الأرقام الكبيرة)
// تُستخدم مع حقول <input type="text"> عبر oninput="formatNumberInput(this)"
function formatNumberInput(el) {
  const cursorFromEnd = el.value.length - el.selectionStart;
  let raw = el.value.replace(/[^0-9.]/g, '');
  const parts = raw.split('.');
  if (parts.length > 2) raw = parts[0] + '.' + parts.slice(1).join(''); // فاصلة عشرية واحدة فقط
  const [intPart, decPart] = raw.split('.');
  const formattedInt = (intPart || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  el.value = decPart !== undefined ? `${formattedInt}.${decPart}` : formattedInt;
  const newPos = Math.max(0, el.value.length - cursorFromEnd);
  el.setSelectionRange(newPos, newPos);
}

// إزالة فواصل الآلاف وتحويل النص لرقم فعلي — تُستخدم عند قراءة قيمة الحقل للحفظ/الحساب
function unformatNumber(val) {
  return parseFloat(String(val ?? '').replace(/,/g, '')) || 0;
}

// تنسيق رقم بفواصل الآلاف لعرضه كقيمة ابتدائية داخل حقل إدخال
function fmtNum(n) {
  const num = Number(n) || 0;
  return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function showPromptModal(title, defaultValue, opts) {
  const isMoney = opts && opts.money;
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const initialValue = defaultValue !== undefined && defaultValue !== null ? defaultValue : '';
    overlay.innerHTML = `
      <div class="modal" style="width:380px">
        <h3>${title}</h3>
        <div class="form-group"><input id="prompt-modal-input" ${isMoney ? 'inputmode="decimal" oninput="formatNumberInput(this)"' : ''} value="${isMoney ? fmtNum(initialValue) : initialValue}"></div>
        <div class="modal-actions">
          <button class="btn secondary" id="prompt-modal-cancel">إلغاء</button>
          <button class="btn" id="prompt-modal-ok">موافق</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const input = overlay.querySelector('#prompt-modal-input');
    input.focus();
    input.select();
    const cleanup = (result) => { overlay.remove(); resolve(result); };
    const resolveValue = () => cleanup(isMoney ? String(unformatNumber(input.value)) : input.value);
    overlay.querySelector('#prompt-modal-ok').onclick = resolveValue;
    overlay.querySelector('#prompt-modal-cancel').onclick = () => cleanup(null);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') resolveValue();
      if (e.key === 'Escape') cleanup(null);
    });
  });
}

function buildTabs() {
  const el = document.getElementById('tabs');
  el.innerHTML = getAllowedTabs().map(t => `<button class="tab-btn" id="tabbtn-${t.id}" onclick="switchTab('${t.id}')">${t.label}</button>`).join('');
}

// التبويبات المسموح لهذا المستخدم برؤيتها: المدير دائمًا يرى الكل،
// وأي موظف لم تُحدَّد له صلاحيات بعد (permissions=null، غالبًا حسابات قديمة قبل هذه الميزة) يبقى بلا قيود أيضًا
// حفاظًا على سلوك النظام قبل الترقية.
function getAllowedTabs() {
  if (!CURRENT_USER) return [];
  if (CURRENT_USER.role === 'مدير' || !CURRENT_USER.permissions) return TABS;
  return TABS.filter(t => CURRENT_USER.permissions.includes(t.id));
}

function switchTab(id) {
  const allowed = getAllowedTabs();
  if (!allowed.find(t => t.id === id)) {
    if (!allowed.length) {
      showAlertModal('لا تملك صلاحية الوصول لأي تبويب حاليًا. الرجاء التواصل مع المدير.');
      return;
    }
    id = allowed[0].id;
  }
  activeTab = id;
  TABS.forEach(t => {
    const btn = document.getElementById(`tabbtn-${t.id}`);
    if (btn) btn.className = 'tab-btn' + (t.id === id ? ' active' : '');
  });
  const tab = TABS.find(t => t.id === id);
  tab.render(document.getElementById('content'));
}

window.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('clinic_user');
  if (saved) {
    CURRENT_USER = JSON.parse(saved);
    startApp();
  }
  document.getElementById('login-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
});
