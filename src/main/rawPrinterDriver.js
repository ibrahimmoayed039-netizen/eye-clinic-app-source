const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function createRawWindowsDriver() {
  return {
    getPrinters() { return []; },
    getPrinter(name) { return { name, status: [] }; },
    printDirect({ data, printer, success, error }) {
      const tmpFile = path.join(os.tmpdir(), `escpos-raw-${Date.now()}.bin`);
      try {
        fs.writeFileSync(tmpFile, data);
      } catch (e) {
        error(e);
        return;
      }
      const target = `\\\\localhost\\${printer}`;
      exec(`copy /b "${tmpFile}" "${target}"`, { shell: 'cmd.exe', windowsHide: true }, (err) => {
        fs.unlink(tmpFile, () => {});
        if (err) {
          error(new Error(`تعذّر الإرسال المباشر للطابعة. تأكد أن الطابعة "${printer}" مُفعّل لها خيار "مشاركة الطابعة" من خصائص الطابعة بويندوز (حتى لو للاستخدام المحلي فقط). التفاصيل: ${err.message}`));
        } else {
          success('raw-print-ok');
        }
      });
    }
  };
}

module.exports = { createRawWindowsDriver };
