let ALL_PRODUCTS_CACHE = [];
let ALL_CATEGORIES_CACHE = [];

async function renderProductsTab(container) {
  ALL_CATEGORIES_CACHE = await API.get('/api/categories');
  container.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <input id="pr-search" placeholder="بحث بالاسم أو الباركود..." style="width:220px" oninput="loadProducts()">
        <select id="pr-category-filter" onchange="loadProducts()">
          <option value="">كل الفئات</option>
          ${ALL_CATEGORIES_CACHE.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
        </select>
        <button class="btn secondary" onclick="openCategoryManager()">🏷️ إدارة الفئات</button>
        <button class="btn" onclick="openProductModal()">+ إضافة منتج</button>
      </div>
      <div id="products-table"></div>
    </div>
  `;
  loadProducts();
}

async function loadProducts() {
  const rows = await API.get('/api/products');
  ALL_PRODUCTS_CACHE = rows;
  const search = (document.getElementById('pr-search')?.value || '').toLowerCase();
  const cat = document.getElementById('pr-category-filter')?.value || '';
  let filtered = rows;
  if (search) filtered = filtered.filter(p => p.name.toLowerCase().includes(search) || (p.barcode || '').includes(search));
  if (cat) filtered = filtered.filter(p => p.category === cat);

  const box = document.getElementById('products-table');
  if (!filtered.length) { box.innerHTML = '<div class="empty">لا توجد منتجات بعد</div>'; return; }
  box.innerHTML = `
    <table>
      <thead><tr><th>#</th><th>الاسم</th><th>الفئة</th><th>الباركود</th><th>السعر</th><th>التكلفة</th><th>المخزون</th><th>إجراءات</th></tr></thead>
      <tbody>
        ${filtered.map(p => `
          <tr>
            <td>${p.id}</td>
            <td>${p.name}</td>
            <td>${p.category || '-'}</td>
            <td>${p.barcode || '-'}</td>
            <td>${p.price.toFixed(2)}</td>
            <td>${p.cost.toFixed(2)}</td>
            <td>${p.stock_qty <= 3 ? `<span style="color:#dc2626;font-weight:600">${p.stock_qty}</span>` : p.stock_qty}</td>
            <td>
              <button class="btn small" onclick="openProductModal(${p.id})">تعديل</button>
              <button class="btn small danger" onclick="deleteProduct(${p.id})">حذف</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function deleteProduct(id) {
  if (!(await showConfirmModal('حذف هذا المنتج؟'))) return;
  await API.del(`/api/products/${id}`);
  loadProducts();
}

function openCategoryManager() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="width:420px">
      <h3>🏷️ إدارة الفئات</h3>
      <div id="cat-list"></div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <input id="new-cat-name" placeholder="اسم فئة جديدة" style="flex:1;padding:9px 10px;border:1px solid #ddd;border-radius:8px">
        <button class="btn small" onclick="addCategory()">+ إضافة</button>
      </div>
      <div class="modal-actions">
        <button class="btn secondary" onclick="this.closest('.modal-overlay').remove(); loadProducts()">إغلاق</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  renderCategoryList();
}

async function renderCategoryList() {
  const cats = await API.get('/api/categories');
  ALL_CATEGORIES_CACHE = cats;
  const box = document.getElementById('cat-list');
  if (!box) return;
  box.innerHTML = cats.length ? cats.map(c => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #eee">
      <span>${c.name}</span>
      <button class="btn small danger" onclick="deleteCategory(${c.id})">حذف</button>
    </div>
  `).join('') : '<div class="empty" style="padding:10px">لا توجد فئات بعد</div>';
}

async function addCategory() {
  const input = document.getElementById('new-cat-name');
  const name = input.value.trim();
  if (!name) return;
  try {
    await API.post('/api/categories', { name });
    input.value = '';
    renderCategoryList();
  } catch (err) {
    showAlertModal('تعذر إضافة الفئة: ' + err.message);
  }
}

async function deleteCategory(id) {
  if (!(await showConfirmModal('حذف هذه الفئة؟'))) return;
  await API.del(`/api/categories/${id}`);
  renderCategoryList();
}

async function addCategoryInline() {
  const name = await showPromptModal('اسم الفئة الجديدة:');
  if (!name || !name.trim()) return;
  API.post('/api/categories', { name: name.trim() }).then((cat) => {
    ALL_CATEGORIES_CACHE.push(cat);
    const select = document.getElementById('pf-category');
    const opt = document.createElement('option');
    opt.value = cat.name; opt.textContent = cat.name; opt.selected = true;
    select.appendChild(opt);
  }).catch(err => showAlertModal('تعذر إضافة الفئة: ' + err.message));
}

async function openProductModal(id) {
  let p = { name: '', category: '', barcode: '', price: 0, cost: 0, stock_qty: 0 };
  if (id) p = ALL_PRODUCTS_CACHE.find(x => x.id === id) || p;
  const cats = ALL_CATEGORIES_CACHE.length ? ALL_CATEGORIES_CACHE : await API.get('/api/categories');

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>${id ? 'تعديل منتج' : 'إضافة منتج جديد'}</h3>
      <div class="grid-2">
        <div class="form-group"><label>اسم المنتج (نظارة، عدسة، إطار...)</label><input id="pf-name" value="${p.name}"></div>
        <div class="form-group"><label>الفئة</label>
          <div style="display:flex;gap:6px">
            <select id="pf-category" style="flex:1">
              <option value="">بدون فئة</option>
              ${cats.map(c => `<option value="${c.name}" ${p.category===c.name?'selected':''}>${c.name}</option>`).join('')}
            </select>
            <button type="button" class="btn small secondary" onclick="addCategoryInline()">+</button>
          </div>
        </div>
        <div class="form-group"><label>الباركود</label><input id="pf-barcode" value="${p.barcode || ''}"></div>
        <div class="form-group"><label>الكمية بالمخزون</label><input id="pf-stock" type="number" value="${p.stock_qty}"></div>
        <div class="form-group"><label>سعر البيع</label><input id="pf-price" type="number" step="0.01" value="${p.price}"></div>
        <div class="form-group"><label>التكلفة</label><input id="pf-cost" type="number" step="0.01" value="${p.cost}"></div>
      </div>
      <div class="modal-actions">
        <button class="btn secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
        <button class="btn" onclick="saveProduct(${id || 'null'})">حفظ</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

async function saveProduct(id) {
  const data = {
    name: document.getElementById('pf-name').value.trim(),
    category: document.getElementById('pf-category').value,
    barcode: document.getElementById('pf-barcode').value.trim(),
    stock_qty: parseInt(document.getElementById('pf-stock').value) || 0,
    price: parseFloat(document.getElementById('pf-price').value) || 0,
    cost: parseFloat(document.getElementById('pf-cost').value) || 0,
  };
  if (!data.name) { showAlertModal('الرجاء إدخال اسم المنتج'); return; }
  if (data.price < 0 || data.cost < 0 || data.stock_qty < 0) { showAlertModal('لا يمكن أن يكون السعر أو التكلفة أو الكمية بقيمة سالبة'); return; }
  try {
    if (id) await API.put(`/api/products/${id}`, data);
    else await API.post('/api/products', data);
    document.querySelector('.modal-overlay').remove();
    loadProducts();
  } catch (err) {
    showAlertModal('تعذر حفظ المنتج: ' + err.message);
  }
}
