import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library/legacy';
import { useEffect, useState } from 'react';
import { ImageStyle, Platform, StyleProp, View } from 'react-native';
import { previewCache } from './grouping';
import { colors } from './theme';

// Remembers each photo's file address so a photo shown twice (for example the
// next card becoming the current card) appears instantly the second time.
const localUriCache = new Map<string, string>();

type Props = {
  asset: MediaLibrary.Asset;
  style: StyleProp<ImageStyle>;
  contentFit?: 'cover' | 'contain';
  // Small tiles: use the small preview file if we already made one (saves memory).
  small?: boolean;
};

// On iPhone, gallery photos have "ph://" addresses that the image viewer in
// Expo Go can't always open. So we ask the photo library for the photo's real
// file on the phone ("file://...") and show that instead.
export default function PhotoThumb({ asset, style, contentFit = 'cover', small }: Props) {
  const preview = small ? previewCache.get(asset.id) : undefined;
  const [uri, setUri] = useState<string | null>(
    preview ?? (Platform.OS === 'ios' ? (localUriCache.get(asset.id) ?? null) : asset.uri),
  );

  useEffect(() => {
    if (preview || Platform.OS !== 'ios' || localUriCache.has(asset.id)) return;
    let cancelled = false;
    MediaLibrary.getAssetInfoAsync(asset, { shouldDownloadFromNetwork: false })
      .then((info) => {
        if (!info.localUri) return;
        localUriCache.set(asset.id, info.localUri);
        if (!cancelled) setUri(info.localUri);
      })
      .catch(() => {
        // Photo isn't available on the phone (e.g. only in iCloud); leave the tile empty.
      });
    return () => {
      cancelled = true;
    };
  }, [asset.id]);

  if (!uri) return <View style={[style as object, { backgroundColor: colors.surfaceHigh }]} />;
  return (
    <Image
      source={{ uri }}
      style={style}
      contentFit={contentFit}
      recyclingKey={asset.id}
      cachePolicy="memory-disk"
      transition={0}
    />
  );
}
