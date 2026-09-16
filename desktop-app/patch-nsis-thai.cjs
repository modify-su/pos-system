const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const assistedPath = path.resolve(__dirname, 'node_modules/app-builder-lib/templates/nsis/assistedMessages.yml');
const messagesPath = path.resolve(__dirname, 'node_modules/app-builder-lib/templates/nsis/messages.yml');

const assistedThai = {
  chooseInstallationOptions: 'เลือกรูปแบบการติดตั้ง',
  chooseUninstallationOptions: 'เลือกรูปแบบการถอนการติดตั้ง',
  whichInstallationShouldBeRemoved: 'ต้องการถอนการติดตั้งเวอร์ชันใด?',
  whoShouldThisApplicationBeInstalledFor: 'ต้องการติดตั้งโปรแกรมนี้สำหรับใคร?',
  selectUserMode: 'กรุณาเลือกว่าต้องการให้โปรแกรมนี้ใช้งานได้สำหรับทุกคนในคอมพิวเตอร์ หรือเฉพาะคุณเท่านั้น:',
  whichInstallationRemove: 'โปรแกรมนี้ถูกติดตั้งไว้ทั้งแบบทุกคนและเฉพาะผู้ใช้ปัจจุบัน\nต้องการถอนการติดตั้งเวอร์ชันใด?',
  freshInstallForAll: 'ติดตั้งใหม่สำหรับผู้ใช้ทุกคน (ต้องใช้สิทธิ์ผู้ดูแลระบบ Administrator)',
  freshInstallForCurrent: 'ติดตั้งใหม่สำหรับผู้ใช้งานปัจจุบันเท่านั้น',
  onlyForMe: 'เฉพาะฉันคนเดียว (&Only for me)',
  forAll: 'ทุกคนที่ใช้คอมพิวเตอร์เครื่องนี้ (&ผู้ใช้ทุกคน - All users)',
  loginWithAdminAccount: 'คุณต้องเข้าสู่ระบบด้วยบัญชีผู้ดูแลระบบ (Administrator) เพื่อดำเนินการต่อ...',
  perUserInstallExists: 'มีการติดตั้งสำหรับผู้ใช้งานปัจจุบันอยู่แล้ว',
  perUserInstall: 'มีการติดตั้งสำหรับผู้ใช้งานปัจจุบัน',
  perMachineInstallExists: 'มีการติดตั้งสำหรับคอมพิวเตอร์เครื่องนี้อยู่แล้ว',
  perMachineInstall: 'มีการติดตั้งสำหรับคอมพิวเตอร์เครื่องนี้',
  reinstallUpgrade: 'จะทำการติดตั้งใหม่ / อัปเกรดโปรแกรม',
  uninstall: 'จะทำการถอนการติดตั้ง',
};

const messagesThai = {
  win7Required: 'ต้องใช้ระบบปฏิบัติการ Windows 7 ขึ้นไป',
  x64WinRequired: 'ต้องใช้ระบบปฏิบัติการ Windows 64-bit',
  appRunning: '${PRODUCT_NAME} กำลังทำงานอยู่\nกรุณากด ตกลง เพื่อปิดโปรแกรมก่อนดำเนินการต่อ\nหากไม่ปิด กรุณาปิดโปรแกรมด้วยตนเอง',
  appCannotBeClosed: 'ไม่สามารถปิด ${PRODUCT_NAME} ได้\nกรุณาปิดโปรแกรมด้วยตนเอง แล้วกด ลองใหม่ เพื่อดำเนินการต่อ',
  installing: 'กำลังติดตั้ง กรุณารอสักครู่...',
  uninstalling: 'กำลังถอนการติดตั้ง กรุณารอสักครู่...',
  areYouSureToUninstall: 'คุณแน่ใจหรือไม่ว่าต้องการถอนการติดตั้ง ${PRODUCT_NAME}?',
  decompressionFailed: 'การแตกไฟล์ล้มเหลว กรุณาลองเปิดตัวติดตั้งใหม่อีกครั้ง',
  uninstallFailed: 'ลบไฟล์โปรแกรมเวอร์ชันเก่าไม่สำเร็จ กรุณาลองเปิดตัวติดตั้งใหม่อีกครั้ง',
};

function patchFile(filePath, translations) {
  if (!fs.existsSync(filePath)) {
    console.warn('File not found:', filePath);
    return;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const doc = yaml.load(content);
  let count = 0;

  for (const [key, val] of Object.entries(translations)) {
    if (doc[key]) {
      delete doc[key].th;
      doc[key].th_TH = val;
      count++;
    }
  }

  if (count > 0) {
    fs.writeFileSync(filePath, yaml.dump(doc, { lineWidth: -1 }), 'utf8');
    console.log(`✅ Patched ${count} Thai translations in: ${path.basename(filePath)}`);
  }
}

patchFile(assistedPath, assistedThai);
patchFile(messagesPath, messagesThai);
