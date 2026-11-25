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
import { loadAllPhotos } from './photos';

export type Decision = 'keep' | 'delete';

type Props = {
  from: Date;
  to: Date;
  onClose: () => void;
};

const SCREEN_WIDTH = Dimensions.get('window').width;
// How far (in points) a card must be dragged to count as a swipe.
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.3;

export default function SwipeScreen({ from, to, onClose }: Props) {
  const [photos, setPhotos] = useState<MediaLibrary.Asset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // One entry per swiped photo, in order. Its length is the index of the current card.
  const [history, setHistory] = useState<{ id: string; decision: Decision }[]>([]);

  useEffect(() => {
    loadAllPhotos(from, to)
      .then(setPhotos)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const position = useRef(new Animated.ValueXY()).current;
  const animating = useRef(false);
  const index = history.length;
  const current = photos?.[index];
  const next = photos?.[index + 1];

  // The pan handler is created once, so it reads the latest state through this ref.
  const decideRef = useRef<(d: Decision) => void>(() => {});
  decideRef.current = (decision: Decision) => {
    if (!current || animating.current) return;
    animating.current = true;
    Animated.timing(position, {
      toValue: { x: decision === 'keep' ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5, y: 0 },
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setHistory((h) => [...h, { id: current.id, decision }]);
      position.setValue({ x: 0, y: 0 });
      animating.current = false;
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 5,
      onPanResponderMove: (_e, g) => position.setValue({ x: g.dx, y: g.dy }),
      onPanResponderRelease: (_e, g) => {
        if (g.dx > SWIPE_THRESHOLD) decideRef.current('keep');
        else if (g.dx < -SWIPE_THRESHOLD) decideRef.current('delete');
        else
          Animated.spring(position, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: true,
          }).start();
      },
    }),
  ).current;

  function undo() {
    if (animating.current) return;
    position.setValue({ x: 0, y: 0 });
    setHistory((h) => h.slice(0, -1));
  }

  if (error) {
    return (
      <Centered>
        <Text style={styles.body}>Something went wrong: {error}</Text>
        <Button label="Back" onPress={onClose} />
      </Centered>
    );
  }

  if (!photos) {
    return (
      <Centered>
        <ActivityIndicator />
        <Text style={styles.body}>Getting your photos ready…</Text>
      </Centered>
    );
  }

  const toDelete = history.filter((h) => h.decision === 'delete').length;
  const kept = history.length - toDelete;

  // All photos sorted
  if (!current) {
    return (
      <Centered>
        <Text style={styles.title}>All done!</Text>
        <Text style={styles.body}>
          You kept {kept} photo{kept === 1 ? '' : 's'} and marked {toDelete} to delete.
        </Text>
        <Text style={styles.note}>Nothing has been deleted. Deleting comes in the next step.</Text>
        {history.length > 0 && <Button label="Undo last swipe" onPress={undo} variant="secondary" />}
        <Button label="Back to start" onPress={onClose} />
      </Centered>
    );
  }

  const rotate = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
    outputRange: ['-12deg', '0deg', '12deg'],
  });
  const keepOpacity = position.x.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const deleteOpacity = position.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable onPress={onClose} hitSlop={12}>
          <Text style={styles.link}>‹ Back</Text>
        </Pressable>
        <Text style={styles.progress}>
          {index + 1} / {photos.length}
        </Text>
        <Text style={styles.counts}>
          🗑 {toDelete} · ✓ {kept}
        </Text>
      </View>

      <View style={styles.deck}>
        {next && (
          <View style={[styles.card, styles.nextCard]}>
            <PhotoThumb key={next.id} asset={next} style={styles.photo} contentFit="contain" />
          </View>
        )}
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.card,
            { transform: [{ translateX: position.x }, { translateY: position.y }, { rotate }] },
          ]}
        >
          <PhotoThumb key={current.id} asset={current} style={styles.photo} contentFit="contain" />
          <Animated.View style={[styles.stamp, styles.keepStamp, { opacity: keepOpacity }]}>
            <Text style={[styles.stampText, { color: '#16a34a' }]}>KEEP</Text>
          </Animated.View>
          <Animated.View style={[styles.stamp, styles.deleteStamp, { opacity: deleteOpacity }]}>
            <Text style={[styles.stampText, { color: '#dc2626' }]}>DELETE</Text>
          </Animated.View>
        </Animated.View>
      </View>

      <View style={styles.actions}>
        <RoundButton label="✕" color="#dc2626" onPress={() => decideRef.current('delete')} />
        <RoundButton label="↺" color="#6b7280" small onPress={undo} disabled={index === 0} />
        <RoundButton label="✓" color="#16a34a" onPress={() => decideRef.current('keep')} />
      </View>
      <Text style={styles.hint}>Swipe left to delete, right to keep</Text>
    </SafeAreaView>
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
    marginBottom: 12,
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
    backgroundColor: '#111',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  nextCard: {
    transform: [{ scale: 0.95 }],
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  stamp: {
    position: 'absolute',
    top: 32,
    borderWidth: 4,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  keepStamp: {
    left: 24,
    borderColor: '#16a34a',
    transform: [{ rotate: '-15deg' }],
  },
  deleteStamp: {
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
    gap: 28,
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
