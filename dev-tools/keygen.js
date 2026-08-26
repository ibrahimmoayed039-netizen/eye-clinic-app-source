// أداة توليد مفاتيح التفعيل — للمطوّر فقط، لا تُشحن مع نسخة العميل النهائية.
//
// طريقة الاستخدام:
//   1) شغّل البرنامج عند العميل بعد انتهاء التجربة (أو من تبويب الإعدادات > ترخيص البرنامج)
//      وخذ منه "رمز الجهاز" (Device ID) المكوّن من 16 خانة.
//   2) لمفتاح تفعيل دائم:      node dev-tools/keygen.js <رمز الجهاز>
//      لمفتاح تفعيل مؤقت 7 أيام: node dev-tools/keygen.js <رمز الجهاز> 7
//      (تقدر تغيّر الرقم 7 لأي عدد أيام تريده)
//   3) أرسل المفتاح الناتج للعميل ليدخله في نافذة التفعيل.
//
// ⚠️ القيمة السرية LICENSE_SECRET أدناه يجب أن تُطابق تمامًا القيمة الموجودة
// في src/main/main.js. إذا غيّرت واحدة، غيّر الأخرى بنفس القيمة.

const crypto = require('crypto');

const LICENSE_SECRET = 'NHk6rbUAbBXSafpzWyZgioOAglOH9B';

function normalizeDeviceId(id) {
  return (id || '').toUpperCase().replace(/[^A-F0-9]/g, '');
}

// مفتاح دائم — لا ينتهي أبدًا لهذا الجهاز
function generatePermanentKey(deviceId) {
  const normalized = normalizeDeviceId(deviceId);
  const hmac = crypto.createHmac('sha256', LICENSE_SECRET).update(normalized).digest('hex').slice(0, 20).toUpperCase();
  return hmac.match(/.{1,4}/g).join('-');
}

// مفتاح مؤقت — صالح حتى تاريخ انتهاء محدد فقط (مثلًا 7 أيام من الآن)
function generateTemporaryKey(deviceId, days) {
  const normalized = normalizeDeviceId(deviceId);
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + Number(days));
  const yyyymmdd = expiryDate.toISOString().slice(0, 10).replace(/-/g, '');
  const sig = crypto.createHmac('sha256', LICENSE_SECRET).update(normalized + '|' + yyyymmdd).digest('hex').slice(0, 12).toUpperCase();
  return {
    key: `TRIAL-${yyyymmdd}-${sig}`,
    expiryDate: expiryDate.toISOString().slice(0, 10),
  };
}

const deviceId = process.argv[2];
const days = process.argv[3];

if (!deviceId) {
  console.log('الاستخدام:');
  console.log('  مفتاح دائم:       node keygen.js <رمز الجهاز>');
  console.log('  مفتاح مؤقت (أيام): node keygen.js <رمز الجهاز> <عدد الأيام>');
  process.exit(1);
}

console.log('رمز الجهاز:', normalizeDeviceId(deviceId));

if (days) {
  const temp = generateTemporaryKey(deviceId, days);
  console.log(`مفتاح تفعيل مؤقت (${days} يوم، ينتهي بتاريخ ${temp.expiryDate}):`);
  console.log(temp.key);
} else {
  console.log('مفتاح تفعيل دائم:', generatePermanentKey(deviceId));
}
