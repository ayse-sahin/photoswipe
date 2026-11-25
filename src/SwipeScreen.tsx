import * as MediaLibrary from 'expo-media-library/legacy';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { colors } from './theme';
import ReviewScreen from './ReviewScreen';
import { loadAllPhotos } from './photos';

export type Decision = 'keep' | 'delete' | 'undecided';

type Props = {
  // Either a date range (swipe every photo in it) or a ready list of photos (one group).
  from?: Date;
  to?: Date;
  photos?: MediaLibrary.Asset[];
  // Text of the button that leaves this screen, e.g. "Back to start" or "Back to groups".
  closeLabel?: string;
  onClose: () => void;
  // Called after photos were deleted, so the start screen can refresh.
  onDeleted: () => void;
};

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
// How far (in points) a card must be dragged to count as a swipe.
const SWIPE_X = SCREEN_WIDTH * 0.18;
const SWIPE_UP = SCREEN_HEIGHT * 0.1;
// A quick flick counts as a swipe even if the card only moved a little.
const FLICK_SPEED = 0.45; // points per millisecond
const FLICK_MIN = 24; // the card must still move at least this far
// How many cards are kept loaded in the stack, so the next photo is ready
// before it's shown (this is what stops the black flash between photos).
const STACK_SIZE = 3;

type Round = 'all' | 'undecided';

