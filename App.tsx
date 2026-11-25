import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Galeri</Text>
      <Text style={styles.subtitle}>Clean up your photos, one swipe at a time.</Text>
      <Text style={styles.hint}>Swipe left to delete, right to keep. Coming soon.</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 40,
    fontWeight: '700',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 18,
    textAlign: 'center',
    color: '#333',
    marginBottom: 8,
  },
  hint: {
    fontSize: 14,
    textAlign: 'center',
    color: '#888',
  },
});
