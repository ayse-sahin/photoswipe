import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  label: string;
  value: Date;
  onChange: (date: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
};

// A labelled date picker. iPhone shows a compact picker inline;
// Android opens the system date dialog when tapped.
export default function DateField({ label, value, onChange, minimumDate, maximumDate }: Props) {
  if (Platform.OS === 'android') {
    const open = () =>
      DateTimePickerAndroid.open({
        value,
        mode: 'date',
        minimumDate,
        maximumDate,
        onChange: (event, date) => {
          if (event.type === 'set' && date) onChange(date);
        },
      });
    return (
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <Pressable style={styles.androidButton} onPress={open}>
          <Text style={styles.androidButtonText}>{value.toLocaleDateString()}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <DateTimePicker
        value={value}
        mode="date"
        display="compact"
        minimumDate={minimumDate}
        maximumDate={maximumDate}
        onChange={(_event, date) => {
          if (date) onChange(date);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
  androidButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#eef1f5',
  },
  androidButtonText: {
    fontSize: 16,
  },
});
