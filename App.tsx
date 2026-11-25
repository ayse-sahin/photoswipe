import { StatusBar } from 'expo-status-bar';
import * as MediaLibrary from 'expo-media-library/legacy';
import { useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import DateField from './src/DateField';
import Button from './src/Button';
import PhotoThumb from './src/PhotoThumb';
import { colors } from './src/theme';
import GroupsScreen from './src/GroupsScreen';
import SwipeScreen from './src/SwipeScreen';
import { loadPhotos } from './src/photos';

const COLUMNS = 3;
const TILE = Dimensions.get('window').width / COLUMNS;

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <HomeScreen />
    </SafeAreaProvider>
  );
}

function HomeScreen() {
  const [permission, requestPermission] = MediaLibrary.usePermissions({
    granularPermissions: ['photo'],
  });

  const [startDate, setStartDate] = useState(daysAgo(7));
  const [useEndDate, setUseEndDate] = useState(false);
  const [endDate, setEndDate] = useState(new Date());

  const [photos, setPhotos] = useState<MediaLibrary.Asset[] | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<'home' | 'swipe' | 'best'>('home');
  const [showPhotos, setShowPhotos] = useState(false);

  const rangeEnd = useEndDate ? endDate : new Date();

  async function findPhotos() {
    setShowPhotos(false);
    setLoading(true);
    setError(null);
    try {
      const page = await loadPhotos(startDate, rangeEnd);
      setPhotos(page.photos);
      setTotalCount(page.totalCount);
      setCursor(page.endCursor);
      setHasMore(page.hasNextPage);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (loading || !hasMore || !photos) return;
    setLoading(true);
    try {
      const page = await loadPhotos(startDate, rangeEnd, cursor);
      setPhotos([...photos, ...page.photos]);
      setCursor(page.endCursor);
      setHasMore(page.hasNextPage);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  // 1. Still checking permission
  if (!permission) {
    return (
      <Centered>
        <ActivityIndicator color={colors.accent} />
      </Centered>
    );
  }

  // 2. No permission yet: explain and ask
  if (!permission.granted) {
    return (
      <Centered>
        <Text style={styles.title}>Pare</Text>
        <Text style={styles.body}>
          Pare needs access to your photos so you can swipe through them. Your photos never leave
          your phone.
        </Text>
        {permission.canAskAgain ? (
          <Button label="Allow photo access" onPress={requestPermission} />
        ) : (
          <>
            <Text style={styles.body}>Photo access is turned off. You can turn it on in Settings.</Text>
            <Button label="Open Settings" onPress={() => Linking.openSettings()} />
          </>
        )}
      </Centered>
    );
  }

  // 3. Swipe through the photos
  if (mode === 'swipe') {
    return (
      <SwipeScreen
        from={startDate}
        to={rangeEnd}
        onClose={() => setMode('home')}
        onDeleted={() => {
          setMode('home');
          findPhotos();
        }}
      />
    );
  }

  // 4. Pick the best shot from groups of similar photos
  if (mode === 'best') {
    return (
      <GroupsScreen
        from={startDate}
        to={rangeEnd}
        onClose={() => setMode('home')}
        onDeleted={findPhotos}
      />
    );
  }

  // 5. Pick dates, then show the photos from that range
  const header = (
    <View style={styles.header}>
      <Text style={[styles.title, !showPhotos && styles.centerText]}>
        Pare<Text style={{ color: colors.accent }}>.</Text>
      </Text>
      <Text style={[styles.tagline, !showPhotos && styles.centerText]}>
        Pare your camera roll down to the best.
      </Text>
      {permission.accessPrivileges === 'limited' && (
        <Text style={styles.note}>You gave access to only some photos, so only those will show.</Text>
      )}

      <View style={styles.card}>
        <DateField label="From" value={startDate} maximumDate={rangeEnd} onChange={setStartDate} />
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={styles.label}>Until</Text>
          <View style={styles.untilRight}>
            {!useEndDate && <Text style={styles.today}>Today</Text>}
            <Switch
              value={useEndDate}
              onValueChange={setUseEndDate}
              trackColor={{ true: colors.accent, false: colors.surfaceHigh }}
            />
          </View>
        </View>
        {useEndDate && (
          <DateField
            label=""
            value={endDate}
            minimumDate={startDate}
            maximumDate={new Date()}
            onChange={setEndDate}
          />
        )}
      </View>

      <Button label="Find photos" onPress={findPhotos} disabled={loading} />

      {error && <Text style={styles.error}>Something went wrong: {error}</Text>}
      {photos && (
        <View style={[styles.statRow, !showPhotos && styles.centerRow]}>
          <Text style={styles.statNumber}>{totalCount}</Text>
          <Text style={styles.statLabel}>
            {totalCount === 1 ? 'photo' : 'photos'} in this range
          </Text>
        </View>
      )}
      {photos && totalCount > 0 && (
        <View style={styles.actions}>
          <ActionCard
            icon="⇆"
            title="Swipe"
            subtitle="Go through them one by one"
            onPress={() => setMode('swipe')}
            highlight
          />
          <ActionCard
            icon="★"
            iconColor={colors.gold}
            title="Best shot"
            subtitle="Pick from similar photos"
            onPress={() => setMode('best')}
          />
        </View>
      )}
      {photos && totalCount > 0 && (
        <Pressable onPress={() => setShowPhotos((v) => !v)} style={styles.showButton} hitSlop={8}>
          <Text style={styles.showButtonText}>{showPhotos ? 'Hide photos' : 'Show photos'}</Text>
        </Pressable>
      )}
    </View>
  );

  if (!showPhotos) {
    return (
      <SafeAreaView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.centeredScroll}>
          {header}
          <Text style={styles.version}>Version: step 7, layout 1</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <FlatList
        ListHeaderComponent={header}
        data={photos ?? []}
        keyExtractor={(item) => item.id}
        numColumns={COLUMNS}
        renderItem={({ item }) => <PhotoThumb asset={item} style={styles.tile} small />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          <View>
            {loading && <ActivityIndicator color={colors.accent} style={{ margin: 16 }} />}
            <Text style={styles.version}>Version: step 7, layout 1</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function ActionCard({
  icon,
  title,
  subtitle,
  onPress,
  highlight,
  iconColor,
}: {
  icon: string;
  iconColor?: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  highlight?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        highlight && styles.actionHighlight,
        pressed && { opacity: 0.75 },
      ]}
    >
      <Text
        style={[
          styles.actionIcon,
          iconColor ? { color: iconColor } : null,
          highlight && { color: colors.onAccent },
        ]}
      >
        {icon}
      </Text>
      <Text style={[styles.actionTitle, highlight && { color: colors.onAccent }]}>{title}</Text>
      <Text style={[styles.actionSub, highlight && { color: colors.onAccent, opacity: 0.75 }]}>
        {subtitle}
      </Text>
    </Pressable>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.centered}>
      <StatusBar style="light" />
      {children}
    </View>
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
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  title: {
    fontSize: 44,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 16,
    color: colors.muted,
    marginTop: 2,
    marginBottom: 20,
  },
  body: {
    fontSize: 16,
    textAlign: 'center',
    color: colors.muted,
    marginVertical: 16,
    lineHeight: 22,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  untilRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  today: {
    fontSize: 16,
    color: colors.muted,
  },
  label: {
    fontSize: 16,
    color: colors.text,
  },
  note: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 8,
  },
  error: {
    color: colors.delete,
    marginTop: 8,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 24,
  },
  statNumber: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.text,
  },
  statLabel: {
    fontSize: 16,
    color: colors.muted,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  action: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionHighlight: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  actionIcon: {
    fontSize: 26,
    color: colors.accent,
    marginBottom: 14,
  },
  actionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  actionSub: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 4,
  },
  section: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.faint,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 28,
    marginBottom: 4,
  },
  centerText: {
    textAlign: 'center',
  },
  centerRow: {
    justifyContent: 'center',
  },
  centeredScroll: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  showButton: {
    alignSelf: 'center',
    marginTop: 18,
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  showButtonText: {
    fontSize: 14,
    color: colors.muted,
    fontWeight: '600',
  },
  tile: {
    width: TILE,
    height: TILE,
    borderWidth: 1,
    borderColor: colors.bg,
  },
  version: {
    fontSize: 11,
    color: colors.faint,
    textAlign: 'center',
    marginVertical: 24,
  },
});
