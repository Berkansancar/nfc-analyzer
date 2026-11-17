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
    return {
      id: formatUid(tag.id),
      idLength: Math.floor(idClean.length / 2),
      techTypes: (tag.techTypes ?? []).map(shortTech),
      connectedTech: connected ? shortTech(connected) : undefined,
      type: tag.type,
      maxSize: tag.maxSize,
      isWritable: tag.isWritable,
      atqa,
      sak,
      cardGuess: guessCardFromSak(sakNumber),
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
