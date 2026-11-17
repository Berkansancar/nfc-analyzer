@echo off
chcp 65001 >nul
title NFC Analyzer - Kurulum
echo NFC Analyzer kurulumu basliyor...
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo HATA: Node.js bulunamadi. Once Node.js LTS kurun.
  pause
  exit /b 1
)
echo [1/3] NPM paketleri kuruluyor...
call npm install
if errorlevel 1 (
  echo Paket kurulumu basarisiz. Hata mesajlarini kontrol edin.
  pause
  exit /b 1
)
echo.
echo [2/3] Expo proje kontrolu...
call npx expo-doctor
echo.
echo [3/3] Android yerel proje dosyalari olusturuluyor...
call npx expo prebuild --platform android
echo.
echo Tamamlandi. Android Studio ve Android SDK kuruluysa TELEFON BAGLI iken
echo UYGULAMAYI BASLAT.bat dosyasini calistirin.
pause
