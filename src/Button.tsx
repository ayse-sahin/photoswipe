import { Pressable, StyleSheet, Text } from 'react-native';
import { colors } from './theme';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
};

export default function Button({ label, onPress, disabled, variant = 'primary' }: Props) {
  const secondary = variant === 'secondary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondary,
        variant === 'danger' && styles.danger,
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      <Text
        style={[
          styles.text,
          secondary && styles.secondaryText,
          variant === 'danger' && styles.dangerText,
        ]}
      >{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.accent,
    paddingVertical: 15,
    paddingHorizontal: 24,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  secondary: {
    backgroundColor: colors.surfaceHigh,
  },
  danger: {
    backgroundColor: colors.delete,
  },
  dangerText: {
    color: colors.text,
  },
  text: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryText: {
    color: colors.text,
  },
});
