async function renderAboutTab(container) {
  let clinicName = 'نظام إدارة عيادة النظر';
  try {
    const settings = await API.get('/api/settings');
    if (settings.clinic_name) clinicName = settings.clinic_name;
  } catch (e) { /* تجاهل الخطأ والاكتفاء بالاسم الافتراضي */ }

  container.innerHTML = `
    <div class="about-hero">
      <div class="about-hero-badge">🩺</div>
      <h1 class="about-hero-title">${clinicName}</h1>
      <p class="about-hero-sub">نظام متكامل لإدارة عيادات النظر — المرضى، المبيعات، المخزون، والتقارير في مكان واحد</p>
    </div>

    <div class="about-grid">
      <div class="about-card about-card-designer">
        <div class="about-avatar">👨‍💻</div>
        <h2 class="about-name">إبراهيم مؤيد عطارباشي</h2>
        <p class="about-role">مصمم ومطوّر البرنامج</p>

        <div class="about-info-list">
          <div class="about-info-item">
            <span class="about-info-icon">📞</span>
            <div>
              <div class="about-info-label">رقم الهاتف</div>
              <div class="about-info-value" dir="ltr">+964 773 697 0504</div>
            </div>
          </div>
          <div class="about-info-item">
            <span class="about-info-icon">📍</span>
            <div>
              <div class="about-info-label">الموقع</div>
              <div class="about-info-value">الموصل — مجموعة الثقافة — شركة المسار الذهبي</div>
            </div>
          </div>
        </div>
      </div>

      <div class="about-card">
        <h2 class="about-section-title">✨ عن البرنامج</h2>
        <p class="about-text">
          تم تصميم وتطوير هذا البرنامج خصيصًا لإدارة عمليات عيادات ومحلات النظارات بشكل احترافي وسهل،
          بدءًا من تسجيل المرضى وفحوصات النظر، مرورًا بالمبيعات والمشتريات والمخزون، وصولًا إلى التقارير
          المالية والإدارية الشاملة.
        </p>
        <div class="about-features">
          <div class="about-feature">👤 إدارة المرضى والفحوصات</div>
          <div class="about-feature">🧾 المبيعات والفواتير</div>
          <div class="about-feature">📦 المنتجات والمخزون</div>
          <div class="about-feature">🏢 الموردين والمشتريات</div>
          <div class="about-feature">💰 الصندوق والمصاريف</div>
          <div class="about-feature">📊 التقارير التفصيلية</div>
        </div>
      </div>
    </div>

    <div class="about-footer">جميع الحقوق محفوظة © ${new Date().getFullYear()} — تصميم وتطوير إبراهيم مؤيد عطارباشي</div>
  `;
}
