async function renderInventoryTab(container) {
  container.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <button class="btn" onclick="startNewStockTake()">+ بدء جلسة جرد جديدة</button>
      </div>
      <div id="stocktakes-list"></div>
    </div>
  `;
  loadStockTakes();
}

async function loadStockTakes() {
  const rows = await API.get('/api/stocktakes');
  const box = document.getElementById('stocktakes-list');
  if (!rows.length) { box.innerHTML = '<div class="empty">لا توجد جلسات جرد بعد</div>'; return; }
  box.innerHTML = `
    <table>
      <thead><tr><th>#</th><th>التاريخ</th><th>الموظف</th><th>الحالة</th><th></th></tr></thead>
      <tbody>
        ${rows.map(st => `
          <tr>
            <td>${st.id}</td>
            <td>${(st.take_date||'').split(' ')[0]}</td>
            <td>${st.employee_name || '-'}</td>
            <td><span class="badge ${st.status==='مكتمل'?'paid':'partial'}">${st.status}</span></td>
            <td><button class="btn small" onclick="openStockTakeDetails(${st.id})">${st.status==='مكتمل'?'عرض':'متابعة الجرد'}</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function startNewStockTake() {
  if (!(await showConfirmModal('سيتم إنشاء جلسة جرد جديدة تشمل كل المنتجات الحالية بالمخزون. متابعة؟'))) return;
  const result = await API.post('/api/stocktakes', { employee_id: CURRENT_USER.id });
  openStockTakeDetails(result.id);
}

async function openStockTakeDetails(id) {
  const st = await API.get(`/api/stocktakes/${id}`);
  const isDone = st.status === 'مكتمل';
  const container = document.getElementById('content');
  container.innerHTML = `
    <div class="card">
      <div class="toolbar" style="justify-content:space-between">
        <h2>📦 جلسة جرد #${st.id} — ${(st.take_date||'').split(' ')[0]} ${isDone ? '(مكتملة)' : ''}</h2>
        <button class="btn secondary" onclick="renderInventoryTab(document.getElementById('content'))">◀ رجوع لكل الجلسات</button>
      </div>
      <div class="hint" style="margin-bottom:12px">${isDone ? 'هذه الجلسة مكتملة والتسويات مطبّقة على المخزون بالفعل.' : 'أدخل الكمية المعدودة فعليًا لكل منتج. اترك الحقل فارغًا إن لم تعدّه بعد.'}</div>
      <table class="eye-table">
        <thead><tr><th>المنتج</th><th>الباركود</th><th>كمية النظام</th><th>الكمية المعدودة فعليًا</th><th>الفرق</th></tr></thead>
        <tbody id="stocktake-items-body">
          ${st.items.map(it => `
            <tr>
              <td style="text-align:right">${it.product_name}</td>
              <td>${it.barcode || '-'}</td>
              <td>${it.system_qty}</td>
              <td>
                ${isDone ? (it.counted_qty ?? '-') : `<input type="number" style="width:90px" value="${it.counted_qty ?? ''}" onchange="updateStockTakeItem(${st.id}, ${it.id}, this.value, ${it.system_qty})">`}
              </td>
              <td id="diff-${it.id}" style="font-weight:600">${it.counted_qty !== null && it.counted_qty !== undefined ? formatStockDiff(it.counted_qty - it.system_qty) : '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${!isDone ? `<button class="btn" style="margin-top:16px" onclick="completeStockTake(${st.id})">✅ إنهاء الجرد وتطبيق التسويات على المخزون</button>` : ''}
    </div>
  `;
}

function formatStockDiff(diff) {
  if (diff === 0) return '<span style="color:#166534">0 (مطابق)</span>';
  if (diff > 0) return `<span style="color:#166534">+${diff} (زيادة)</span>`;
  return `<span style="color:#dc2626">${diff} (نقص)</span>`;
}

async function updateStockTakeItem(stId, itemId, value, systemQty) {
  const counted_qty = value === '' ? null : parseInt(value);
  try {
    await API.put(`/api/stocktakes/${stId}/items/${itemId}`, { counted_qty });
    const diffCell = document.getElementById(`diff-${itemId}`);
    diffCell.innerHTML = counted_qty !== null ? formatStockDiff(counted_qty - systemQty) : '-';
  } catch (err) {
    showAlertModal('تعذر حفظ الكمية المعدودة: ' + err.message);
  }
}

async function completeStockTake(id) {
  if (!(await showConfirmModal('سيتم تحديث كميات المخزون فعليًا حسب الأعداد المُدخلة. لا يمكن التراجع عن هذا الإجراء. متابعة؟'))) return;
  try {
    await API.post(`/api/stocktakes/${id}/complete`);
    showAlertModal('✅ تم إنهاء الجرد وتحديث المخزون بنجاح');
    openStockTakeDetails(id);
  } catch (err) {
    showAlertModal('تعذر إنهاء الجرد: ' + err.message);
  }
}
