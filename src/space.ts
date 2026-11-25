import AsyncStorage from '@react-native-async-storage/async-storage';
import { getInfoAsync } from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library/legacy';

// The "space freed" counter: how much storage the deleted photos took up.

const STORAGE_KEY = 'pare.freedBytes';

// Size of one photo's file in bytes, or 0 if we can't tell (e.g. only in iCloud).
async function photoSize(photo: MediaLibrary.Asset): Promise<number> {
  try {
    let uri = photo.uri.startsWith('file:') ? photo.uri : null;
    if (!uri) {
      const info = await MediaLibrary.getAssetInfoAsync(photo, { shouldDownloadFromNetwork: false });
      uri = info.localUri ?? null;
    }
    if (!uri) return 0;
    const file = await getInfoAsync(uri);
    return file.exists ? file.size : 0;
  } catch {
    return 0;
  }
}

// Total size of several photos. Call this BEFORE deleting them.
export async function totalSize(photos: MediaLibrary.Asset[]): Promise<number> {
  let total = 0;
  let next = 0;
  const worker = async () => {
    while (next < photos.length) total += await photoSize(photos[next++]);
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return total;
}

// "1.8 GB", "640 MB" (Turkish: "1,8 GB").
export function formatBytes(bytes: number, locale: string): string {
  const fmt = (n: number, digits: number) =>
    n.toLocaleString(locale, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  if (bytes >= 1e9) return `${fmt(bytes / 1e9, 1)} GB`;
  if (bytes >= 1e6) return `${fmt(bytes / 1e6, 0)} MB`;
  return `${fmt(Math.max(bytes, 0) / 1e3, 0)} KB`;
}

// Running total of everything Pare has freed, kept between app launches.
export async function getTotalFreed(): Promise<number> {
  try {
    return Number((await AsyncStorage.getItem(STORAGE_KEY)) ?? 0) || 0;
  } catch {
    return 0;
  }
}

export async function addToTotalFreed(bytes: number): Promise<void> {
  try {
    const total = (await getTotalFreed()) + bytes;
    await AsyncStorage.setItem(STORAGE_KEY, String(total));
  } catch {}
}
