const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');
const Store = require('electron-store');
const { initDatabase, getDb, getDbPath, closeDatabase } = require('../db/database');
const { startServer } = require('./server');
const { printThermalImageBuffer, printImageToWindowsPrinter, printCodePageTest, printThermalTextReceipt } = require('./printer');

// ---------- نظام التفعيل والفترة التجريبية ----------
// فترة تجريبية 3 أيام من أول تشغيل، ثم يتوقف البرنامج عن العمل حتى إدخال مفتاح تفعيل صحيح.
// المفتاح مرتبط بجهاز العميل (device ID) عبر HMAC-SHA256، ويُولَّد فقط من أداة المطوّر
// المنفصلة dev-tools/keygen.js التي تشارك نفس القيمة السرّية LICENSE_SECRET أدناه.
// ⚠️ يجب تغيير هذه القيمة السرية قبل التسليم النهائي للعميل، وتحديث نفس القيمة في keygen.js.
const LICENSE_SECRET = 'NHk6rbUAbBXSafpzWyZgioOAglOH9B';
const TRIAL_DAYS = 3;

function getDeviceId() {
  const nets = os.networkInterfaces();
  let mac = '';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (!net.internal && net.mac && net.mac !== '00:00:00:00:00:00') { mac = net.mac; break; }
    }
    if (mac) break;
  }
  const raw = `${os.hostname()}|${mac}|${os.platform()}|${os.arch()}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16).toUpperCase();
}

function signValue(str) {
  return crypto.createHmac('sha256', LICENSE_SECRET).update(str).digest('hex');
}

function normalizeKey(k) {
  return (k || '').toUpperCase().replace(/[^A-F0-9]/g, '');
}

function computeExpectedKey(deviceId) {
  return normalizeKey(crypto.createHmac('sha256', LICENSE_SECRET).update(deviceId).digest('hex').slice(0, 20));
}

function isValidPermanentKey(deviceId, enteredKey) {
  return normalizeKey(enteredKey) === computeExpectedKey(deviceId);
}

// ---- مفاتيح تفعيل مؤقتة (صلاحية محدودة، مثلًا 7 أيام) ----
// الصيغة: TRIAL-YYYYMMDD-XXXXXXXXXXXX
// YYYYMMDD = تاريخ انتهاء صلاحية هذا المفتاح بالتحديد (يُحسب وقت التوليد، ثابت لا يتغيّر حسب وقت الإدخال)
// XXXXXXXXXXXX = توقيع HMAC للتأكد من عدم التلاعب بالتاريخ أو استخدامه لجهاز آخر
function parseTemporaryKey(enteredKey) {
  const clean = (enteredKey || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!clean.startsWith('TRIAL')) return null;
  const body = clean.slice(5);
  const expiry = body.slice(0, 8);
  const sig = body.slice(8, 20);
  if (!/^\d{8}$/.test(expiry) || sig.length !== 12) return null;
  return { expiry, sig };
}

function computeTemporaryKeySig(deviceId, expiryYYYYMMDD) {
  return crypto.createHmac('sha256', LICENSE_SECRET).update(deviceId + '|' + expiryYYYYMMDD).digest('hex').slice(0, 12).toUpperCase();
}

function validateTemporaryKey(deviceId, enteredKey) {
  const parsed = parseTemporaryKey(enteredKey);
  if (!parsed) return null;
  const expectedSig = computeTemporaryKeySig(deviceId, parsed.expiry);
  if (expectedSig !== parsed.sig) return null;
  const y = Number(parsed.expiry.slice(0, 4));
  const m = Number(parsed.expiry.slice(4, 6));
  const d = Number(parsed.expiry.slice(6, 8));
  const expiryDate = new Date(y, m - 1, d, 23, 59, 59, 999);
  return { expiryDate };
}

function isValidLicenseKey(deviceId, enteredKey) {
  if (isValidPermanentKey(deviceId, enteredKey)) return true;
  const temp = validateTemporaryKey(deviceId, enteredKey);
  return !!(temp && Date.now() <= temp.expiryDate.getTime());
}

// علامة مخفية إضافية بمعزل عن ملف إعدادات electron-store، حتى لا يكفي حذف/تعديل
// ملف الإعدادات وحده لإعادة ضبط تاريخ بداية الفترة التجريبية.
function getMarkerPath() {
  return path.join(app.getPath('userData'), '.sysdata');
}

function readMarkerFirstRun(deviceId) {
  try {
    const raw = fs.readFileSync(getMarkerPath(), 'utf8');
    const data = JSON.parse(raw);
    if (data && data.firstRun && data.sig === signValue(deviceId + '|' + data.firstRun)) return data.firstRun;
  } catch (e) { /* لا يوجد ملف بعد، أو تالف/متلاعب به */ }
  return null;
}

function writeMarkerFirstRun(deviceId, firstRun) {
  try {
    const p = getMarkerPath();
    fs.writeFileSync(p, JSON.stringify({ firstRun, sig: signValue(deviceId + '|' + firstRun) }));
    if (process.platform === 'win32') execFile('attrib', ['+h', p], () => {});
  } catch (e) { /* تجاهل */ }
}

function getLicenseStatus(store) {
  const deviceId = getDeviceId();
  const savedKey = store.get('license.key');
  if (savedKey) {
    if (isValidPermanentKey(deviceId, savedKey)) {
      return { activated: true, deviceId, licenseType: 'permanent' };
    }
    const temp = validateTemporaryKey(deviceId, savedKey);
    if (temp && Date.now() <= temp.expiryDate.getTime()) {
      const daysLeft = Math.max(0, Math.ceil((temp.expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
      return {
        activated: true,
        deviceId,
        licenseType: 'temporary',
        expiresOn: temp.expiryDate.toISOString().slice(0, 10),
        daysLeft,
      };
    }
    // مفتاح مؤقت منتهي الصلاحية، أو مفتاح غير صالح على الإطلاق -> نتجاهله ونعامل الجهاز
    // حسب الفترة التجريبية الأصلية أدناه (يحتاج مفتاح جديد للاستمرار)
  }

  const now = Date.now();
  const storeFirstRun = store.get('license.firstRun');
  const storeValid = storeFirstRun && store.get('license.sig') === signValue(deviceId + '|' + storeFirstRun);
  const markerFirstRun = readMarkerFirstRun(deviceId);

  let firstRun;
  if (storeValid && markerFirstRun) firstRun = Math.min(storeFirstRun, markerFirstRun);
  else if (storeValid) firstRun = storeFirstRun;
  else if (markerFirstRun) firstRun = markerFirstRun;
  else firstRun = now; // أول تشغيل فعلي للبرنامج على هذا الجهاز

  // إعادة كتابة كِلا المصدرين متزامنَين على القيمة المعتمدة
  store.set('license.firstRun', firstRun);
  store.set('license.sig', signValue(deviceId + '|' + firstRun));
  writeMarkerFirstRun(deviceId, firstRun);

  const daysUsed = (now - firstRun) / (1000 * 60 * 60 * 24);
  const daysLeft = Math.max(0, Math.ceil(TRIAL_DAYS - daysUsed));
  return { activated: false, deviceId, daysLeft, expired: daysUsed >= TRIAL_DAYS };
}

// ---------- النسخ الاحتياطي التلقائي ----------
// عند كل تشغيل بوضع "خادم"، ننشئ نسخة احتياطية يومية تلقائية (مرة واحدة كل يوم كحد أقصى)
// داخل مجلد بيانات المستخدم، ونحتفظ بآخر 14 نسخة فقط ونحذف الأقدم تلقائيًا.
const AUTO_BACKUP_KEEP_COUNT = 14;

function getAutoBackupDir() {
  const dir = path.join(app.getPath('userData'), 'backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function runAutoBackupIfNeeded() {
  try {
    const dbPath = getDbPath();
    if (!dbPath || !fs.existsSync(dbPath)) return;
    const dir = getAutoBackupDir();
    const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const target = path.join(dir, `تلقائي-${todayStr}.db`);
    if (fs.existsSync(target)) return; // أُخذت نسخة اليوم مسبقًا

    await getDb().backup(target);

    // تنظيف: الاحتفاظ بآخر AUTO_BACKUP_KEEP_COUNT نسخة تلقائية فقط
    const files = fs.readdirSync(dir)
      .filter(f => f.startsWith('تلقائي-') && f.endsWith('.db'))
      .map(f => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    files.slice(AUTO_BACKUP_KEEP_COUNT).forEach(({ f }) => {
      try { fs.unlinkSync(path.join(dir, f)); } catch (e) { /* تجاهل */ }
    });
  } catch (err) {
    console.error('فشل النسخ الاحتياطي التلقائي:', err.message);
  }
}

// جلب قائمة الطابعات المثبّتة على ويندوز مباشرة عبر PowerShell (بإخراج JSON آمن للتحليل).
// هذا بديل أكثر ثباتًا من مكتبة pdf-to-printer التي قد تفشل بخطأ برمجي غامض
// (Cannot read properties of undefined (reading 'match')) إذا كان الأمر الداخلي الذي
// تستخدمه لم يُرجع مخرجات بالشكل المتوقع (بسبب صلاحيات، أو سياسة تنفيذ سكربتات، أو عدم وجود طابعات).
function getInstalledPrintersViaPowerShell() {
  return new Promise((resolve, reject) => {
    const psCommand = 'Get-CimInstance -ClassName Win32_Printer | Select-Object -ExpandProperty Name | ConvertTo-Json -Compress';
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psCommand],
      { timeout: 10000, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) { reject(new Error('تعذّر تشغيل أمر استكشاف الطابعات (PowerShell). تأكد أن PowerShell غير محظور على هذا الجهاز عبر سياسات النظام، أو أدخل اسم الطابعة يدويًا.')); return; }
        const raw = (stdout || '').trim();
        if (!raw) { resolve([]); return; }
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) resolve(parsed.filter(Boolean));
          else if (typeof parsed === 'string') resolve([parsed]);
          else resolve([]);
        } catch (parseErr) {
          reject(new Error('تعذّر قراءة نتيجة استكشاف الطابعات. جرّب إدخال اسم الطابعة يدويًا بدل الاكتشاف التلقائي.'));
        }
      }
    );
  });
}

Menu.setApplicationMenu(null);

const store = new Store();
let mainWindow;
let previewWindow;

const DEFAULT_PORT = 4500;
const APP_ICON = path.join(__dirname, '..', '..', 'assets', 'icon.png');

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1000,
    minHeight: 650,
    title: 'نظام إدارة عيادة النظر',
    icon: APP_ICON,
    autoHideMenuBar: true,
    backgroundColor: '#f4f6f7',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.setMenu(null);
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  const license = getLicenseStatus(store);
  if (license.expired) {
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'license-lock.html'));
    return;
  }

  const mode = store.get('mode');

  if (!mode) {
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'setup.html'));
  } else if (mode === 'server') {
    const port = store.get('port') || DEFAULT_PORT;
    initDatabase(app.getPath('userData'));
    console.log('مسار قاعدة البيانات المستخدمة:', getDbPath());
    console.log('مسار بيانات البرنامج (userData):', app.getPath('userData'));
    runAutoBackupIfNeeded();
    startServer(port, () => {
      mainWindow.loadURL(`http://localhost:${port}/index.html?apiBase=http://localhost:${port}`);
    });
  } else {
    const serverAddress = store.get('serverAddress');
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'), {
      search: `apiBase=http://${serverAddress}`
    });
  }
}

