import NfcManager, { Ndef, NfcTech } from 'react-native-nfc-manager';

export type TagInfo = {
  id: string;
  idLength: number;
  techTypes: string[];
  connectedTech?: string;
  type?: string;
  maxSize?: number;
  isWritable?: boolean;
  atqa?: string;
  sak?: string;
  cardGuess?: string;
  ndefText: string[];
};

let started = false;
let busy = false;

export async function initNfc(): Promise<boolean> {
  if (!started) {
    const supported = await NfcManager.isSupported();
    if (!supported) return false;
    await NfcManager.start();
    started = true;
  }
  return NfcManager.isEnabled();
}

async function withTechnology<T>(tech: NfcTech | NfcTech[], action: (connected: string | null) => Promise<T>): Promise<T> {
  if (busy) throw new Error('Başka bir NFC işlemi devam ediyor.');
  busy = true;
  let requested = false;
  try {
    await initNfc();
    requested = true;
    const connected = (await NfcManager.requestTechnology(tech)) as unknown as string | null;
    return await action(connected ?? null);
  } finally {
    try {
      if (requested) await NfcManager.cancelTechnologyRequest();
    } catch {}
    busy = false;
  }
}

function decodeNdefRecords(records: any[] = []): string[] {
  return records.map((record, index) => {
    try {
      const type = Array.isArray(record.type)
        ? String.fromCharCode(...record.type)
        : String(record.type ?? '');
      if (type === 'T') return `Metin: ${Ndef.text.decodePayload(new Uint8Array(record.payload))}`;
      if (type === 'U') return `Bağlantı: ${Ndef.uri.decodePayload(new Uint8Array(record.payload))}`;
      return `Kayıt ${index + 1} | TNF: ${record.tnf} | Tür: ${type || 'bilinmiyor'} | Veri: ${toHex(record.payload ?? [])}`;
    } catch {
      return `Kayıt ${index + 1} | Veri: ${toHex(record.payload ?? [])}`;
    }
  });
}

// Her tür NFC kartı/etiketi için: NfcA ilk sırada, çünkü ATQA ve SAK ancak NfcA bağlıyken okunabilir.
const ALL_TECHS = [
  NfcTech.NfcA,
  NfcTech.IsoDep,
  NfcTech.MifareClassic,
  NfcTech.MifareUltralight,
  NfcTech.Ndef,
  NfcTech.NfcB,
  NfcTech.NfcF,
  NfcTech.NfcV,
];

export function shortTech(name: string): string {
  return String(name).replace(/^android\.nfc\.tech\./, '');
}

export function formatUid(id?: string): string {
  const clean = String(id ?? '').replace(/[^0-9a-f]/gi, '');
  if (!clean) return 'Bilinmiyor';
  return (clean.match(/.{1,2}/g) ?? []).join(' ').toUpperCase();
}

// SAK değerine göre kabaca kart türü tahmini (kesin değildir).
export function guessCardFromSak(sak?: number): string | undefined {
  switch (sak) {
    case 0x00: return 'MIFARE Ultralight / NTAG türü etiket olabilir';
    case 0x08: return 'MIFARE Classic 1K olabilir';
    case 0x09: return 'MIFARE Mini olabilir';
    case 0x18: return 'MIFARE Classic 4K olabilir';
    case 0x20: return 'ISO-DEP (ISO 14443-4) kart: akıllı kart, DESFire veya banka/ödeme kartı olabilir';
    case 0x28: return 'MIFARE Classic 1K + ISO-DEP olabilir';
    case 0x38: return 'MIFARE Classic 4K + ISO-DEP olabilir';
    default: return sak === undefined ? undefined : 'Bilinmeyen tür';
  }
}

// ATQA/SAK okunamayan telefonlarda teknoloji listesine bakarak kabaca tür tahmini (kesin değildir).
export function guessCardFromTech(techs: string[]): string | undefined {
  if (techs.includes('MifareClassic')) return 'MIFARE Classic ailesi (1K, 4K veya Mini). İçeriği anahtarla korunur';
  if (techs.includes('MifareUltralight')) return 'MIFARE Ultralight / NTAG türü etiket';
  if (techs.includes('IsoDep')) return 'ISO-DEP (ISO 14443-4) kart: akıllı kart, DESFire veya banka/ödeme kartı olabilir';
  if (techs.includes('NfcV')) return 'ISO 15693 (NfcV) etiket';
  if (techs.includes('NfcF')) return 'FeliCa (NfcF) kart';
  if (techs.includes('NfcB')) return 'ISO 14443-B kart';
  return undefined;
}

