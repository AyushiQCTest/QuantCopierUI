; Override installation directory at initialization
!macro customInit
  StrCpy $INSTDIR "$DESKTOP\QuantCopierMT5Discord"
!macroend

; Also override right before installation begins
!macro customInstall
  StrCpy $INSTDIR "$DESKTOP\QuantCopierMT5Discord"
!macroend
