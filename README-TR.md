# NFC Analyzer — Android proje dosyaları

Bu klasör, React Native + Expo Development Build kullanan NFC Analyzer kaynak projesidir.

## Özellikler
- NFC desteği ve açık/kapalı durum kontrolü
- NDEF etiket tarama: UID, teknoloji türleri ve NDEF kayıtları
- NDEF metin yazma
- ISO-DEP üzerinden kullanıcı tarafından girilen APDU komutunu gönderme ve yanıtı HEX gösterme
- KOPYALA sekmesi: NTAG / MIFARE Ultralight türü kartların verisini hex ve metin olarak gösterir, boş bir karta yazar ve geri okuyarak doğrular (UID ve kilit sayfaları kopyalanmaz)
- Türkçe arayüz

## Önemli
- Expo Go ile çalışmaz. `react-native-nfc-manager` yerel Android kodu içerir; APK/development build gerekir.
- NFC işlemleri gerçek NFC donanımı olan Android telefonda test edilmelidir.
- NDEF yazma, etiketin mevcut içeriğinin üzerine yazabilir. Test için boş/önemsiz bir etiket kullan.
- Her kart NDEF veya ISO-DEP desteklemez. UID her kartta okunamayabilir; Android ve etiket türü sınırlamaları vardır.
- APDU örneği `00 A4 04 00 00` her karta uygun değildir.
- Bu kaynak paketi bu çalışma ortamında Android SDK bulunmadığı için APK olarak derlenmiş değildir.

## Windows'ta kurulum
1. Node.js LTS ve Android Studio kur. Android Studio içinden Android SDK Platform, Platform-Tools ve Build-Tools bileşenlerini yükle.
2. ZIP'i örneğin `C:\NFC-Analyzer` klasörüne çıkar.
3. Klasörde terminal aç ve çalıştır:
   ```powershell
   npm install
   npx expo-doctor
   npx expo prebuild --platform android
   npx expo run:android
   ```
4. Telefonu USB ile bağla, geliştirici seçeneklerinden USB hata ayıklamayı aç ve telefonda izin penceresini onayla.
5. Telefonunda NFC'yi aç. APK'yı oluşturduktan sonra uygulamayı gerçek cihazda dene.

## EAS ile bulutta APK oluşturma
EAS hesabı ve EAS CLI gerekir:
```powershell
npm install
npx eas-cli login
npx eas-cli build --platform android --profile preview
```
Build tamamlanınca EAS bir APK indirme bağlantısı verir. Bu işlem için EAS hesabında oturum açılması gerekir.

## Proje notları
- `src/nfcService.ts`: NFC işlemleri
- `App.tsx`: Türkçe arayüz
- `app.json`: Android paket adı ve NFC yapılandırması
- `eas.json`: APK ve AAB build profilleri
