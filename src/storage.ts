import AsyncStorage from '@react-native-async-storage/async-storage';
import { TagInfo, UltralightDump, formatDump } from './nfcService';

const KEY = 'nfc-analyzer/records/v1';

export type SavedRecord = {
  id: string;
  kind: 'scan' | 'dump';
  name: string;
  createdAt: number;
  scan?: TagInfo;
  dump?: UltralightDump;
};

export async function loadRecords(): Promise<SavedRecord[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Bozuk veri varsa üzerine yazmadan önce yedeğini sakla
    await AsyncStorage.setItem(`${KEY}.bozuk-yedek`, raw);
    return [];
  }
}

export async function addRecord(r: Omit<SavedRecord, 'id' | 'createdAt'>): Promise<SavedRecord[]> {
  const list = await loadRecords();
  const item: SavedRecord = {
    ...r,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  };
  const next = [item, ...list];
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export async function removeRecord(id: string): Promise<SavedRecord[]> {
  const next = (await loadRecords()).filter((r) => r.id !== id);
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function formatDate(ts: number): string {
  try {
    return new Date(ts).toLocaleString('tr-TR');
  } catch {
    return new Date(ts).toISOString();
  }
}

export function recordToText(r: SavedRecord): string {
  const lines: string[] = [
    'NFC Analyzer kaydı',
    `Ad: ${r.name}`,
    `Tarih: ${formatDate(r.createdAt)}`,
    `Tür: ${r.kind === 'dump' ? 'Ham veri' : 'Tarama'}`,
  ];
  if (r.scan) {
    const t = r.scan;
    lines.push(
      `UID: ${t.id} (${t.idLength} bayt)`,
      `Teknolojiler: ${t.techTypes.join(', ') || 'Bilinmiyor'}`,
      `ATQA: ${t.atqa ?? 'okunamadı'}`,
      `SAK: ${t.sak ?? 'okunamadı'}`,
      `Tahmini tür: ${t.cardGuess ?? 'tahmin edilemedi'}`,
      `Etiket türü: ${t.type ?? 'bilinmiyor'}`,
      `Kapasite: ${t.maxSize ? `${t.maxSize} bayt` : 'bilinmiyor'}`,
      `NDEF: ${t.ndefText.length ? t.ndefText.join(' | ') : 'kayıt yok'}`,
    );
  }
  if (r.dump) {
    lines.push(`Kart: ${r.dump.kind}`, `UID: ${r.dump.id}`, '', formatDump(r.dump));
  }
  return lines.join('\n');
}