app.whenReady().then(createMainWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow(); });

ipcMain.handle('setup:save', (event, config) => {
  store.set('mode', config.mode);
  if (config.mode === 'server') store.set('port', config.port || DEFAULT_PORT);
  else store.set('serverAddress', config.serverAddress);
  mainWindow.close();
  createMainWindow();
  return true;
});

ipcMain.handle('setup:reset', () => { store.clear(); return true; });

ipcMain.handle('license:status', () => getLicenseStatus(store));

ipcMain.handle('license:activate', (event, key) => {
  const deviceId = getDeviceId();
  if (!isValidLicenseKey(deviceId, key)) {
    return { ok: false, error: 'مفتاح التفعيل غير صحيح لهذا الجهاز.' };
  }
  store.set('license.key', (key || '').trim());
  return { ok: true };
});

ipcMain.handle('license:relaunch', () => {
  app.relaunch();
  app.exit(0);
});

ipcMain.handle('app:getLocalMode', () => {
  return { mode: store.get('mode'), port: store.get('port'), serverAddress: store.get('serverAddress') };
});

ipcMain.handle('print:thermalImage', async (event, { receiptHtml, width, interfaceType, address }) => {
  let captureWin;
  try {
    const pxWidth = width === 80 ? 576 : 384;
    captureWin = new BrowserWindow({
      width: pxWidth, height: 800, show: false, autoHideMenuBar: true,
      webPreferences: { offscreen: false }
    });
    captureWin.setMenu(null);
    await captureWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(receiptHtml));
    await new Promise((r) => setTimeout(r, 120));
    const contentHeight = await captureWin.webContents.executeJavaScript('document.body.scrollHeight');
    captureWin.setContentSize(pxWidth, Math.max(50, Math.ceil(contentHeight)));
    await new Promise((r) => setTimeout(r, 120));
    const image = await captureWin.webContents.capturePage();
    const pngBuffer = image.toPNG();
    captureWin.close();

    if (interfaceType === 'network') {
      await printThermalImageBuffer({ buffer: pngBuffer, address });
    } else {
      await printImageToWindowsPrinter({ buffer: pngBuffer, printerName: address });
    }
    return { ok: true };
  } catch (err) {
    if (captureWin && !captureWin.isDestroyed()) captureWin.close();
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('print:thermalText', async (event, { invoice, clinic, interfaceType, address, codePage, width }) => {
  try {
    await printThermalTextReceipt({ invoice, clinic, interfaceType, address, codePage, width });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('printer:list', async () => {
  try {
    if (process.platform !== 'win32') return { ok: false, error: 'اكتشاف الطابعات متاح فقط على ويندوز. أدخل اسم الطابعة يدويًا.', printers: [] };
    let names = [];
    try {
      names = await getInstalledPrintersViaPowerShell();
    } catch (psErr) {
      // خطة بديلة: نجرّب مكتبة pdf-to-printer في حال فشل أمر PowerShell المباشر لأي سبب.
      try {
        const { getPrinters } = require('pdf-to-printer');
        const printers = await getPrinters();
        names = printers.map(p => p.name);
      } catch (fallbackErr) {
        return { ok: false, error: psErr.message, printers: [] };
      }
    }
    if (!names.length) return { ok: false, error: 'لم يتم العثور على أي طابعة مثبّتة على هذا الجهاز. تأكد أن الطابعة مثبّتة من لوحة تحكم ويندوز، أو أدخل اسمها يدويًا.', printers: [] };
    return { ok: true, printers: names };
  } catch (err) {
    return { ok: false, error: 'حدث خطأ غير متوقع أثناء اكتشاف الطابعات: ' + err.message, printers: [] };
  }
});

ipcMain.handle('printer:codePageTest', async (event, { interfaceType, address }) => {
  try {
    await printCodePageTest({ interfaceType, address });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('printer:testConnection', async (event, { interfaceType, address }) => {
  try {
    if (!address || !address.trim()) return { ok: false, error: 'الرجاء إدخال عنوان/اسم الطابعة أولاً.' };
    if (interfaceType === 'network') {
      const net = require('net');
      const [host, portStr] = address.split(':');
      const port = parseInt(portStr) || 9100;
      const connected = await new Promise((resolve) => {
        const socket = net.connect({ host, port, timeout: 3000 }, () => { resolve(true); socket.destroy(); });
        socket.on('error', () => resolve(false));
        socket.on('timeout', () => { resolve(false); socket.destroy(); });
      });
      if (!connected) return { ok: false, error: `تعذّر الاتصال بـ ${host}:${port}. تأكد من عنوان الـ IP وأن الطابعة تعمل على نفس الشبكة.` };
      return { ok: true, message: `تم الاتصال بنجاح بالطابعة على ${host}:${port}` };
    } else {
      if (process.platform !== 'win32') return { ok: false, error: 'اختبار طابعات USB متاح فقط على ويندوز.' };
      let names = [];
      try {
        names = await getInstalledPrintersViaPowerShell();
      } catch (psErr) {
        try {
          const { getPrinters } = require('pdf-to-printer');
          names = (await getPrinters()).map(p => p.name);
        } catch (fallbackErr) {
          return { ok: false, error: psErr.message };
        }
      }
      const found = names.some(n => n === address.trim());
      if (!found) {
        const list = names.join('، ') || 'لا توجد طابعات مثبّتة';
        return { ok: false, error: `لا توجد طابعة بهذا الاسم على الجهاز. الطابعات المتوفرة: ${list}` };
      }
      return { ok: true, message: `الطابعة "${address}" موجودة ومثبّتة على هذا الجهاز.` };
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('print:preview', async (event, { htmlContent, title }) => {
  previewWindow = new BrowserWindow({
    width: 850, height: 950, title: title || 'معاينة الطباعة', icon: APP_ICON,
    autoHideMenuBar: true, backgroundColor: '#ffffff', parent: mainWindow, show: false,
    webPreferences: { contextIsolation: true }
  });
  previewWindow.setMenu(null);
  previewWindow.once('ready-to-show', () => {
    previewWindow.show();
    previewWindow.focus();
  });
  const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent);
  previewWindow.loadURL(dataUrl);
  return true;
});

ipcMain.handle('print:system', async (event, silent) => {
  const win = BrowserWindow.getFocusedWindow();
  return new Promise((resolve) => {
    win.webContents.print({ silent: !!silent, printBackground: true }, (success, reason) => {
      resolve({ success, reason });
    });
  });
});

ipcMain.handle('dialog:selectPrinterFile', async () => {
  const result = await dialog.showSaveDialog({ defaultPath: 'invoice.pdf' });
  return result.filePath;
});

// ---------- النسخ الاحتياطي والاستعادة (يدوي) ----------

ipcMain.handle('backup:getInfo', async () => {
  const mode = store.get('mode');
  if (mode !== 'server') {
    return { ok: false, error: 'النسخ الاحتياطي متاح فقط على الجهاز الرئيسي (الخادم) الذي يحتفظ بقاعدة البيانات الفعلية.' };
  }
  const dbPath = getDbPath();
  if (!dbPath || !fs.existsSync(dbPath)) return { ok: false, error: 'تعذّر العثور على ملف قاعدة البيانات.' };
  const stat = fs.statSync(dbPath);
  const autoDir = getAutoBackupDir();
  const autoBackups = fs.readdirSync(autoDir)
    .filter(f => f.startsWith('تلقائي-') && f.endsWith('.db'))
    .map(f => {
      const s = fs.statSync(path.join(autoDir, f));
      return { name: f, sizeBytes: s.size, mtime: s.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return {
    ok: true,
    dbPath,
    sizeBytes: stat.size,
    lastModified: stat.mtimeMs,
    autoBackupDir: autoDir,
    autoBackups
  };
});

ipcMain.handle('backup:openAutoFolder', async () => {
  const dir = getAutoBackupDir();
  shell.openPath(dir);
  return true;
});

ipcMain.handle('backup:create', async () => {
  try {
    const mode = store.get('mode');
    if (mode !== 'server') return { ok: false, error: 'النسخ الاحتياطي متاح فقط على الجهاز الرئيسي (الخادم).' };
    const dbPath = getDbPath();
    if (!dbPath || !fs.existsSync(dbPath)) return { ok: false, error: 'تعذّر العثور على ملف قاعدة البيانات.' };

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'حفظ نسخة احتياطية',
      defaultPath: `نسخة-احتياطية-عيادة-النظر-${stamp}.db`,
      filters: [{ name: 'ملف قاعدة بيانات', extensions: ['db'] }]
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };

    await getDb().backup(result.filePath);
    return { ok: true, filePath: result.filePath };
  } catch (err) {
    return { ok: false, error: 'فشل إنشاء النسخة الاحتياطية: ' + err.message };
  }
});

ipcMain.handle('backup:restore', async () => {
  try {
    const mode = store.get('mode');
    if (mode !== 'server') return { ok: false, error: 'الاستعادة متاحة فقط على الجهاز الرئيسي (الخادم).' };

    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'اختر ملف النسخة الاحتياطية للاستعادة',
      properties: ['openFile'],
      filters: [{ name: 'ملف قاعدة بيانات', extensions: ['db'] }]
    });
    if (result.canceled || !result.filePaths || !result.filePaths.length) return { ok: false, canceled: true };
    const sourcePath = result.filePaths[0];

    // تحقّق أن الملف المختار فعلاً قاعدة بيانات SQLite صالحة (أول 16 بايت من الملف)
    const fd = fs.openSync(sourcePath, 'r');
    const headerBuf = Buffer.alloc(16);
    fs.readSync(fd, headerBuf, 0, 16, 0);
    fs.closeSync(fd);
    if (headerBuf.toString('utf8') !== 'SQLite format 3\0') {
      return { ok: false, error: 'الملف المختار ليس ملف نسخة احتياطية صالحًا (ملف قاعدة بيانات SQLite).' };
    }

    const confirmResult = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['إلغاء', 'نعم، استبدال البيانات'],
      defaultId: 0,
      cancelId: 0,
      title: 'تأكيد الاستعادة',
      message: 'سيتم استبدال كل بيانات البرنامج الحالية بمحتوى النسخة الاحتياطية المختارة. سيُغلق البرنامج ويعيد التشغيل تلقائيًا بعد ذلك.',
      detail: 'سيتم أخذ نسخة أمان تلقائية من البيانات الحالية قبل الاستبدال، احتياطًا في حال اخترت الملف الخطأ.'
    });
    if (confirmResult.response !== 1) return { ok: false, canceled: true };

    const dbPath = getDbPath();
    const dbDir = path.dirname(dbPath);

    // نسخة أمان تلقائية قبل الاستبدال
    try {
      if (fs.existsSync(dbPath)) {
        await getDb().backup(path.join(getAutoBackupDir(), `قبل-استعادة-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.db`));
      }
    } catch (safetyErr) { /* لا نوقف العملية إن فشلت نسخة الأمان */ }

    closeDatabase();

    // حذف ملفات WAL/SHM القديمة المرتبطة بقاعدة البيانات الحالية
    ['-wal', '-shm'].forEach(suffix => {
      const p = dbPath + suffix;
      if (fs.existsSync(p)) { try { fs.unlinkSync(p); } catch (e) { /* تجاهل */ } }
    });

    fs.copyFileSync(sourcePath, dbPath);

    app.relaunch();
    app.exit(0);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: 'فشلت عملية الاستعادة: ' + err.message };
  }
});
