import React, { useEffect, useState } from 'react';
import {
  SafeAreaView, ScrollView, View, Text, TextInput, Pressable,
  StyleSheet, ActivityIndicator, StatusBar, Platform
} from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { initNfc, scanNdefTag, writeNdefText, sendIsoDepApdu, TagInfo } from './src/nfcService';

type Tab = 'scan' | 'write' | 'apdu';

export default function App() {
  const [tab, setTab] = useState<Tab>('scan');
  const [ready, setReady] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState('Uygulama hazır. NFC işlemi başlatmak için bir sekme seç.');
  const [tag, setTag] = useState<TagInfo | null>(null);
  const [textValue, setTextValue] = useState('Merhaba NFC!');
  const [apdu, setApdu] = useState('00 A4 04 00 00');

  useEffect(() => {
    initNfc().then(setReady).catch((e) => {
      setReady(false);
      setLog(errorText(e));
    });
  }, []);

  const run = async (fn: () => Promise<void>) => {
    if (loading) return;
    setLoading(true);
    try { await fn(); }
    catch (e) { setLog(`HATA: ${errorText(e)}`); }
    finally { setLoading(false); }
  };

  const scan = () => run(async () => {
    setLog('NDEF etiketi bekleniyor. Telefonun NFC antenini etikete yaklaştır.');
    const result = await scanNdefTag();
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
          {([['scan', 'TARA'], ['write', 'NDEF YAZ'], ['apdu', 'APDU']] as const).map(([key, label]) => (
            <Pressable key={key} onPress={() => setTab(key)} style={[styles.tab, tab === key && styles.tabActive]}>
              <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {tab === 'scan' && <View style={styles.card}>
          <Text style={styles.cardTitle}>Etiket tarama</Text>
          <Text style={styles.description}>NDEF destekli bir NFC etiketi telefona yaklaştır. UID, teknoloji ve NDEF kayıtları görüntülenir.</Text>
          <Button label="NFC ETİKETİNİ TARA" onPress={scan} loading={loading} />
          {tag && <View style={styles.result}>
            <Info label="UID" value={tag.id} />
            <Info label="Teknoloji" value={tag.techTypes.join(', ') || 'Bilinmiyor'} />
            <Info label="Tür" value={tag.type || 'Bilinmiyor'} />
            <Info label="Maksimum kapasite" value={tag.maxSize ? `${tag.maxSize} bayt` : 'Bilinmiyor'} />
            <Info label="Yazılabilir" value={tag.isWritable === undefined ? 'Bilinmiyor' : tag.isWritable ? 'Evet' : 'Hayır'} />
            <Text style={styles.label}>NDEF İÇERİĞİ</Text>
            <Text style={styles.value}>{tag.ndefText.length ? tag.ndefText.join('\n\n') : 'NDEF kaydı bulunamadı.'}</Text>
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

        <View style={styles.logCard}>
          <Text style={styles.label}>İŞLEM DURUMU</Text>
          <Text selectable style={styles.logText}>{log}</Text>
          {loading && <ActivityIndicator style={{ marginTop: 12 }} color="#8CA8FF" />}
        </View>
        <Text style={styles.footer}>NFC Analyzer • Yerel cihaz işlemleri • v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Button({ label, onPress, loading }: { label: string; onPress: () => void; loading: boolean }) {
  return <Pressable disabled={loading} onPress={onPress} style={({ pressed }) => [styles.button, (pressed || loading) && { opacity: 0.65 }]}>
    {loading ? <ActivityIndicator color="#07101D" /> : <Text style={styles.buttonText}>{label}</Text>}
  </Pressable>;
}
function Info({ label, value }: { label: string; value: string }) {
  return <View style={styles.infoRow}><Text style={styles.infoLabel}>{label}</Text><Text selectable style={styles.infoValue}>{value}</Text></View>;
}
function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
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
  tabText: { color: '#8D9AB0', fontSize: 11, fontWeight: '900' },
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
  footer: { textAlign: 'center', color: '#53617A', fontSize: 10, marginTop: 22 }
});
