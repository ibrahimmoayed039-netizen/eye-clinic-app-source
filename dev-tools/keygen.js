// أداة توليد مفاتيح التفعيل — للمطوّر فقط، لا تُشحن مع نسخة العميل النهائية.
//
// طريقة الاستخدام:
//   1) شغّل البرنامج عند العميل بعد انتهاء التجربة (أو من تبويب الإعدادات > ترخيص البرنامج)
//      وخذ منه "رمز الجهاز" (Device ID) المكوّن من 16 خانة.
//   2) شغّل هنا: node dev-tools/keygen.js <رمز الجهاز>
//   3) أرسل المفتاح الناتج للعميل ليدخله في نافذة التفعيل.
//
// ⚠️ القيمة السرية LICENSE_SECRET أدناه يجب أن تُطابق تمامًا القيمة الموجودة
// في src/main/main.js. إذا غيّرت واحدة، غيّر الأخرى بنفس القيمة.

const crypto = require('crypto');

const LICENSE_SECRET = 'NHk6rbUAbBXSafpzWyZgioOAglOH9B';

function normalizeDeviceId(id) {
  return (id || '').toUpperCase().replace(/[^A-F0-9]/g, '');
}

function generateKey(deviceId) {
  const normalized = normalizeDeviceId(deviceId);
  const hmac = crypto.createHmac('sha256', LICENSE_SECRET).update(normalized).digest('hex').slice(0, 20).toUpperCase();
  return hmac.match(/.{1,4}/g).join('-');
}

const deviceId = process.argv[2];
if (!deviceId) {
  console.log('الاستخدام: node keygen.js <رمز الجهاز>');
  process.exit(1);
}

console.log('رمز الجهاز:  ', normalizeDeviceId(deviceId));
console.log('مفتاح التفعيل:', generateKey(deviceId));