export default function SwipeScreen({
  from,
  to,
  photos: givenPhotos,
  closeLabel = 'Back to start',
  onClose,
  onDeleted,
}: Props) {
  const [allPhotos, setAllPhotos] = useState<MediaLibrary.Asset[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The photos in the current round: first every photo, later only the undecided ones.
  const [round, setRound] = useState<Round>('all');
  const [deck, setDeck] = useState<MediaLibrary.Asset[]>([]);
  // Decisions made in earlier rounds.
  const [earlier, setEarlier] = useState<Map<string, Decision>>(new Map());
  // One entry per swipe in this round, in order. Its length is the index of the current card.
  const [history, setHistory] = useState<{ id: string; decision: Decision }[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [deletedCount, setDeletedCount] = useState<number | null>(null);

  useEffect(() => {
    (givenPhotos ? Promise.resolve(givenPhotos) : loadAllPhotos(from!, to!))
      .then((photos) => {
        setAllPhotos(photos);
        setDeck(photos);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  // Each card gets its own position, so a card flying off the screen never
  // affects the card underneath it.
  const positions = useRef(new Map<string, Animated.ValueXY>()).current;
  const positionOf = (id: string) => {
    let p = positions.get(id);
    if (!p) {
      p = new Animated.ValueXY();
      positions.set(id, p);
    }
    return p;
  };

  const animating = useRef(false);
  const index = history.length;
  const current = deck[index];

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
    Animated.timing(positionOf(current.id), {
      toValue: target,
      duration: 160,
      useNativeDriver: true,
    }).start(() => {
      setHistory((h) => [...h, { id: current.id, decision }]);
      animating.current = false;
    });
  };

  const currentIdRef = useRef<string | undefined>(undefined);
  currentIdRef.current = current?.id;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_e, g) => {
        if (currentIdRef.current) positionOf(currentIdRef.current).setValue({ x: g.dx, y: g.dy });
      },
      onPanResponderRelease: (_e, g) => {
        const vertical = Math.abs(g.dy) > Math.abs(g.dx);
        const up =
          vertical && (-g.dy > SWIPE_UP || (-g.vy > FLICK_SPEED && -g.dy > FLICK_MIN));
        const right = !vertical && (g.dx > SWIPE_X || (g.vx > FLICK_SPEED && g.dx > FLICK_MIN));
        const left = !vertical && (-g.dx > SWIPE_X || (-g.vx > FLICK_SPEED && -g.dx > FLICK_MIN));
        if (up) decideRef.current('undecided');
        else if (right) decideRef.current('keep');
        else if (left) decideRef.current('delete');
        else if (currentIdRef.current)
          Animated.spring(positionOf(currentIdRef.current), {
            toValue: { x: 0, y: 0 },
            useNativeDriver: true,
          }).start();
      },
    }),
  ).current;

  function undo() {
    if (animating.current || history.length === 0) return;
    const last = history[history.length - 1];
    // That card is off screen right now, so putting it back in the middle doesn't flicker.
    positionOf(last.id).setValue({ x: 0, y: 0 });
    setHistory((h) => h.slice(0, -1));
  }

  // Photos the user changed to "keep" on the review screen.
  const [keptInReview, setKeptInReview] = useState<Set<string>>(new Set());

  // Final decision for every photo: earlier rounds, overwritten by this round,
  // overwritten by changes made on the review screen.
  const decisions = new Map(earlier);
  for (const h of history) decisions.set(h.id, h.decision);
  for (const id of keptInReview) decisions.set(id, 'keep');

  function startUndecidedRound() {
    if (!allPhotos) return;
    const undecided = allPhotos.filter((p) => decisions.get(p.id) === 'undecided');
    for (const p of undecided) positionOf(p.id).setValue({ x: 0, y: 0 });
    setEarlier(decisions);
    setKeptInReview(new Set());
    setDeck(undecided);
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

  if (!allPhotos) {
    return (
      <Centered>
        <ActivityIndicator />
        <Text style={styles.body}>Getting your photos ready…</Text>
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
        <Button label={closeLabel} onPress={onDeleted} />
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
          <SummaryRow emoji="✓" color={colors.keep} label="Keep" count={kept} />
          <SummaryRow emoji="✕" color={colors.delete} label="Delete" count={toDelete} />
          <SummaryRow emoji="?" color={colors.unsure} label="Undecided" count={undecided} />
        </View>

        {undecided > 0 && (
          <Pressable
            onPress={startUndecidedRound}
            style={({ pressed }) => [styles.group, pressed && { opacity: 0.7 }]}
          >
            <View style={styles.groupThumbs}>
              {undecidedPhotos.slice(0, 4).map((p) => (
                <PhotoThumb key={p.id} asset={p} style={styles.groupThumb} small />
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
        <Button label={closeLabel} onPress={onClose} />
      </SafeAreaView>
    );
  }

  // The current card and the next few, drawn bottom to top so the current one is on top.
  // Each card keeps the same key while it moves up the stack, so its photo stays loaded.
  const stack = deck.slice(index, index + STACK_SIZE).reverse();
  const top = positionOf(current.id);

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

  // Leave in the middle of swiping. If some photos are marked, offer to delete them first.
  function exitPressed() {
    const marked = allPhotos!.filter((p) => decisions.get(p.id) === 'delete');
    if (marked.length === 0) return onClose();
    const n = marked.length;
    Alert.alert(
      `Delete ${n} photo${n === 1 ? '' : 's'}?`,
      `You marked ${n} photo${n === 1 ? '' : 's'} to delete so far.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Exit without deleting', onPress: onClose },
        {
          text: `Delete ${n} & exit`,
          style: 'destructive',
          onPress: async () => {
            try {
              // The phone asks once more, then the photos go to "Recently Deleted".
              const ok = await MediaLibrary.deleteAssetsAsync(marked.map((p) => p.id));
              if (ok) setDeletedCount(n);
            } catch {
              // Tapped "Don't Allow" on the phone's question: nothing deleted, keep swiping.
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable onPress={exitPressed} hitSlop={12} style={styles.exitButton}>
          <Text style={styles.exitText}>Exit</Text>
        </Pressable>
        <Text style={styles.progress}>
          {round === 'undecided' ? 'Undecided ' : ''}
          {index + 1} / {deck.length}
        </Text>
        <Text style={styles.counts}>
          ✕ {toDelete} · ? {undecided} · ✓ {kept}
        </Text>
      </View>

      <View style={styles.deck}>
        {stack.map((photo) => {
          const isTop = photo.id === current.id;
          const pos = positionOf(photo.id);
          return (
            <Animated.View
              key={photo.id}
              {...(isTop ? panResponder.panHandlers : {})}
              style={[
                styles.card,
                isTop
                  ? { transform: [{ translateX: pos.x }, { translateY: pos.y }, { rotate }] }
                  : null,
              ]}
            >
              <PhotoThumb asset={photo} style={styles.photo} contentFit="contain" />
              {isTop && (
                <>
                  <Animated.View style={[styles.stamp, styles.keepStamp, { opacity: keepOpacity }]}>
                    <Text style={[styles.stampText, { color: colors.keep }]}>KEEP</Text>
                  </Animated.View>
                  <Animated.View
                    style={[styles.stamp, styles.deleteStamp, { opacity: deleteOpacity }]}
                  >
                    <Text style={[styles.stampText, { color: colors.delete }]}>DELETE</Text>
                  </Animated.View>
                  <Animated.View style={[styles.stamp, styles.laterStamp, { opacity: laterOpacity }]}>
                    <Text style={[styles.stampText, { color: colors.unsure }]}>NOT SURE</Text>
                  </Animated.View>
                </>
              )}
            </Animated.View>
          );
        })}
      </View>

      <View style={styles.actions}>
        <RoundButton label="✕" color={colors.delete} onPress={() => decideRef.current('delete')} />
        <RoundButton label="↺" color={colors.muted} small onPress={undo} disabled={index === 0} />
        <RoundButton label="?" color={colors.unsure} small onPress={() => decideRef.current('undecided')} />
        <RoundButton label="✓" color={colors.keep} onPress={() => decideRef.current('keep')} />
      </View>
      <Text style={styles.hint}>Left: delete · Up: not sure · Right: keep</Text>
    </SafeAreaView>
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
  const size = small ? 46 : 60;
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
      <Text style={{ color, fontSize: small ? 20 : 26, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  body: {
    fontSize: 16,
    textAlign: 'center',
    color: colors.muted,
    marginTop: 12,
  },
  note: {
    fontSize: 14,
    textAlign: 'center',
    color: colors.muted,
    marginTop: 8,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  exitButton: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  exitText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  link: {
    fontSize: 17,
    color: colors.accent,
  },
  progress: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  counts: {
    fontSize: 15,
    color: colors.muted,
  },
  deck: {
    flex: 1,
    marginHorizontal: 8,
    marginVertical: 4,
  },
  card: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.photoBg,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  laterStamp: {
    alignSelf: 'center',
    bottom: 40,
    borderColor: colors.unsure,
  },
  doneScreen: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: 24,
    justifyContent: 'center',
  },
  summary: {
    backgroundColor: colors.surface,
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
    color: colors.text,
    flex: 1,
    fontSize: 17,
  },
  summaryCount: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 2,
    borderColor: colors.unsure,
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
    backgroundColor: colors.surfaceHigh,
  },
  groupThumb: {
    width: 32,
    height: 32,
  },
  groupTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  groupSub: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 2,
  },
  groupArrow: {
    fontSize: 28,
    color: colors.unsure,
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
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  keepStamp: {
    top: 32,
    left: 24,
    borderColor: colors.keep,
    transform: [{ rotate: '-15deg' }],
  },
  deleteStamp: {
    top: 32,
    right: 24,
    borderColor: colors.delete,
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
    backgroundColor: colors.surface,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    textAlign: 'center',
    color: colors.muted,
    fontSize: 13,
    paddingBottom: 8,
  },
});
