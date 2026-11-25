import * as MediaLibrary from 'expo-media-library/legacy';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Button from './Button';
import PhotoThumb from './PhotoThumb';
import ReviewScreen from './ReviewScreen';
import { DeckItem, groupPhotos } from './grouping';
import { loadAllPhotos } from './photos';

export type Decision = 'keep' | 'delete' | 'undecided';

type Props = {
  from: Date;
  to: Date;
  onClose: () => void;
  // Called after photos were deleted, so the start screen can refresh.
  onDeleted: () => void;
};

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
// How far (in points) a card must be dragged to count as a swipe.
const SWIPE_X = SCREEN_WIDTH * 0.3;
const SWIPE_UP = SCREEN_HEIGHT * 0.15;
// How many cards are kept loaded in the stack, so the next photo is ready
// before it's shown (this is what stops the black flash between photos).
const STACK_SIZE = 3;

type Round = 'all' | 'undecided';
type Swipe = { key: string; decisions: [string, Decision][] };

const photoItem = (asset: MediaLibrary.Asset): DeckItem => ({ kind: 'photo', key: asset.id, asset });

export default function SwipeScreen({ from, to, onClose, onDeleted }: Props) {
  const [allPhotos, setAllPhotos] = useState<MediaLibrary.Asset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  // The cards in the current round: single photos and groups of similar photos.
  // First round: every photo. Later: only the undecided ones.
  const [round, setRound] = useState<Round>('all');
  const [deck, setDeck] = useState<DeckItem[] | null>(null);
  // Decisions made in earlier rounds.
  const [earlier, setEarlier] = useState<Map<string, Decision>>(new Map());
  // One entry per swiped card in this round. Its length is the index of the current card.
  const [history, setHistory] = useState<Swipe[]>([]);
  // When a group is open, you swipe inside it; these are the swipes inside the group.
  const [openGroup, setOpenGroup] = useState<Extract<DeckItem, { kind: 'group' }> | null>(null);
  const [groupHistory, setGroupHistory] = useState<Swipe[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [deletedCount, setDeletedCount] = useState<number | null>(null);
  // Photos the user changed to "keep" on the review screen.
  const [keptInReview, setKeptInReview] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const photos = await loadAllPhotos(from, to);
      setAllPhotos(photos);
      const items = await groupPhotos(photos, (done, total) => setProgress({ done, total }));
      setDeck(items);
    })().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  // Each card gets its own position, so a card flying off the screen never
  // affects the card underneath it.
  const positions = useRef(new Map<string, Animated.ValueXY>()).current;
  const positionOf = (key: string) => {
    let p = positions.get(key);
    if (!p) {
      p = new Animated.ValueXY();
      positions.set(key, p);
    }
    return p;
  };

  // The deck you're swiping right now: the open group, or the main deck.
  const items: DeckItem[] = openGroup ? openGroup.assets.map(photoItem) : (deck ?? []);
  const activeHistory = openGroup ? groupHistory : history;
  const index = activeHistory.length;
  const current: DeckItem | undefined = items[index];

  const animating = useRef(false);

  const decideRef = useRef<(d: Decision) => void>(() => {});
  decideRef.current = (decision: Decision) => {
    if (!current || animating.current) return;
    animating.current = true;
    const target =
      decision === 'keep'
        ? { x: SCREEN_WIDTH * 1.5, y: 0 }
        : decision === 'delete'
          ? { x: -SCREEN_WIDTH * 1.5, y: 0 }
          : { x: 0, y: -SCREEN_HEIGHT };
    Animated.timing(positionOf(current.key), {
      toValue: target,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      const ids = current.kind === 'photo' ? [current.asset.id] : current.assets.map((a) => a.id);
      const swipe: Swipe = { key: current.key, decisions: ids.map((id) => [id, decision]) };
      if (openGroup) {
        const inGroup = [...groupHistory, swipe];
        if (inGroup.length === openGroup.assets.length) {
          // Finished the group: it counts as one swiped card in the main deck.
          setHistory((h) => [
            ...h,
            { key: openGroup.key, decisions: inGroup.flatMap((s) => s.decisions) },
          ]);
          setGroupHistory([]);
          setOpenGroup(null);
        } else {
          setGroupHistory(inGroup);
        }
      } else {
        setHistory((h) => [...h, swipe]);
      }
      animating.current = false;
    });
  };

  const currentKeyRef = useRef<string | undefined>(undefined);
  currentKeyRef.current = current?.key;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 5 || Math.abs(g.dy) > 5,
      onPanResponderMove: (_e, g) => {
        if (currentKeyRef.current) positionOf(currentKeyRef.current).setValue({ x: g.dx, y: g.dy });
      },
      onPanResponderRelease: (_e, g) => {
        const up = -g.dy > SWIPE_UP && Math.abs(g.dy) > Math.abs(g.dx);
        if (up) decideRef.current('undecided');
        else if (g.dx > SWIPE_X) decideRef.current('keep');
        else if (g.dx < -SWIPE_X) decideRef.current('delete');
        else if (currentKeyRef.current)
          Animated.spring(positionOf(currentKeyRef.current), {
            toValue: { x: 0, y: 0 },
            useNativeDriver: true,
          }).start();
      },
    }),
  ).current;

  function openGroupCard(group: Extract<DeckItem, { kind: 'group' }>) {
    if (animating.current) return;
    for (const a of group.assets) positionOf(a.id).setValue({ x: 0, y: 0 });
    setGroupHistory([]);
    setOpenGroup(group);
  }

  function closeGroup() {
    setGroupHistory([]);
    setOpenGroup(null);
  }

  function undo() {
    if (animating.current) return;
    if (openGroup) {
      if (groupHistory.length === 0) return closeGroup();
      const last = groupHistory[groupHistory.length - 1];
      // That card is off screen right now, so putting it back in the middle doesn't flicker.
      positionOf(last.key).setValue({ x: 0, y: 0 });
      setGroupHistory((h) => h.slice(0, -1));
      return;
    }
    if (history.length === 0) return;
    positionOf(history[history.length - 1].key).setValue({ x: 0, y: 0 });
    setHistory((h) => h.slice(0, -1));
  }

  // Final decision for every photo: earlier rounds, then this round, then the
  // open group, then changes made on the review screen.
  const decisions = new Map(earlier);
  for (const s of [...history, ...groupHistory])
    for (const [id, d] of s.decisions) decisions.set(id, d);
  for (const id of keptInReview) decisions.set(id, 'keep');

  async function startUndecidedRound() {
    if (!allPhotos) return;
    const undecided = allPhotos.filter((p) => decisions.get(p.id) === 'undecided');
    const regrouped = await groupPhotos(undecided);
    for (const item of regrouped) positionOf(item.key).setValue({ x: 0, y: 0 });
    for (const p of undecided) positionOf(p.id).setValue({ x: 0, y: 0 });
    setEarlier(decisions);
    setKeptInReview(new Set());
    setDeck(regrouped);
    setHistory([]);
    setRound('undecided');
  }

  if (error) {
    return (
      <Centered>
        <Text style={styles.body}>Something went wrong: {error}</Text>
        <Button label="Back" onPress={onClose} />
      </Centered>
    );
  }

  if (!allPhotos || !deck) {
    return (
      <Centered>
        <ActivityIndicator />
        <Text style={styles.body}>
          {progress && progress.total > 0
            ? `Finding similar photos… ${progress.done} / ${progress.total}`
            : 'Getting your photos ready…'}
        </Text>
      </Centered>
    );
  }

  if (deletedCount !== null) {
    return (
      <Centered>
        <Text style={styles.title}>Deleted {deletedCount} photo{deletedCount === 1 ? '' : 's'} 🎉</Text>
        <Text style={styles.body}>
          Changed your mind? They're in "Recently Deleted" in the Photos app for 30 days.
        </Text>
        <Button label="Back to start" onPress={onDeleted} />
      </Centered>
    );
  }

  if (reviewing) {
    return (
      <ReviewScreen
        photos={allPhotos.filter((p) => decisions.get(p.id) === 'delete')}
        onKeep={(id) => setKeptInReview((s) => new Set(s).add(id))}
        onBack={() => setReviewing(false)}
        onDeleted={setDeletedCount}
      />
    );
  }

  let kept = 0;
  let toDelete = 0;
  let undecided = 0;
  for (const d of decisions.values()) {
    if (d === 'keep') kept++;
    else if (d === 'delete') toDelete++;
    else undecided++;
  }

  // Round finished
  if (!current) {
    const undecidedPhotos = allPhotos.filter((p) => decisions.get(p.id) === 'undecided');
    return (
      <SafeAreaView style={styles.doneScreen}>
        <Text style={styles.title}>{undecided > 0 ? 'Almost done!' : 'All done!'}</Text>
        <View style={styles.summary}>
          <SummaryRow emoji="✓" color="#16a34a" label="Keep" count={kept} />
          <SummaryRow emoji="✕" color="#dc2626" label="Delete" count={toDelete} />
          <SummaryRow emoji="?" color="#d97706" label="Undecided" count={undecided} />
        </View>

        {undecided > 0 && (
          <Pressable
            onPress={startUndecidedRound}
            style={({ pressed }) => [styles.group, pressed && { opacity: 0.7 }]}
          >
            <View style={styles.groupThumbs}>
              {undecidedPhotos.slice(0, 4).map((p) => (
                <PhotoThumb key={p.id} asset={p} style={styles.groupThumb} />
              ))}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.groupTitle}>Undecided</Text>
              <Text style={styles.groupSub}>
                {undecided} photo{undecided === 1 ? '' : 's'} · tap to swipe these
              </Text>
            </View>
            <Text style={styles.groupArrow}>›</Text>
          </Pressable>
        )}

        {toDelete > 0 ? (
          <Button
            label={`Review ${toDelete} photo${toDelete === 1 ? '' : 's'} to delete`}
            onPress={() => setReviewing(true)}
            variant="danger"
          />
        ) : (
          <Text style={styles.note}>No photos marked for deletion.</Text>
        )}
        {history.length > 0 && <Button label="Undo last swipe" onPress={undo} variant="secondary" />}
        <Button label="Back to start" onPress={onClose} />
      </SafeAreaView>
    );
  }

  // The current card and the next few, drawn bottom to top so the current one is on top.
  // Each card keeps the same key while it moves up the stack, so its photo stays loaded.
  const stack = items.slice(index, index + STACK_SIZE).reverse();
  const top = positionOf(current.key);
  const isGroupCard = current.kind === 'group';

  const rotate = top.x.interpolate({
    inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
    outputRange: ['-12deg', '0deg', '12deg'],
  });
  const keepOpacity = top.x.interpolate({
    inputRange: [0, SWIPE_X],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const deleteOpacity = top.x.interpolate({
    inputRange: [-SWIPE_X, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const laterOpacity = top.y.interpolate({
    inputRange: [-SWIPE_UP, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable onPress={openGroup ? closeGroup : onClose} hitSlop={12}>
          <Text style={styles.link}>{openGroup ? '‹ All photos' : '‹ Back'}</Text>
        </Pressable>
        <Text style={styles.progress}>
          {openGroup ? 'Group ' : round === 'undecided' ? 'Undecided ' : ''}
          {index + 1} / {items.length}
        </Text>
        <Text style={styles.counts}>
          ✕ {toDelete} · ? {undecided} · ✓ {kept}
        </Text>
      </View>

      <View style={styles.deck}>
        {stack.map((item) => {
          const isTop = item.key === current.key;
          const pos = positionOf(item.key);
          return (
            <Animated.View
              key={item.key}
              {...(isTop ? panResponder.panHandlers : {})}
              style={[
                styles.card,
                isTop
                  ? { transform: [{ translateX: pos.x }, { translateY: pos.y }, { rotate }] }
                  : null,
              ]}
            >
              {item.kind === 'photo' ? (
                <PhotoThumb asset={item.asset} style={styles.photo} contentFit="contain" />
              ) : (
                <GroupCard group={item} onOpen={() => isTop && openGroupCard(item)} />
              )}
              {isTop && (
                <>
                  <Animated.View style={[styles.stamp, styles.keepStamp, { opacity: keepOpacity }]}>
                    <Text style={[styles.stampText, { color: '#16a34a' }]}>
                      {isGroupCard ? 'KEEP ALL' : 'KEEP'}
                    </Text>
                  </Animated.View>
                  <Animated.View
                    style={[styles.stamp, styles.deleteStamp, { opacity: deleteOpacity }]}
                  >
                    <Text style={[styles.stampText, { color: '#dc2626' }]}>
                      {isGroupCard ? 'DELETE ALL' : 'DELETE'}
                    </Text>
                  </Animated.View>
                  <Animated.View style={[styles.stamp, styles.laterStamp, { opacity: laterOpacity }]}>
                    <Text style={[styles.stampText, { color: '#d97706' }]}>NOT SURE</Text>
                  </Animated.View>
                </>
              )}
            </Animated.View>
          );
        })}
      </View>

      <View style={styles.actions}>
        <RoundButton label="✕" color="#dc2626" onPress={() => decideRef.current('delete')} />
        <RoundButton
          label="↺"
          color="#6b7280"
          small
          onPress={undo}
          disabled={!openGroup && index === 0}
        />
        <RoundButton label="?" color="#d97706" small onPress={() => decideRef.current('undecided')} />
        <RoundButton label="✓" color="#16a34a" onPress={() => decideRef.current('keep')} />
      </View>
      <Text style={styles.hint}>
        {isGroupCard
          ? 'Tap to open the group · or swipe to decide for all of them'
          : 'Left: delete · Up: not sure · Right: keep'}
      </Text>
    </SafeAreaView>
  );
}

// A card standing for several similar photos: a 2x2 preview and a label.
function GroupCard({
  group,
  onOpen,
}: {
  group: Extract<DeckItem, { kind: 'group' }>;
  onOpen: () => void;
}) {
  const previews = group.assets.slice(0, 4);
  const time = new Date(group.assets[0].creationTime).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <Pressable onPress={onOpen} style={styles.groupCard}>
      <View style={styles.collage}>
        {previews.map((p) => (
          <PhotoThumb
            key={p.id}
            asset={p}
            style={previews.length === 2 ? styles.collageHalf : styles.collageQuarter}
          />
        ))}
      </View>
      <View style={styles.groupBanner}>
        <Text style={styles.groupBannerTitle}>
          ▣ {group.assets.length} similar photos · {time}
        </Text>
        <Text style={styles.groupBannerSub}>Tap to swipe through them one by one</Text>
      </View>
    </Pressable>
  );
}

function SummaryRow({
  emoji,
  color,
  label,
  count,
}: {
  emoji: string;
  color: string;
  label: string;
  count: number;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryEmoji, { color }]}>{emoji}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryCount}>{count}</Text>
    </View>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

function RoundButton({
  label,
  color,
  onPress,
  small,
  disabled,
}: {
  label: string;
  color: string;
  onPress: () => void;
  small?: boolean;
  disabled?: boolean;
}) {
  const size = small ? 52 : 68;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.round,
        { width: size, height: size, borderRadius: size / 2, borderColor: color },
        (pressed || disabled) && { opacity: 0.4 },
      ]}
    >
      <Text style={{ color, fontSize: small ? 24 : 30, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  centered: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  body: {
    fontSize: 16,
    textAlign: 'center',
    color: '#333',
    marginTop: 12,
  },
  note: {
    fontSize: 14,
    textAlign: 'center',
    color: '#888',
    marginTop: 8,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  link: {
    fontSize: 17,
    color: '#2563eb',
  },
  progress: {
    fontSize: 16,
    fontWeight: '600',
  },
  counts: {
    fontSize: 15,
    color: '#555',
  },
  deck: {
    flex: 1,
    margin: 16,
  },
  card: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  groupCard: {
    flex: 1,
  },
  collage: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  collageQuarter: {
    width: '50%',
    height: '50%',
    borderWidth: 1,
    borderColor: '#000',
  },
  collageHalf: {
    width: '100%',
    height: '50%',
    borderWidth: 1,
    borderColor: '#000',
  },
  groupBanner: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  groupBannerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  groupBannerSub: {
    color: '#ddd',
    fontSize: 14,
    marginTop: 2,
  },
  laterStamp: {
    alignSelf: 'center',
    bottom: 40,
    borderColor: '#d97706',
  },
  doneScreen: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 24,
    justifyContent: 'center',
  },
  summary: {
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  summaryEmoji: {
    width: 28,
    fontSize: 20,
    fontWeight: '700',
  },
  summaryLabel: {
    flex: 1,
    fontSize: 17,
  },
  summaryCount: {
    fontSize: 17,
    fontWeight: '700',
  },
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 2,
    borderColor: '#d97706',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  groupThumbs: {
    width: 64,
    height: 64,
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#e5e7eb',
  },
  groupThumb: {
    width: 32,
    height: 32,
  },
  groupTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  groupSub: {
    fontSize: 14,
    color: '#555',
    marginTop: 2,
  },
  groupArrow: {
    fontSize: 28,
    color: '#d97706',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  stamp: {
    position: 'absolute',
    borderWidth: 4,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  keepStamp: {
    top: 32,
    left: 24,
    borderColor: '#16a34a',
    transform: [{ rotate: '-15deg' }],
  },
  deleteStamp: {
    top: 32,
    right: 24,
    borderColor: '#dc2626',
    transform: [{ rotate: '15deg' }],
  },
  stampText: {
    fontSize: 32,
    fontWeight: '800',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
    paddingVertical: 8,
  },
  round: {
    backgroundColor: '#fff',
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    textAlign: 'center',
    color: '#888',
    fontSize: 13,
    paddingBottom: 8,
  },
});
