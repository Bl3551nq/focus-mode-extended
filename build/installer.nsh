; installer.nsh — custom NSIS hooks for Focus Mode Extended

!macro customInstall
  ; Add to Windows startup (HKCU so no elevation needed)
  WriteRegStr HKCU \
    "Software\Microsoft\Windows\CurrentVersion\Run" \
    "Focus Mode Extended" \
    '"$INSTDIR\Focus Mode Extended.exe" --autostart'

  ; Write uninstall entry
  WriteRegStr HKCU \
    "Software\Microsoft\Windows\CurrentVersion\Uninstall\FocusModeExtended" \
    "DisplayName" "Focus Mode Extended"
  WriteRegStr HKCU \
    "Software\Microsoft\Windows\CurrentVersion\Uninstall\FocusModeExtended" \
    "Publisher" "Nova Vault"
!macroend

!macro customUninstall
  ; Remove startup entry
  DeleteRegValue HKCU \
    "Software\Microsoft\Windows\CurrentVersion\Run" \
    "Focus Mode Extended"
!macroend