export async function scanAnyTag(): Promise<TagInfo> {
  return withTechnology(ALL_TECHS, async (connected) => {
    const tag: any = await NfcManager.getTag();
    if (!tag) throw new Error('Kart bilgisi alınamadı.');

    let atqa: string | undefined;
    let sak: string | undefined;
    let sakNumber: number | undefined;
    if (connected === NfcTech.NfcA) {
      try {
        const a = await (NfcManager as any).nfcAHandler?.getAtqa?.();
        if (a !== undefined && a !== null) atqa = Array.isArray(a) ? toHex(a) : String(a);
      } catch {}
      try {
        const k = await (NfcManager as any).nfcAHandler?.getSak?.();
        if (typeof k === 'number') {
          sakNumber = k & 0xff;
          sak = sakNumber.toString(16).padStart(2, '0').toUpperCase();
        }
      } catch {}
    }

    const idClean = String(tag.id ?? '').replace(/[^0-9a-f]/gi, '');
    const techs: string[] = (tag.techTypes ?? []).map(shortTech);
    return {
      id: formatUid(tag.id),
      idLength: Math.floor(idClean.length / 2),
      techTypes: techs,
      connectedTech: connected ? shortTech(connected) : undefined,
      type: tag.type,
      maxSize: tag.maxSize,
      isWritable: tag.isWritable,
      atqa,
      sak,
      cardGuess: guessCardFromSak(sakNumber) ?? guessCardFromTech(techs),
      ndefText: decodeNdefRecords(tag.ndefMessage ?? []),
    };
  });
}

export async function writeNdefText(value: string): Promise<void> {
  const text = value.trim();
  if (!text) throw new Error('Yazılacak metin boş olamaz.');
  await withTechnology(NfcTech.Ndef, async () => {
    const tag: any = await NfcManager.getTag();
    const techs: string[] = (tag?.techTypes ?? []).map(shortTech);
    if (!techs.includes('Ndef')) {
      throw new Error(`Bu kart NDEF yazmayı desteklemiyor (kartın teknolojileri: ${techs.join(', ') || 'bilinmiyor'}). NDEF yazmak için NDEF biçimli bir NTAG etiketi kullan.`);
    }
    const bytes = Ndef.encodeMessage([Ndef.textRecord(text)]);
    if (!bytes?.length) throw new Error('NDEF mesajı oluşturulamadı.');
    await NfcManager.ndefHandler.writeNdefMessage(bytes);
  });
}

export async function sendIsoDepApdu(hex: string): Promise<string> {
  const cleaned = hex.replace(/\s+/g, '').replace(/^0x/i, '');
  if (!cleaned || cleaned.length % 2 || !/^[0-9a-f]+$/i.test(cleaned)) {
    throw new Error('APDU yalnızca çift sayıda geçerli hex karakter içermeli. Örnek: 00 A4 04 00 00');
  }
  const bytes = cleaned.match(/.{2}/g)!.map((v) => parseInt(v, 16));
  return withTechnology(NfcTech.IsoDep, async () => {
    const response = await NfcManager.isoDepHandler.transceive(bytes);
    return toHex(response);
  });
}

// ---------- NTAG / MIFARE Ultralight: ham veriyi oku, göster, kopyala ----------

export type UltralightDump = {
  id: string;
  header: number[][];       // sayfa 0-3 (UID, kilit, yetenek bilgisi): gösterilir, KOPYALANMAZ
  userStartPage: number;    // kullanıcı verisinin ilk sayfası (4)
  pages: number[][];        // kullanıcı verisi, her sayfa 4 bayt
  userBytes: number;
  kind: string;
};

function ulHandler(): any {
  const h = (NfcManager as any).mifareUltralightHandlerAndroid;
  if (!h?.mifareUltralightReadPages || !h?.mifareUltralightWritePage) {
    throw new Error('Bu uygulama sürümünde NTAG/Ultralight okuma-yazma desteği bulunamadı.');
  }
  return h;
}

// Kapasiteyi sayfa 3'ten (Capability Container) anlar. NTAG'de ilk bayt 0xE1, 3. bayt = boyut/8.
function userBytesFromHeader(header: number[][]): { userBytes: number; kind: string } {
  const cc = header[3] ?? [];
  if (cc[0] === 0xe1) {
    const n = (cc[2] ?? 0) * 8;
    if (n <= 0 || n > 888) throw new Error('Kartın kapasitesi okunamadı.');
    return { userBytes: n, kind: `NTAG tipi (${n} bayt kullanıcı alanı)` };
  }
  return { userBytes: 48, kind: 'MIFARE Ultralight tipi (48 bayt kullanıcı alanı)' };
}

