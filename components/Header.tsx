import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface HeaderProps {
  title: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onLeftPress?: () => void;
  onRightPress?: () => void;
  subtitle?: string;
}

export function Header({ 
  title, 
  leftIcon, 
  rightIcon, 
  onLeftPress, 
  onRightPress,
  subtitle 
}: HeaderProps) {
  return (
    <View style={styles.header}>
      {leftIcon ? (
        <TouchableOpacity onPress={onLeftPress} style={styles.iconButton}>
          <Ionicons name={leftIcon} size={24} color="#007AFF" />
        </TouchableOpacity>
      ) : (
        <View style={styles.iconButton} />
      )}
      
      <View style={styles.titleContainer}>
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>

      {rightIcon ? (
        <TouchableOpacity onPress={onRightPress} style={styles.iconButton}>
          <Ionicons name={rightIcon} size={24} color="#007AFF" />
        </TouchableOpacity>
      ) : (
        <View style={styles.iconButton} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  iconButton: {
    padding: 5,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
