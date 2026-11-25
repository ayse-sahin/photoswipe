import * as MediaLibrary from 'expo-media-library/legacy';
import { useState } from 'react';
import { Dimensions, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Button from './Button';
import PhotoThumb from './PhotoThumb';

type Props = {
  photos: MediaLibrary.Asset[];
  // Called when the user taps a photo to keep it after all.
  onKeep: (id: string) => void;
  onBack: () => void;
  onDeleted: (count: number) => void;
};

const COLUMNS = 3;
const TILE = Dimensions.get('window').width / COLUMNS;

export default function ReviewScreen({ photos, onKeep, onBack, onDeleted }: Props) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const count = photos.length;

  async function deleteAll() {
    setDeleting(true);
    setError(null);
    try {
      // The phone shows its own "Delete N photos?" question first. On iPhone the
      // photos go to "Recently Deleted", where they stay for 30 days.
      const ok = await MediaLibrary.deleteAssetsAsync(photos.map((p) => p.id));
      if (ok) onDeleted(count);
    } catch (e) {
      // Tapping "Don't Allow" on the phone's question also lands here.
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.link}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Review</Text>
        <Text style={styles.sub}>
          {count === 0
            ? 'No photos left to delete.'
            : `${count} photo${count === 1 ? '' : 's'} will be deleted. Tap a photo to keep it instead.`}
        </Text>
      </View>

      <FlatList
        data={photos}
        keyExtractor={(p) => p.id}
        numColumns={COLUMNS}
        renderItem={({ item }) => (
          <Pressable onPress={() => onKeep(item.id)} style={styles.tileWrap}>
            <PhotoThumb asset={item} style={styles.tile} />
            <View style={styles.badge}>
              <Text style={styles.badgeText}>✕</Text>
            </View>
          </Pressable>
        )}
      />

      <View style={styles.footer}>
        {error && (
          <Text style={styles.error}>Nothing was deleted. ({error})</Text>
        )}
        <Text style={styles.note}>
          Deleted photos go to "Recently Deleted" in your Photos app, so you can still get them back
          for 30 days.
        </Text>
        <Button
          label={deleting ? 'Deleting…' : `Delete ${count} photo${count === 1 ? '' : 's'}`}
          onPress={deleteAll}
          disabled={deleting || count === 0}
          variant="danger"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  link: {
    fontSize: 17,
    color: '#2563eb',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginTop: 8,
  },
  sub: {
    fontSize: 15,
    color: '#555',
    marginTop: 4,
  },
  tileWrap: {
    width: TILE,
    height: TILE,
  },
  tile: {
    width: TILE,
    height: TILE,
    borderWidth: 1,
    borderColor: '#fff',
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  footer: {
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ddd',
  },
  note: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
  },
  error: {
    color: '#c00',
    textAlign: 'center',
    marginBottom: 8,
  },
});
