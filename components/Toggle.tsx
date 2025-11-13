import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface ToggleProps {
  label: string;
  value: boolean;
  onToggle: (value: boolean) => void;
  disabled?: boolean;
}

export function Toggle({ label, value, onToggle, disabled }: ToggleProps) {
  return (
    <View style={styles.toggleContainer}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        style={[styles.toggle, value && styles.toggleActive]}
        onPress={() => !disabled && onToggle(!value)}
        disabled={disabled}
      >
        <View style={[styles.toggleThumb, value && styles.toggleThumbActive]} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  toggle: {
    width: 51,
    height: 31,
    borderRadius: 16,
    backgroundColor: '#ddd',
    padding: 2,
  },
  toggleActive: {
    backgroundColor: '#34C759',
  },
  toggleThumb: {
    width: 27,
    height: 27,
    borderRadius: 14,
    backgroundColor: '#fff',
  },
  toggleThumbActive: {
    transform: [{ translateX: 20 }],
  },
});
