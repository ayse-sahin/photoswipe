import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library/legacy';
import { useEffect, useState } from 'react';
import { ImageStyle, Platform, StyleProp, View } from 'react-native';

type Props = {
  asset: MediaLibrary.Asset;
  style: StyleProp<ImageStyle>;
};

// On iPhone, gallery photos have "ph://" addresses that the image viewer in
// Expo Go can't always open. So we ask the photo library for the photo's real
// file on the phone ("file://...") and show that instead.
export default function PhotoThumb({ asset, style }: Props) {
  const [uri, setUri] = useState<string | null>(Platform.OS === 'ios' ? null : asset.uri);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let cancelled = false;
    MediaLibrary.getAssetInfoAsync(asset, { shouldDownloadFromNetwork: false })
      .then((info) => {
        if (!cancelled && info.localUri) setUri(info.localUri);
      })
      .catch(() => {
        // Photo isn't available on the phone (e.g. only in iCloud); leave the tile empty.
      });
    return () => {
      cancelled = true;
    };
  }, [asset.id]);

  if (!uri) return <View style={[style as object, { backgroundColor: '#eee' }]} />;
  return <Image source={{ uri }} style={style} contentFit="cover" recyclingKey={asset.id} />;
}
