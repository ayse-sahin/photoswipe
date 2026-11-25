import { StatusBar } from 'expo-status-bar';
import * as MediaLibrary from 'expo-media-library/legacy';
import { useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Linking,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import DateField from './src/DateField';
import Button from './src/Button';
import PhotoThumb from './src/PhotoThumb';
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

  const rangeEnd = useEndDate ? endDate : new Date();

  async function findPhotos() {
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
        <ActivityIndicator />
      </Centered>
    );
  }

  // 2. No permission yet: explain and ask
  if (!permission.granted) {
    return (
      <Centered>
        <Text style={styles.title}>Galeri</Text>
        <Text style={styles.body}>
          Galeri needs access to your photos so you can swipe through them. Your photos never leave
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
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="auto" />
      <View style={styles.header}>
        <Text style={styles.title}>Galeri</Text>
        <Text style={styles.note}>Version: step 6, update 2</Text>
        {permission.accessPrivileges === 'limited' && (
          <Text style={styles.note}>You gave access to only some photos, so only those will show.</Text>
        )}

        <DateField
          label="Start date"
          value={startDate}
          maximumDate={rangeEnd}
          onChange={setStartDate}
        />
        <View style={styles.row}>
          <Text style={styles.label}>Choose an end date</Text>
          <Switch value={useEndDate} onValueChange={setUseEndDate} />
        </View>
        {useEndDate ? (
          <DateField
            label="End date"
            value={endDate}
            minimumDate={startDate}
            maximumDate={new Date()}
            onChange={setEndDate}
          />
        ) : (
          <Text style={styles.note}>Showing photos up to today.</Text>
        )}

        <Button label="Find photos" onPress={findPhotos} disabled={loading} />

        {error && <Text style={styles.error}>Something went wrong: {error}</Text>}
        {photos && (
          <Text style={styles.count}>
            {totalCount === 0
              ? 'No photos in this range.'
              : `${totalCount} photo${totalCount === 1 ? '' : 's'} found`}
          </Text>
        )}
        {photos && totalCount > 0 && (
          <>
            <Button label="Start swiping" onPress={() => setMode('swipe')} />
            <Button label="Pick the best shot" onPress={() => setMode('best')} variant="secondary" />
          </>
        )}
      </View>

      <FlatList
        data={photos ?? []}
        keyExtractor={(item) => item.id}
        numColumns={COLUMNS}
        renderItem={({ item }) => <PhotoThumb asset={item} style={styles.tile} small />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={loading ? <ActivityIndicator style={{ margin: 16 }} /> : undefined}
      />
    </SafeAreaView>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.centered}>
      <StatusBar style="auto" />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centered: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
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
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  label: {
    fontSize: 16,
    color: '#333',
  },
  note: {
    fontSize: 13,
    color: '#888',
    marginBottom: 4,
  },
  error: {
    color: '#c00',
    marginTop: 8,
  },
  count: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  tile: {
    width: TILE,
    height: TILE,
    borderWidth: 1,
    borderColor: '#fff',
  },
});
