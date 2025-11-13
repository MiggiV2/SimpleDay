import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ProgressOverlayProps {
  current: number;
  total: number;
  filename?: string;
  title?: string;
}

export function ProgressOverlay({ current, total, filename, title = 'Importing from WebDAV' }: ProgressOverlayProps) {
  const percentage = Math.round((current / total) * 100);
  
  return (
    <View style={styles.progressOverlay}>
      <View style={styles.progressCard}>
        <View style={styles.progressIconContainer}>
          <Ionicons name="cloud-download-outline" size={64} color="#007AFF" />
          <Text style={styles.progressPercentage}>{percentage}%</Text>
        </View>
        
        <View style={styles.progressBarContainer}>
          <View 
            style={[
              styles.progressBarFill,
              { width: `${percentage}%` }
            ]} 
          />
        </View>
        
        <Text style={styles.progressTitle}>{title}</Text>
        <View style={styles.progressStats}>
          <View style={styles.progressStat}>
            <Ionicons name="cloud-outline" size={16} color="#007AFF" />
            <Text style={styles.progressStatText}>{total} on server</Text>
          </View>
          <View style={styles.progressStat}>
            <Ionicons name="checkmark-circle" size={16} color="#34C759" />
            <Text style={styles.progressStatText}>{current} imported</Text>
          </View>
          <View style={styles.progressStat}>
            <Ionicons name="time-outline" size={16} color="#999" />
            <Text style={styles.progressStatText}>{total - current} remaining</Text>
          </View>
        </View>
        {filename && (
          <Text style={styles.progressFilename} numberOfLines={1}>
            {filename}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  progressOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 320,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  progressIconContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  progressPercentage: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
    marginTop: 8,
  },
  progressBarContainer: {
    width: '100%',
    height: 8,
    backgroundColor: '#E5E5EA',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 20,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 4,
  },
  progressTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  progressStats: {
    width: '100%',
    gap: 8,
    marginBottom: 12,
  },
  progressStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  progressStatText: {
    fontSize: 14,
    color: '#666',
  },
  progressFilename: {
    fontSize: 11,
    color: '#999',
    marginTop: 8,
    width: '100%',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
