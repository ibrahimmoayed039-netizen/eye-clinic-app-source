const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  saveSetup: (config) => ipcRenderer.invoke('setup:save', config),
  resetSetup: () => ipcRenderer.invoke('setup:reset'),
  getLocalMode: () => ipcRenderer.invoke('app:getLocalMode'),
  printThermalImage: (payload) => ipcRenderer.invoke('print:thermalImage', payload),
  printThermalText: (payload) => ipcRenderer.invoke('print:thermalText', payload),
  listPrinters: () => ipcRenderer.invoke('printer:list'),
  testPrinterConnection: (payload) => ipcRenderer.invoke('printer:testConnection', payload),
  testCodePages: (payload) => ipcRenderer.invoke('printer:codePageTest', payload),
  printPreview: (payload) => ipcRenderer.invoke('print:preview', payload),
  printSystem: (silent) => ipcRenderer.invoke('print:system', silent),
  getBackupInfo: () => ipcRenderer.invoke('backup:getInfo'),
  createBackup: () => ipcRenderer.invoke('backup:create'),
  restoreBackup: () => ipcRenderer.invoke('backup:restore'),
  openAutoBackupFolder: () => ipcRenderer.invoke('backup:openAutoFolder'),
  getLicenseStatus: () => ipcRenderer.invoke('license:status'),
  activateLicense: (key) => ipcRenderer.invoke('license:activate', key),
  relaunchApp: () => ipcRenderer.invoke('license:relaunch')
});
