const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { initDatabase } = require('../db/database');
const { startServer } = require('./server');
const { printThermalImageBuffer, printImageToWindowsPrinter, printCodePageTest, printThermalTextReceipt } = require('./printer');

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
  mainWindow.once('ready-to-show', () => mainWindow.show());

  const mode = store.get('mode');

  if (!mode) {
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'setup.html'));
  } else if (mode === 'server') {
    const port = store.get('port') || DEFAULT_PORT;
    initDatabase(app.getPath('userData'));
    startServer(port);
    mainWindow.loadURL(`http://localhost:${port}/index.html?apiBase=http://localhost:${port}`);
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
    const { getPrinters } = require('pdf-to-printer');
    const printers = await getPrinters();
    return { ok: true, printers: printers.map(p => p.name) };
  } catch (err) {
    return { ok: false, error: err.message, printers: [] };
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
      const { getPrinters } = require('pdf-to-printer');
      const printers = await getPrinters();
      const found = printers.some(p => p.name === address.trim());
      if (!found) {
        const names = printers.map(p => p.name).join('، ') || 'لا توجد طابعات مثبّتة';
        return { ok: false, error: `لا توجد طابعة بهذا الاسم على الجهاز. الطابعات المتوفرة: ${names}` };
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
  previewWindow.once('ready-to-show', () => previewWindow.show());
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
