import React, { useEffect, useState } from 'react';
import {
  SafeAreaView, ScrollView, View, Text, TextInput, Pressable,
  StyleSheet, ActivityIndicator, StatusBar, Platform, Alert, Share
} from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import {
  initNfc, scanAnyTag, writeNdefText, sendIsoDepApdu, TagInfo,
  readUltralightDump, writeUltralightDump, formatDump, cancelNfc, UltralightDump
} from './src/nfcService';
import { SavedRecord, loadRecords, addRecord, removeRecord, formatDate, recordToText } from './src/storage';

type Tab = 'scan' | 'write' | 'apdu' | 'copy' | 'saved';

export default function App() {
  const [tab, setTab] = useState<Tab>('scan');
  const [ready, setReady] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState('Uygulama hazır. NFC işlemi başlatmak için bir sekme seç.');
  const [tag, setTag] = useState<TagInfo | null>(null);
  const [textValue, setTextValue] = useState('Merhaba NFC!');
  const [apdu, setApdu] = useState('00 A4 04 00 00');
  const [dump, setDump] = useState<UltralightDump | null>(null);
  const [records, setRecords] = useState<SavedRecord[]>([]);
  const [recName, setRecName] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    initNfc().then(setReady).catch((e) => {
      setReady(false);
      setLog(errorText(e));
    });
  }, []);

  useEffect(() => {
    loadRecords().then(setRecords).catch((e) => setLog(`HATA: kayıtlar okunamadı. ${errorText(e)}`));
  }, []);

  const run = async (fn: () => Promise<void>) => {
    if (loading) return;
    setLoading(true);
    try { await fn(); }
    catch (e) { setLog(`HATA: ${errorText(e)}`); }
    finally { setLoading(false); }
  };

  const scan = () => run(async () => {
    setLog('Kart bekleniyor. Kartı telefonun arkasındaki NFC bölgesine yaklaştır ve sabit tut.');
    const result = await scanAnyTag();
    setTag(result);
    setLog('Tarama tamamlandı.');
  });

  const write = () => run(async () => {
    setLog('Yazılabilir NDEF etiketi bekleniyor...');
    await writeNdefText(textValue);
    setLog('NDEF metni etikete yazıldı.');
  });

  const send = () => run(async () => {
    setLog('ISO-DEP kartı bekleniyor...');
    const response = await sendIsoDepApdu(apdu);
    setLog(`APDU yanıtı:\n${response}\n\nSon iki bayt genellikle durum kodudur (SW1 SW2).`);
  });

  const readDump = () => run(async () => {
    setLog('NTAG / Ultralight kartı bekleniyor. Kartı telefonun arkasına yaklaştır ve sabit tut.');
    const result = await readUltralightDump();
    setDump(result);
    setLog(`Okundu: ${result.kind}\nUID: ${result.id}\n${result.pages.length} sayfa kullanıcı verisi hafızada. Şimdi "BAŞKA KARTA YAZ" ile boş karta kopyalayabilirsin.`);
  });

  const copyDump = async () => {
    if (loading || !dump) return;
    const ok = await new Promise<boolean>((resolve) => {
      Alert.alert(
        'Kartın üzerine yazılsın mı?',
        'Hedef kartın mevcut verisi silinip kaynak kartın verisi yazılacak. Boş veya önemsiz bir kart kullan. Kartın kimlik numarası (UID) kopyalanmaz.',
        [
          { text: 'Vazgeç', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Yaz', style: 'destructive', onPress: () => resolve(true) },
        ],
        { cancelable: true, onDismiss: () => resolve(false) }
      );
    });
    if (!ok) return;
    await run(async () => {
      setLog('HEDEF (boş) kartı bekleniyor. Kaynak kartı çek, boş kartı telefonun arkasına yaklaştır ve sabit tut.');
      const res = await writeUltralightDump(dump);
      setLog(res.verified
        ? `${res.written} sayfa yazıldı ve geri okunarak doğrulandı. Kopyalama tamam.`
        : `${res.written} sayfa yazıldı ama doğrulama tutmadı. Kartı tekrar okutup kontrol et.`);
    });
  };

  const saveCurrent = async (kind: 'scan' | 'dump') => {
    try {
      const base = kind === 'scan' ? tag : dump;
      if (!base) return;
      const defaultName = kind === 'scan' ? `Kart ${tag!.id}` : `Ham veri ${dump!.id}`;
      const next = await addRecord({
        kind,
        name: recName.trim() || defaultName,
        scan: kind === 'scan' ? tag! : undefined,
        dump: kind === 'dump' ? dump! : undefined,
      });
      setRecords(next);
      setRecName('');
      setLog(`Kaydedildi. KAYITLAR sekmesinde görebilirsin. (Toplam ${next.length} kayıt)`);
    } catch (e) {
      setLog(`HATA: kaydedilemedi. ${errorText(e)}`);
    }
  };

  const deleteRec = (r: SavedRecord) => {
    Alert.alert('Kayıt silinsin mi?', `"${r.name}" kalıcı olarak silinecek.`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil', style: 'destructive',
        onPress: async () => {
          try { setRecords(await removeRecord(r.id)); setOpenId(null); setLog('Kayıt silindi.'); }
          catch (e) { setLog(`HATA: silinemedi. ${errorText(e)}`); }
        },
      },
    ]);
  };

  const shareText = async (message: string) => {
    try { await Share.share({ message }); }
    catch (e) { setLog(`HATA: paylaşılamadı. ${errorText(e)}`); }
  };

  const loadDumpFromRecord = (r: SavedRecord) => {
    if (!r.dump) return;
    setDump(r.dump);
    setTab('copy');
    setLog('Kayıtlı veri KOPYALA sekmesine alındı. "2) BAŞKA KARTA YAZ" ile boş bir NTAG kartına yazabilirsin.');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ExpoStatusBar style="light" />
      <StatusBar barStyle="light-content" backgroundColor="#080D18" />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.kicker}>NFC LAB • ANDROID</Text>
          <Text style={styles.title}>NFC Analyzer</Text>
          <Text style={styles.subtitle}>Kart ve etiket bilgilerini incele</Text>
        </View>

        <View style={styles.statusCard}>
          <View style={[styles.dot, { backgroundColor: ready ? '#35D39A' : '#F4B860' }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.statusTitle}>{ready === null ? 'NFC kontrol ediliyor' : ready ? 'NFC açık ve hazır' : 'NFC kapalı veya desteklenmiyor'}</Text>
            <Text style={styles.muted}>{Platform.OS === 'android' ? 'Android cihaz' : 'Android cihazda kullanılması önerilir'}</Text>
          </View>
          {ready === null && <ActivityIndicator color="#8CA8FF" />}
        </View>

        <View style={styles.tabs}>
          {([['scan', 'TARA'], ['write', 'NDEF YAZ'], ['apdu', 'APDU'], ['copy', 'KOPYALA'], ['saved', 'KAYITLAR']] as const).map(([key, label]) => (
            <Pressable key={key} onPress={() => setTab(key)} style={[styles.tab, tab === key && styles.tabActive]}>
              <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {tab === 'scan' && <View style={styles.card}>
          <Text style={styles.cardTitle}>Kart / etiket tarama</Text>
          <Text style={styles.description}>Herhangi bir NFC kartını veya etiketini telefona yaklaştır. UID, teknoloji listesi, ATQA, SAK ve (varsa) NDEF kayıtları görüntülenir. Şifreli kart içeriği okunamaz.</Text>
          <Button label="KARTI TARA" onPress={scan} loading={loading} />
          {tag && <View style={styles.result}>
            <Info label="UID (kart kimliği)" value={tag.id} />
            <Info label="UID uzunluğu" value={tag.idLength ? `${tag.idLength} bayt` : 'Bilinmiyor'} />
            <Info label="Teknolojiler" value={tag.techTypes.join(', ') || 'Bilinmiyor'} />
            <Info label="Bağlanılan teknoloji" value={tag.connectedTech || 'Bilinmiyor'} />
            <Info label="ATQA" value={tag.atqa || 'Bu telefonda okunamadı'} />
            <Info label="SAK" value={tag.sak || 'Bu telefonda okunamadı'} />
            <Info label="Tahmini tür (kesin değil)" value={tag.cardGuess || 'Tahmin edilemedi'} />
            <Info label="Etiket türü" value={tag.type || 'Bilinmiyor'} />
            <Info label="Maksimum kapasite" value={tag.maxSize ? `${tag.maxSize} bayt` : 'Bilinmiyor'} />
            <Info label="Yazılabilir" value={tag.isWritable === undefined ? 'Bilinmiyor' : tag.isWritable ? 'Evet' : 'Hayır'} />
            <Text style={styles.label}>NDEF İÇERİĞİ</Text>
            <Text style={styles.value}>{tag.ndefText.length ? tag.ndefText.join('\n\n') : 'NDEF kaydı bulunamadı.'}</Text>
            <SaveBox name={recName} setName={setRecName} onSave={() => saveCurrent('scan')} disabled={loading} />
          </View>}
        </View>}

        {tab === 'write' && <View style={styles.card}>
          <Text style={styles.cardTitle}>NDEF metni yaz</Text>
          <Text style={styles.description}>Bu işlem etiketteki mevcut NDEF içeriğinin üzerine yazabilir. Boş veya önemsiz bir test etiketi kullan.</Text>
          <Text style={styles.label}>YAZILACAK METİN</Text>
          <TextInput value={textValue} onChangeText={setTextValue} multiline style={[styles.input, styles.multiline]} placeholder="Etikete yazılacak metin" placeholderTextColor="#68748A" />
          <Button label="ETİKETE YAZ" onPress={write} loading={loading} />
        </View>}

        {tab === 'apdu' && <View style={styles.card}>
          <Text style={styles.cardTitle}>ISO-DEP / APDU</Text>
          <Text style={styles.description}>ISO-DEP destekli kart için APDU komutu gönder. Komut baytlarını boşluklu veya bitişik hex biçiminde yaz.</Text>
          <Text style={styles.label}>APDU KOMUTU (HEX)</Text>
          <TextInput value={apdu} onChangeText={setApdu} autoCapitalize="characters" style={styles.input} placeholder="00 A4 04 00 00" placeholderTextColor="#68748A" />
          <Button label="APDU GÖNDER" onPress={send} loading={loading} />
          <Text style={styles.note}>Not: Örnek komut her karta uygun değildir. Kartın desteklediği komutları kullan.</Text>
        </View>}

        {tab === 'copy' && <View style={styles.card}>
          <Text style={styles.cardTitle}>Kart verisi: oku ve kopyala</Text>
          <Text style={styles.description}>NTAG ve MIFARE Ultralight türü kartların içeriğini hex ve metin olarak gösterir, sonra başka bir boş karta yazar. Yalnızca veri kopyalanır, kartın kimlik numarası (UID) kopyalanmaz. Şifreli kartlar (yakıt, kapı, ulaşım kartı) bu yöntemle okunamaz.</Text>
          <Button label="1) KAYNAK KARTI OKU" onPress={readDump} loading={loading} />
          <View style={{ height: 10 }} />
          <Button label="2) BAŞKA KARTA YAZ" onPress={copyDump} loading={loading} disabled={!dump} />
          {dump && <View style={styles.result}>
            <Info label="Kart" value={dump.kind} />
            <Info label="UID" value={dump.id} />
            <Text style={styles.label}>HAM VERİ (SAYFA: HEX  METİN)</Text>
            <Text selectable style={styles.mono}>{formatDump(dump)}</Text>
            <SaveBox name={recName} setName={setRecName} onSave={() => saveCurrent('dump')} disabled={loading} />
          </View>}
        </View>}

        {tab === 'saved' && <View style={styles.card}>
          <Text style={styles.cardTitle}>Kayıtlı veriler ({records.length})</Text>
          <Text style={styles.description}>Kayıtlar yalnızca bu telefonda saklanır. TARA veya KOPYALA sekmesinde kart okuttuktan sonra "BU VERİYİ KAYDET" düğmesine bas.</Text>
          {records.length === 0 && <Text style={styles.note}>Henüz kayıt yok.</Text>}
          {records.map((r) => <View key={r.id} style={styles.recordCard}>
            <Pressable onPress={() => setOpenId(openId === r.id ? null : r.id)}>
              <Text style={styles.recordTitle}>{r.name}</Text>
              <Text style={styles.muted}>{r.kind === 'dump' ? 'Ham veri' : 'Tarama'} • {formatDate(r.createdAt)}</Text>
              <Text style={styles.muted}>{openId === r.id ? 'Ayrıntıyı gizle' : 'Ayrıntı için dokun'}</Text>
            </Pressable>
            {openId === r.id && <View style={{ marginTop: 12 }}>
              <Text selectable style={styles.mono}>{recordToText(r)}</Text>
              <View style={styles.rowButtons}>
                <SmallButton label="PAYLAŞ" onPress={() => shareText(recordToText(r))} />
                {r.kind === 'dump' && <SmallButton label="KOPYALA SEKMESİNE AL" onPress={() => loadDumpFromRecord(r)} />}
                <SmallButton label="SİL" danger onPress={() => deleteRec(r)} />
              </View>
            </View>}
          </View>)}
          {records.length > 1 && <View style={{ marginTop: 14 }}>
            <Button label="TÜM KAYITLARI PAYLAŞ" onPress={() => shareText(records.map(recordToText).join('\n\n----------\n\n'))} loading={false} />
          </View>}
        </View>}

        <View style={styles.logCard}>
          <Text style={styles.label}>İŞLEM DURUMU</Text>
          <Text selectable style={styles.logText}>{log}</Text>
          {loading && <ActivityIndicator style={{ marginTop: 12 }} color="#8CA8FF" />}
          {loading && <Pressable onPress={cancelNfc} style={styles.cancel}><Text style={styles.cancelText}>İPTAL</Text></Pressable>}
        </View>
        <Text style={styles.footer}>NFC Analyzer • Yerel cihaz işlemleri • v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Button({ label, onPress, loading, disabled }: { label: string; onPress: () => void; loading: boolean; disabled?: boolean }) {
  return <Pressable disabled={loading || disabled} onPress={onPress} style={({ pressed }) => [styles.button, (pressed || loading || disabled) && { opacity: disabled ? 0.35 : 0.65 }]}>
    {loading ? <ActivityIndicator color="#07101D" /> : <Text style={styles.buttonText}>{label}</Text>}
  </Pressable>;
}
function SaveBox({ name, setName, onSave, disabled }: { name: string; setName: (v: string) => void; onSave: () => void; disabled: boolean }) {
  return <View style={styles.saveBox}>
    <Text style={styles.label}>KAYIT ADI (İSTEĞE BAĞLI)</Text>
    <TextInput value={name} onChangeText={setName} style={styles.input} placeholder="Örn. Yakıt kartı" placeholderTextColor="#68748A" />
    <Button label="BU VERİYİ KAYDET" onPress={onSave} loading={disabled} />
  </View>;
}
function SmallButton({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.smallBtn, danger && styles.smallBtnDanger, pressed && { opacity: 0.6 }]}>
    <Text style={[styles.smallBtnText, danger && { color: '#FF8A8A' }]}>{label}</Text>
  </Pressable>;
}
function Info({ label, value }: { label: string; value: string }) {
  return <View style={styles.infoRow}><Text style={styles.infoLabel}>{label}</Text><Text selectable style={styles.infoValue}>{value}</Text></View>;
}
function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/cancel/i.test(msg)) return 'İşlem iptal edildi.';
  if (/unsupported tag api/i.test(msg)) return `Bu kart bu işlemi desteklemiyor.\n(teknik: ${msg})`;
  if (/null object reference/i.test(msg)) return `Bu kart bu işlem için uygun türde değil.\n(teknik: ${msg})`;
  if (/transceive fail/i.test(msg)) return `Kart cevap vermedi veya bağlantı koptu. Kartı telefonun arkasında sabit tutup tekrar dene.\n(teknik: ${msg})`;
  return msg;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#080D18' },
  container: { padding: 20, paddingBottom: 36 },
  header: { marginTop: 18, marginBottom: 22 },
  kicker: { color: '#8CA8FF', fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  title: { color: '#F4F7FF', fontSize: 32, fontWeight: '900', marginTop: 7 },
  subtitle: { color: '#8D9AB0', fontSize: 14, marginTop: 5 },
  statusCard: { backgroundColor: '#111B2D', borderRadius: 16, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18, borderWidth: 1, borderColor: '#202D45' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusTitle: { color: '#F4F7FF', fontSize: 14, fontWeight: '800' },
  muted: { color: '#8390A7', fontSize: 12, marginTop: 3 },
  tabs: { flexDirection: 'row', backgroundColor: '#111B2D', padding: 5, borderRadius: 13, marginBottom: 16 },
  tab: { flex: 1, paddingVertical: 12, borderRadius: 9, alignItems: 'center' },
  tabActive: { backgroundColor: '#8CA8FF' },
  tabText: { color: '#8D9AB0', fontSize: 10, fontWeight: '900' },
  tabTextActive: { color: '#08101D' },
  card: { backgroundColor: '#111B2D', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#202D45' },
  cardTitle: { color: '#F4F7FF', fontSize: 19, fontWeight: '800' },
  description: { color: '#9AA7BC', fontSize: 13, lineHeight: 20, marginTop: 8, marginBottom: 18 },
  label: { color: '#7F91B0', fontSize: 10, fontWeight: '900', letterSpacing: 1.2, marginBottom: 8 },
  input: { backgroundColor: '#0A1221', borderWidth: 1, borderColor: '#2A3852', borderRadius: 11, padding: 13, color: '#F4F7FF', fontSize: 14, marginBottom: 14 },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  button: { backgroundColor: '#8CA8FF', borderRadius: 11, padding: 15, alignItems: 'center', minHeight: 50, justifyContent: 'center' },
  buttonText: { color: '#08101D', fontSize: 12, fontWeight: '900', letterSpacing: 0.6 },
  result: { marginTop: 20, borderTopWidth: 1, borderTopColor: '#2A3852', paddingTop: 15 },
  infoRow: { marginBottom: 12 },
  infoLabel: { color: '#7F91B0', fontSize: 11, marginBottom: 3 },
  infoValue: { color: '#F4F7FF', fontSize: 13, lineHeight: 19 },
  value: { color: '#D9E2F5', fontSize: 13, lineHeight: 20 },
  note: { color: '#E5B86A', fontSize: 11, lineHeight: 17, marginTop: 13 },
  logCard: { backgroundColor: '#0D1626', borderRadius: 14, padding: 15, marginTop: 16, borderWidth: 1, borderColor: '#202D45' },
  logText: { color: '#D9E2F5', fontSize: 12, lineHeight: 19 },
  mono: { color: '#D9E2F5', fontSize: 11, lineHeight: 17, fontFamily: Platform.select({ android: 'monospace', default: 'Courier' }) },
  cancel: { marginTop: 12, borderWidth: 1, borderColor: '#F4B860', borderRadius: 10, padding: 11, alignItems: 'center' },
  cancelText: { color: '#F4B860', fontSize: 12, fontWeight: '900', letterSpacing: 0.6 },
  saveBox: { marginTop: 20, borderTopWidth: 1, borderTopColor: '#2A3852', paddingTop: 15 },
  recordCard: { backgroundColor: '#0D1626', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#202D45' },
  recordTitle: { color: '#F4F7FF', fontSize: 15, fontWeight: '800', marginBottom: 4 },
  rowButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  smallBtn: { backgroundColor: '#1B2A45', borderRadius: 9, paddingVertical: 10, paddingHorizontal: 12 },
  smallBtnDanger: { backgroundColor: '#2A1A22' },
  smallBtnText: { color: '#8CA8FF', fontSize: 11, fontWeight: '900', letterSpacing: 0.4 },
  footer: { textAlign: 'center', color: '#53617A', fontSize: 10, marginTop: 22 }
});
