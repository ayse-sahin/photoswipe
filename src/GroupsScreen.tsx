import * as MediaLibrary from 'expo-media-library/legacy';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Button from './Button';
import PhotoThumb from './PhotoThumb';
import SwipeScreen from './SwipeScreen';
import { GroupSize, groupPhotos, PhotoGroup, prepareFingerprints } from './grouping';
import { loadAllPhotos } from './photos';

type Props = {
  from: Date;
  to: Date;
  onClose: () => void;
  // Called after photos were deleted, so the start screen can refresh.
  onDeleted: () => void;
};

// "Pick the best shot": a list of groups of similar photos. Tap a group to
// swipe through only those photos.
export default function GroupsScreen({ from, to, onClose, onDeleted }: Props) {
  const [photos, setPhotos] = useState<MediaLibrary.Asset[] | null>(null);
  const [ready, setReady] = useState(false);
  const [size, setSize] = useState<GroupSize>('medium');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<PhotoGroup | null>(null);
  // Groups you've already swiped through, so they get a ✓.
  const [finished, setFinished] = useState<Set<string>>(new Set());

  async function load() {
    setReady(false);
    setProgress(null);
    try {
      const all = await loadAllPhotos(from, to);
      await prepareFingerprints(all, (done, total) => setProgress({ done, total }));
      setPhotos(all);
      setReady(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // Regrouping is instant once fingerprints are ready, so the size switch is live.
  const groups = useMemo(
    () =>
      ready && photos
        ? groupPhotos(photos, size).filter((i): i is PhotoGroup => i.kind === 'group')
        : null,
    [ready, photos, size],
  );

  useEffect(() => {
    load();
  }, []);

  if (open) {
    return (
      <SwipeScreen
        photos={open.assets}
        closeLabel="Back to groups"
        onClose={() => {
          setFinished((f) => new Set(f).add(open.key));
          setOpen(null);
        }}
        onDeleted={() => {
          // Some photos are gone now, so find the groups again.
          setOpen(null);
          setFinished(new Set());
          onDeleted();
          load();
        }}
      />
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={12}>
          <Text style={styles.link}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Pick the best shot</Text>
        {groups && (
          <View style={styles.sizeRow}>
            <Text style={styles.sizeLabel}>Group size</Text>
            <View style={styles.segment}>
              {(['small', 'medium', 'large'] as GroupSize[]).map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setSize(s)}
                  style={[styles.segmentItem, size === s && styles.segmentActive]}
                >
                  <Text style={[styles.segmentText, size === s && styles.segmentTextActive]}>
                    {s[0].toUpperCase() + s.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
        {groups && (
          <Text style={styles.sub}>
            {groups.length === 0
              ? 'No similar photos found in these dates.'
              : `${groups.length} group${groups.length === 1 ? '' : 's'} of similar photos. Tap one to swipe through it.`}
          </Text>
        )}
      </View>

      {error ? (
        <View style={styles.centered}>
          <Text style={styles.error}>Something went wrong: {error}</Text>
          <Button label="Back" onPress={onClose} />
        </View>
      ) : !groups ? (
        <View style={styles.centered}>
          <ActivityIndicator />
          <Text style={styles.sub}>
            {progress && progress.total > 0
              ? `Finding similar photos… ${progress.done} / ${progress.total}`
              : 'Getting your photos ready…'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => g.key}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <GroupRow
              group={item}
              done={finished.has(item.key)}
              onPress={() => setOpen(item)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function GroupRow({
  group,
  done,
  onPress,
}: {
  group: PhotoGroup;
  done: boolean;
  onPress: () => void;
}) {
  const when = new Date(group.assets[0].creationTime);
  const label = when.toLocaleDateString([], { day: 'numeric', month: 'short' });
  const time = when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      <View style={styles.collage}>
        {group.assets.slice(0, 4).map((p) => (
          <PhotoThumb key={p.id} asset={p} style={styles.collageTile} small />
        ))}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{group.assets.length} similar photos</Text>
        <Text style={styles.rowSub}>
          {label}, {time}
        </Text>
        {done && <Text style={styles.done}>✓ Swiped</Text>}
      </View>
      <Text style={styles.arrow}>›</Text>
    </Pressable>
  );
}

const COLLAGE = 88;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
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
    marginTop: 8,
    textAlign: 'left',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  error: {
    color: '#c00',
    textAlign: 'center',
  },
  list: {
    padding: 16,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 10,
    borderRadius: 14,
    backgroundColor: '#f3f4f6',
  },
  collage: {
    width: COLLAGE,
    height: COLLAGE,
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  collageTile: {
    width: COLLAGE / 2,
    height: COLLAGE / 2,
  },
  rowTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  rowSub: {
    fontSize: 14,
    color: '#555',
    marginTop: 2,
  },
  done: {
    fontSize: 14,
    color: '#16a34a',
    fontWeight: '600',
    marginTop: 4,
  },
  sizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  sizeLabel: {
    fontSize: 15,
    color: '#333',
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: '#eef1f5',
    borderRadius: 10,
    padding: 3,
  },
  segmentItem: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  segmentActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  segmentText: {
    fontSize: 14,
    color: '#555',
  },
  segmentTextActive: {
    color: '#111',
    fontWeight: '600',
  },
  arrow: {
    fontSize: 28,
    color: '#9ca3af',
  },
});
