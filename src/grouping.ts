import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library/legacy';
import { decode as decodeJpeg } from 'jpeg-js';

// How we find similar photos, all on the phone:
// 1. Photos taken close together in time are candidates (bursts, retakes).
// 2. For each candidate we make a small preview, then shrink that to a tiny 9x8
//    grey picture and turn it into a 64-bit "fingerprint" (a difference hash).
//    Photos that look alike have fingerprints that differ in only a few bits.
// 3. A photo joins a group if it looks like ANY photo already in the group.
// 4. Groups next to each other that look alike are merged.

export type GroupSize = 'small' | 'medium' | 'large';

// maxGapMs: photos further apart in time than this never share a group.
// maxDistance: how many of the 64 fingerprint bits may differ for "looks alike".
const SETTINGS: Record<GroupSize, { maxGapMs: number; maxDistance: number }> = {
  small: { maxGapMs: 60 * 1000, maxDistance: 12 },
  medium: { maxGapMs: 5 * 60 * 1000, maxDistance: 20 },
  large: { maxGapMs: 15 * 60 * 1000, maxDistance: 26 },
};
// The widest time window of any setting; we fingerprint everything inside it once,
// so switching between Small / Medium / Large is instant.
const WIDEST_GAP_MS = Math.max(...Object.values(SETTINGS).map((s) => s.maxGapMs));

export type DeckItem =
  | { kind: 'photo'; key: string; asset: MediaLibrary.Asset }
  | { kind: 'group'; key: string; assets: MediaLibrary.Asset[] };
export type PhotoGroup = Extract<DeckItem, { kind: 'group' }>;

type Fingerprint = Uint8Array | null;
// Fingerprints already worked out, kept while the app is open.
const hashCache = new Map<string, Fingerprint>();
// Small preview files made while fingerprinting, used for thumbnails.
export const previewCache = new Map<string, string>();

// Works out fingerprints for every photo that has a neighbour within the widest
// time window. Slow the first time, instant after that.
export async function prepareFingerprints(
  photos: MediaLibrary.Asset[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const candidates = photos.filter((p, i) => {
    const prev = photos[i - 1];
    const next = photos[i + 1];
    const near = (o?: MediaLibrary.Asset) =>
      !!o && Math.abs(o.creationTime - p.creationTime) <= WIDEST_GAP_MS;
    return near(prev) || near(next);
  });
  const todo = candidates.filter((p) => !hashCache.has(p.id));
  let done = candidates.length - todo.length;
  onProgress?.(done, candidates.length);

  // Two at a time: faster than one, without using too much memory.
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const photo = todo[next++];
      hashCache.set(photo.id, await fingerprint(photo));
      done++;
      if (done % 5 === 0 || done === candidates.length) onProgress?.(done, candidates.length);
    }
  };
  await Promise.all([worker(), worker()]);
}

// Groups photos (sorted newest first) using fingerprints from prepareFingerprints.
export function groupPhotos(photos: MediaLibrary.Asset[], size: GroupSize): DeckItem[] {
  const { maxGapMs, maxDistance } = SETTINGS[size];
  const alike = (a: MediaLibrary.Asset, b: MediaLibrary.Asset) =>
    distance(hashCache.get(a.id), hashCache.get(b.id)) <= maxDistance;
  const close = (a: MediaLibrary.Asset, b: MediaLibrary.Asset) =>
    Math.abs(a.creationTime - b.creationTime) <= maxGapMs;

  // Steps 1 and 3: walk through the photos; a photo joins a recent group if it's
  // close in time and looks like any photo in that group. We look back a few
  // groups, so one odd photo in the middle of a burst doesn't split it.
  let groups: MediaLibrary.Asset[][] = [];
  for (const photo of photos) {
    let home: MediaLibrary.Asset[] | undefined;
    for (let i = groups.length - 1; i >= Math.max(0, groups.length - 4); i--) {
      const g = groups[i];
      if (!close(g[g.length - 1], photo)) break;
      if (g.some((m) => alike(m, photo))) {
        home = g;
        break;
      }
    }
    if (home) home.push(photo);
    else groups.push([photo]);
  }

  // Step 4: merge neighbouring groups that are close in time and look alike.
  let merged = true;
  while (merged) {
    merged = false;
    const out: MediaLibrary.Asset[][] = [];
    for (const group of groups) {
      const prev = out[out.length - 1];
      if (
        prev &&
        prev.some((a) => group.some((b) => close(a, b))) &&
        prev.some((a) => group.some((b) => alike(a, b)))
      ) {
        prev.push(...group);
        merged = true;
      } else out.push(group);
    }
    groups = out;
  }

  return groups.map((g) =>
    g.length === 1
      ? { kind: 'photo', key: g[0].id, asset: g[0] }
      : { kind: 'group', key: 'group:' + g[0].id, assets: g },
  );
}

function distance(a: Fingerprint | undefined, b: Fingerprint | undefined): number {
  if (!a || !b) return Infinity;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

// Returns 64 bits (one per array entry, 0 or 1), or null if the photo can't be read
// (for example when it's only stored in iCloud).
async function fingerprint(photo: MediaLibrary.Asset): Promise<Fingerprint> {
  try {
    const info = await MediaLibrary.getAssetInfoAsync(photo, { shouldDownloadFromNetwork: false });
    const uri = info.localUri ?? (photo.uri.startsWith('file:') ? photo.uri : null);
    if (!uri) return null;

    // A small preview first (also used for thumbnails), so the big photo is
    // only opened once and then let go.
    const big = ImageManipulator.manipulate(uri).resize({ width: 240 });
    const bigRef = await big.renderAsync();
    const preview = await bigRef.saveAsync({ format: SaveFormat.JPEG, compress: 0.7 });
    big.release();
    bigRef.release();
    previewCache.set(photo.id, preview.uri);

    const tiny = ImageManipulator.manipulate(preview.uri).resize({ width: 9, height: 8 });
    const tinyRef = await tiny.renderAsync();
    const result = await tinyRef.saveAsync({ format: SaveFormat.JPEG, compress: 1, base64: true });
    tiny.release();
    tinyRef.release();
    if (!result.base64) return null;

    const { data, width, height } = decodeJpeg(base64ToBytes(result.base64), {
      useTArray: true,
      formatAsRGBA: false,
    });
    if (width < 9 || height < 8) return null;

    const grey = (x: number, y: number) => {
      const i = (y * width + x) * 3;
      return data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    };
    const bits = new Uint8Array(64);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) bits[y * 8 + x] = grey(x, y) > grey(x + 1, y) ? 1 : 0;
    return bits;
  } catch {
    return null;
  }
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = new Uint8Array(256);
for (let i = 0; i < B64.length; i++) B64_LOOKUP[B64.charCodeAt(i)] = i;

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64_LOOKUP[clean.charCodeAt(i)];
    const b = B64_LOOKUP[clean.charCodeAt(i + 1)];
    const c = B64_LOOKUP[clean.charCodeAt(i + 2)];
    const d = B64_LOOKUP[clean.charCodeAt(i + 3)];
    bytes[p++] = (a << 2) | (b >> 4);
    if (i + 2 < clean.length) bytes[p++] = ((b & 15) << 4) | (c >> 2);
    if (i + 3 < clean.length) bytes[p++] = ((c & 3) << 6) | d;
  }
  return bytes;
}

// Exposed for testing.
export const _test = { hashCache, distance };
