import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library/legacy';
import { decode as decodeJpeg } from 'jpeg-js';

// How we find similar photos, all on the phone:
// 1. Photos taken close together in time are candidates (bursts, retakes).
// 2. For those, we shrink each photo to a tiny 9x8 grey picture and turn it into
//    a 64-bit "fingerprint" (a difference hash). Photos that look alike have
//    fingerprints that differ in only a few bits.
// 3. Neighbouring photos with close fingerprints go into the same group.

// Photos taken at most this far apart can be in the same group.
const MAX_GAP_MS = 60 * 1000;
// Fingerprints differing in at most this many of 64 bits count as "looking alike".
const MAX_DISTANCE = 14;

export type PhotoGroup = Extract<DeckItem, { kind: 'group' }>;

export type DeckItem =
  | { kind: 'photo'; key: string; asset: MediaLibrary.Asset }
  | { kind: 'group'; key: string; assets: MediaLibrary.Asset[] };

// Fingerprints already worked out, so regrouping (e.g. the undecided round) is instant.
const hashCache = new Map<string, Uint8Array | null>();

export async function groupPhotos(
  photos: MediaLibrary.Asset[],
  onProgress?: (done: number, total: number) => void,
): Promise<DeckItem[]> {
  // Step 1: split into runs of photos taken close together.
  const runs: MediaLibrary.Asset[][] = [];
  for (const photo of photos) {
    const run = runs[runs.length - 1];
    const prev = run?.[run.length - 1];
    if (prev && Math.abs(prev.creationTime - photo.creationTime) <= MAX_GAP_MS) run.push(photo);
    else runs.push([photo]);
  }

  // Step 2: fingerprint only photos that have a close-in-time neighbour.
  const candidates = runs.filter((r) => r.length > 1).flat();
  let done = 0;
  onProgress?.(0, candidates.length);
  // A few at a time, so it's faster without overloading the phone.
  let next = 0;
  const worker = async () => {
    while (next < candidates.length) {
      const photo = candidates[next++];
      if (!hashCache.has(photo.id)) hashCache.set(photo.id, await fingerprint(photo));
      done++;
      if (done % 5 === 0 || done === candidates.length) onProgress?.(done, candidates.length);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);

  // Step 3: inside each run, keep neighbours together while they look alike.
  const items: DeckItem[] = [];
  for (const run of runs) {
    let group: MediaLibrary.Asset[] = [];
    const flush = () => {
      if (group.length === 1) items.push({ kind: 'photo', key: group[0].id, asset: group[0] });
      else if (group.length > 1) items.push({ kind: 'group', key: 'group:' + group[0].id, assets: group });
      group = [];
    };
    for (const photo of run) {
      const prev = group[group.length - 1];
      if (prev && !alike(hashCache.get(prev.id), hashCache.get(photo.id))) flush();
      group.push(photo);
    }
    flush();
  }
  return items;
}

function alike(a: Uint8Array | null | undefined, b: Uint8Array | null | undefined): boolean {
  if (!a || !b) return false;
  let distance = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) distance++;
  return distance <= MAX_DISTANCE;
}

// Returns 64 bits (one per array entry, 0 or 1), or null if the photo can't be read
// (for example when it's only stored in iCloud).
async function fingerprint(photo: MediaLibrary.Asset): Promise<Uint8Array | null> {
  try {
    const info = await MediaLibrary.getAssetInfoAsync(photo, { shouldDownloadFromNetwork: false });
    const uri = info.localUri ?? (photo.uri.startsWith('file:') ? photo.uri : null);
    if (!uri) return null;

    const context = ImageManipulator.manipulate(uri).resize({ width: 9, height: 8 });
    const image = await context.renderAsync();
    const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 1, base64: true });
    context.release();
    image.release();
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
export const _test = { base64ToBytes, alike };
