import * as MediaLibrary from 'expo-media-library/legacy';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Button from './Button';
import PhotoThumb from './PhotoThumb';
import { colors } from './theme';
import SwipeScreen from './SwipeScreen';
import { groupPhotos, PhotoGroup, prepareFingerprints } from './grouping';
import { loadAllPhotos } from './photos';
import { useT } from './i18n';

// Only groups with at least this many photos are shown.
const MIN_GROUP_SIZE = 7;

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
  const t = useT();
  const [photos, setPhotos] = useState<MediaLibrary.Asset[] | null>(null);
  const [ready, setReady] = useState(false);
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

  const groups = useMemo(
    () =>
      ready && photos
        ? groupPhotos(photos, 'medium').filter(
            (i): i is PhotoGroup => i.kind === 'group' && i.assets.length >= MIN_GROUP_SIZE,
          )
        : null,
    [ready, photos],
  );

  useEffect(() => {
    load();
  }, []);

  if (open) {
    return (
      <SwipeScreen
        photos={open.assets}
        closeLabel={t.backToGroups}
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
          <Text style={styles.link}>{t.back}</Text>
        </Pressable>
        <Text style={styles.title}>{t.pickBestShot}</Text>
        {groups && (
          <Text style={styles.sub}>
            {groups.length === 0
              ? t.noGroups(MIN_GROUP_SIZE)
              : t.groupsFound(groups.length)}
          </Text>
        )}
      </View>

      {error ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{t.somethingWrong(error)}</Text>
          <Button label={t.back} onPress={onClose} />
        </View>
      ) : !groups ? (
        <View style={styles.centered}>
          <ActivityIndicator />
          <Text style={styles.sub}>
            {progress && progress.total > 0
              ? t.findingSimilar(progress.done, progress.total)
              : t.gettingReady}
          </Text>
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => g.key}
          numColumns={COLUMNS}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={{ gap: GAP }}
          renderItem={({ item }) => (
            <GroupTile
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

// One group as a square tile: its first photo, with the number of photos on it.
function GroupTile({
  group,
  done,
  onPress,
}: {
  group: PhotoGroup;
  done: boolean;
  onPress: () => void;
}) {
  const when = new Date(group.assets[0].creationTime);
  const time = when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tile, pressed && { opacity: 0.7 }]}>
      <PhotoThumb asset={group.assets[0]} style={styles.tilePhoto} small />
      {done && <View style={styles.doneShade} />}
      <View style={styles.countBadge}>
        <Text style={styles.countText}>{group.assets.length}</Text>
      </View>
      {done && (
        <View style={styles.doneBadge}>
          <Text style={styles.doneText}>✓</Text>
        </View>
      )}
      <Text style={styles.tileTime}>{time}</Text>
    </Pressable>
  );
}

const COLUMNS = 3;
const GAP = 10;
const PADDING = 16;
const TILE = (Dimensions.get('window').width - PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;


const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  link: {
    fontSize: 17,
    color: colors.accent,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    marginTop: 8,
  },
  sub: {
    fontSize: 15,
    color: colors.muted,
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
    color: colors.delete,
    textAlign: 'center',
  },
  grid: {
    padding: PADDING,
    gap: GAP,
  },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  tilePhoto: {
    width: TILE,
    height: TILE,
  },
  doneShade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(47,28,36,0.55)',
  },
  countBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 26,
    height: 26,
    paddingHorizontal: 7,
    borderRadius: 13,
    backgroundColor: 'rgba(47,28,36,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  doneBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: {
    color: colors.onAccent,
    fontSize: 14,
    fontWeight: '800',
  },
  tileTime: {
    position: 'absolute',
    left: 8,
    bottom: 6,
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 3,
  },
});
