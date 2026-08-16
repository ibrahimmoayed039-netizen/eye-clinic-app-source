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

// نافذة إدخال نص مخصصة — بديل ضروري لأن window.prompt() غير مدعوم فعليًا في Electron
// (على عكس alert() و confirm() المدعومتين عبر نوافذ نظام حقيقية)
function showPromptModal(title, defaultValue) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="width:380px">
        <h3>${title}</h3>
        <div class="form-group"><input id="prompt-modal-input" value="${defaultValue !== undefined && defaultValue !== null ? defaultValue : ''}"></div>
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
    overlay.querySelector('#prompt-modal-ok').onclick = () => cleanup(input.value);
    overlay.querySelector('#prompt-modal-cancel').onclick = () => cleanup(null);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') cleanup(input.value);
      if (e.key === 'Escape') cleanup(null);
    });
  });
}

function buildTabs() {
  const el = document.getElementById('tabs');
  el.innerHTML = TABS.map(t => `<button class="tab-btn" id="tabbtn-${t.id}" onclick="switchTab('${t.id}')">${t.label}</button>`).join('');
}

function switchTab(id) {
  activeTab = id;
  TABS.forEach(t => document.getElementById(`tabbtn-${t.id}`).className = 'tab-btn' + (t.id === id ? ' active' : ''));
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
