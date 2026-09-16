!macro customInstall
  CreateShortCut "$SMPROGRAMS\ถอนการติดตั้ง Smart POS.lnk" "$INSTDIR\Uninstall Smart POS.exe" "" "$INSTDIR\Uninstall Smart POS.exe" 0 "" "" "ถอนการติดตั้งโปรแกรม Smart POS"
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\ถอนการติดตั้ง Smart POS.lnk"

  ${IfNot} ${Silent}
    MessageBox MB_YESNO|MB_ICONQUESTION "คุณต้องการลบข้อมูลการขายและฐานข้อมูล (pos.db) ทั้งหมดออกจากเครื่องด้วยหรือไม่?$\r$\n$\r$\n- เลือก 'ใช่' (Yes): เพื่อล้างข้อมูลการขายและสต็อกสินค้าทั้งหมดออกจากเครื่อง$\r$\n- เลือก 'ไม่ใช่' (No): เพื่อเก็บข้อมูลการขายไว้สำหรับติดตั้งใหม่ในอนาคต" IDNO keepData
    RMDir /r "$APPDATA\smart-pos-desktop"
    Goto doneUnInstall
    keepData:
    MessageBox MB_OK|MB_ICONINFORMATION "ข้อมูลการขายและฐานข้อมูลของคุณยังคงถูกเก็บรักษาไว้อย่างปลอดภัยที่:$\r$\n$APPDATA\smart-pos-desktop"
    doneUnInstall:
  ${EndIf}
!macroend
