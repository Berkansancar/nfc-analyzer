import NfcManager, { Ndef, NfcTech } from 'react-native-nfc-manager';

export type TagInfo = {
  id: string;
  techTypes: string[];
  type?: string;
  maxSize?: number;
  isWritable?: boolean;
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

async function withTechnology<T>(tech: NfcTech, action: () => Promise<T>): Promise<T> {
  if (busy) throw new Error('Başka bir NFC işlemi devam ediyor.');
  busy = true;
  let requested = false;
  try {
    await initNfc();
    requested = true;
    await NfcManager.requestTechnology(tech);
    return await action();
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

export async function scanNdefTag(): Promise<TagInfo> {
  return withTechnology(NfcTech.Ndef, async () => {
    const tag = await NfcManager.getTag();
    if (!tag) throw new Error('Etiket bilgisi alınamadı.');
    return {
      id: tag.id ?? 'Bilinmiyor',
      techTypes: tag.techTypes ?? [],
      type: tag.type,
      maxSize: tag.maxSize,
      isWritable: tag.isWritable,
      ndefText: decodeNdefRecords(tag.ndefMessage ?? []),
    };
  });
}

export async function writeNdefText(value: string): Promise<void> {
  const text = value.trim();
  if (!text) throw new Error('Yazılacak metin boş olamaz.');
  await withTechnology(NfcTech.Ndef, async () => {
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

export function toHex(bytes: number[] | Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join(' ').toUpperCase();
}