function requireUltralight(tag: any): void {
  const techs: string[] = (tag?.techTypes ?? []).map(shortTech);
  if (!techs.includes('MifareUltralight')) {
    throw new Error(`Bu kart NTAG / MIFARE Ultralight türü değil (kartın teknolojileri: ${techs.join(', ') || 'bilinmiyor'}). KOPYALA sekmesi yalnızca NTAG ve Ultralight kartlarda çalışır.`);
  }
}

function splitPages(bytes: number[]): number[][] {
  const pages: number[][] = [];
  for (let i = 0; i + 3 < bytes.length; i += 4) pages.push(bytes.slice(i, i + 4));
  return pages;
}

export async function readUltralightDump(): Promise<UltralightDump> {
  return withTechnology(NfcTech.MifareUltralight, async () => {
    const h = ulHandler();
    const tag: any = await NfcManager.getTag();
    requireUltralight(tag);
    const header = splitPages(await h.mifareUltralightReadPages(0)).slice(0, 4);
    if (header.length < 4) throw new Error('Kartın başlık bilgisi okunamadı.');
    const { userBytes, kind } = userBytesFromHeader(header);
    const userPages = userBytes / 4;
    const pages: number[][] = [];
    for (let p = 4; p < 4 + userPages; p += 4) {
      const chunk = splitPages(await h.mifareUltralightReadPages(p));
      for (const page of chunk) {
        if (pages.length < userPages) pages.push(page);
      }
    }
    if (pages.length !== userPages) throw new Error('Kart verisi eksik okundu. Kartı sabit tutup tekrar dene.');
    return { id: formatUid(tag?.id), header, userStartPage: 4, pages, userBytes, kind };
  });
}

export async function writeUltralightDump(dump: UltralightDump): Promise<{ written: number; verified: boolean }> {
  return withTechnology(NfcTech.MifareUltralight, async () => {
    const h = ulHandler();
    const tag: any = await NfcManager.getTag();
    requireUltralight(tag);
    if (formatUid(tag?.id) === dump.id) {
      throw new Error('Bu, kaynak kartın kendisi. Veriyi yazmak için boş ve farklı bir kart okut.');
    }
    const header = splitPages(await h.mifareUltralightReadPages(0)).slice(0, 4);
    if (header.length < 4) throw new Error('Hedef kartın başlık bilgisi okunamadı.');
    const target = userBytesFromHeader(header);
    if (target.userBytes < dump.userBytes) {
      throw new Error(`Hedef kartın kapasitesi (${target.userBytes} bayt) kaynak kartınkinden (${dump.userBytes} bayt) küçük.`);
    }
    // Sayfa 0-3 (UID, kilit baytları, OTP) ASLA yazılmaz; yanlış yazım kartı kalıcı kilitleyebilir.
    for (let i = 0; i < dump.pages.length; i++) {
      await h.mifareUltralightWritePage(dump.userStartPage + i, dump.pages[i]);
    }
    // Doğrulama: yazılanı geri oku ve karşılaştır
    const back: number[][] = [];
    for (let p = dump.userStartPage; p < dump.userStartPage + dump.pages.length; p += 4) {
      for (const page of splitPages(await h.mifareUltralightReadPages(p))) {
        if (back.length < dump.pages.length) back.push(page);
      }
    }
    const verified = back.length === dump.pages.length &&
      back.every((pg, i) => pg.every((b, j) => b === dump.pages[i][j]));
    return { written: dump.pages.length, verified };
  });
}

export function formatDump(dump: UltralightDump): string {
  const line = (page: number, b: number[]) =>
    `${String(page).padStart(3, '0')}: ${toHex(b)}  ${b.map((c) => (c >= 32 && c < 127 ? String.fromCharCode(c) : '.')).join('')}`;
  const head = dump.header.map((b, i) => line(i, b)).join('\n');
  const body = dump.pages.map((b, i) => line(dump.userStartPage + i, b)).join('\n');
  return `BAŞLIK (kopyalanmaz)\n${head}\n\nKULLANICI VERİSİ\n${body}`;
}

export async function cancelNfc(): Promise<void> {
  try { await NfcManager.cancelTechnologyRequest(); } catch {}
}

export function toHex(bytes: number[] | Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join(' ').toUpperCase();
}
