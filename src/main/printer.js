const { printer: ThermalPrinter, types: PrinterTypes } = require('node-thermal-printer');
const iconv = require('iconv-lite');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRawWindowsDriver } = require('./rawPrinterDriver');

// ---------- طباعة عبر الشبكة (IP) — اتصال TCP خام مباشر ----------
async function printThermalImageBuffer({ buffer, address }) {
  const printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: `tcp://${address}`,
    removeSpecialCharacters: false,
  });
  const isConnected = await printer.isPrinterConnected().catch(() => false);
  if (!isConnected) {
    throw new Error('لا يمكن الاتصال بالطابعة عبر الشبكة. تأكد من صحة عنوان IP وأن الطابعة مشغّلة ومتصلة بنفس الشبكة.');
  }
  await printer.printImageBuffer(buffer);
  printer.cut();
  await printer.execute();
}

// ---------- طباعة عبر USB (طابعة مثبّتة على ويندوز) عبر صورة ----------
async function printImageToWindowsPrinter({ buffer, printerName }) {
  if (process.platform !== 'win32') {
    throw new Error('الطباعة عبر USB مدعومة فقط على أنظمة ويندوز.');
  }
  if (!printerName || !printerName.trim()) {
    throw new Error('لم يتم تحديد اسم الطابعة. الرجاء إدخال اسم الطابعة بالضبط كما يظهر في "الطابعات وأجهزة المسح" بويندوز، من تبويب الإعدادات.');
  }
  const { print, getPrinters } = require('pdf-to-printer');
  let printers = [];
  try { printers = await getPrinters(); } catch (err) {}
  if (printers.length && !printers.some(p => p.name === printerName.trim())) {
    const names = printers.map(p => p.name).join('، ');
    throw new Error(`تعذّر العثور على طابعة باسم "${printerName}". الطابعات المتوفرة على هذا الجهاز: ${names || 'لا توجد طابعات مثبّتة'}`);
  }
  const tmpPath = path.join(os.tmpdir(), `receipt-${Date.now()}.png`);
  fs.writeFileSync(tmpPath, buffer);
  try {
    await print(tmpPath, { printer: printerName.trim(), silent: true });
  } finally {
    fs.unlink(tmpPath, () => {});
  }
}

// ---------- اختبار جداول الحروف الخام (0-47 و255) ----------
async function printCodePageTest({ interfaceType, address }) {
  const driver = interfaceType === 'network' ? undefined : createRawWindowsDriver();
  const printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: interfaceType === 'network' ? `tcp://${address}` : `printer:${address}`,
    driver,
    removeSpecialCharacters: false,
  });
  const isConnected = await printer.isPrinterConnected().catch(() => false);
  if (!isConnected) throw new Error('لا يمكن الاتصال بالطابعة. تأكد من الإعدادات في تبويب الإعدادات أولًا.');

  const testSentence = 'اختبار اللغة العربية 123';
  const encodedBytes = iconv.encode(testSentence, 'windows1256');

  printer.alignCenter();
  printer.bold(true);
  printer.append(Buffer.from('ESC/POS Code Table Test\n', 'ascii'));
  printer.bold(false);
  printer.append(Buffer.from('--------------------------------\n', 'ascii'));
  printer.alignLeft();

  const tables = [...Array(48).keys(), 255];
  for (const n of tables) {
    printer.append(Buffer.from(`CP${n}: `, 'ascii'));
    printer.append(Buffer.from([0x1b, 0x74, n]));
    printer.append(encodedBytes);
    printer.append(Buffer.from([0x0a]));
  }
  printer.append(Buffer.from('--------------------------------\n', 'ascii'));
  printer.cut();
  await printer.execute();
}

// ---------- طباعة الإيصال بالنظام النصي الخام ----------
function centerText(text, width) {
  const pad = Math.max(0, Math.floor((width - text.length) / 2));
  return ' '.repeat(pad) + text;
}
function twoColumns(left, right, width) {
  const space = Math.max(1, width - left.length - right.length);
  return left + ' '.repeat(space) + right;
}

async function printThermalTextReceipt({ invoice, clinic, interfaceType, address, codePage, width }) {
  const charWidth = width === 80 ? 48 : 32;
  const driver = interfaceType === 'network' ? undefined : createRawWindowsDriver();
  const printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: interfaceType === 'network' ? `tcp://${address}` : `printer:${address}`,
    driver,
    removeSpecialCharacters: false,
  });
  const isConnected = await printer.isPrinterConnected().catch(() => false);
  if (!isConnected) throw new Error('لا يمكن الاتصال بالطابعة. تأكد من الإعدادات في تبويب الإعدادات أولًا.');

  const n = Number.isInteger(codePage) ? codePage : 37;
  const cpCmd = Buffer.from([0x1b, 0x74, n]);
  const enc = (s) => iconv.encode(String(s), 'windows1256');

  function line(text = '', opts = {}) {
    printer.append(cpCmd);
    if (opts.bold) printer.bold(true);
    printer.append(enc(text));
    if (opts.bold) printer.bold(false);
    printer.append(Buffer.from([0x0a]));
  }

  const isUSD = invoice.currency === 'USD';
  const rate = invoice.exchange_rate || 1310;
  const conv = (v) => isUSD ? (v / rate) : v;
  const cur = isUSD ? '$' : (clinic.currency_symbol || 'د.ع');
  const fmt = (v) => Number(conv(v)).toLocaleString('ar', { maximumFractionDigits: isUSD ? 2 : 0 }) + ' ' + cur;

  line(clinic.clinic_name || 'عيادة فحص النظر', { bold: true });
  if (clinic.clinic_phone) line(clinic.clinic_phone);
  line('-'.repeat(charWidth));
  line(`رقم الفاتورة: ${invoice.invoice_number}`);
  line(`التاريخ: ${(invoice.invoice_date || '').split('.')[0]}`);
  if (invoice.patient_name) line(`العميل: ${invoice.patient_name}`);
  line('-'.repeat(charWidth));

  invoice.items.forEach((it) => {
    const leftText = `${it.description} × ${it.qty}`;
    const rightText = fmt(it.qty * it.unit_price);
    if ((leftText.length + rightText.length + 1) <= charWidth) {
      line(twoColumns(leftText, rightText, charWidth));
    } else {
      line(leftText);
      line(twoColumns('', rightText, charWidth));
    }
  });

  line('-'.repeat(charWidth));
  line(twoColumns('الإجمالي الفرعي', fmt(invoice.subtotal), charWidth));
  if (invoice.discount) line(twoColumns('الخصم', fmt(invoice.discount), charWidth));
  line(twoColumns('الإجمالي الكلي', fmt(invoice.total), charWidth), { bold: true });
  line(twoColumns('المدفوع', fmt(invoice.paid_amount), charWidth));
  line('-'.repeat(charWidth));
  line(centerText(clinic.invoice_footer_text || 'شكرًا لزيارتكم', charWidth));

  printer.cut();
  await printer.execute();
}

module.exports = { printThermalImageBuffer, printImageToWindowsPrinter, printCodePageTest, printThermalTextReceipt };
