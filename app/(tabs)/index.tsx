import { StyleSheet, FlatList, TouchableOpacity, View, Text, Alert, ActivityIndicator } from 'react-native';
import { useState, useCallback, memo } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Paths, Directory, File } from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import { webdavService } from '../../services/webdav';
import Toast from 'react-native-toast-message';

interface DiaryEntry {
  filename: string;
  date: string;
  title: string;
  preview: string;
}

// Memoized entry card component for better performance
const EntryCard = memo(({ item, onPress }: { item: DiaryEntry; onPress: () => void }) => {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  return (
    <TouchableOpacity style={styles.entryCard} onPress={onPress}>
      <Text style={styles.entryDate}>{formatDate(item.date)}</Text>
      <Text style={styles.entryTitle}>{item.title}</Text>
      <Text style={styles.entryPreview} numberOfLines={2}>
        {item.preview}
      </Text>
    </TouchableOpacity>
  );
});
EntryCard.displayName = 'EntryCard';

export default function DiaryListScreen() {
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, filename: '' });
  const [showImportPrompt, setShowImportPrompt] = useState(false);
  const [showSyncPrompt, setShowSyncPrompt] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ localOnly: number; remoteOnly: number } | null>(null);
  const router = useRouter();

  const loadEntries = async () => {
    try {
      const diaryDir = new Directory(Paths.document, 'diary');
      
      if (!(await diaryDir.exists)) {
        await diaryDir.create();
        setEntries([]);
        return;
      }

      const files = await diaryDir.list();
      const mdFiles = files.filter(f => f.name.endsWith('.md'));
      
      const entriesData = await Promise.all(
        mdFiles.map(async (file) => {
          const fileObj = new File(diaryDir, file.name);
          const content = await fileObj.text();
          
          // Extract title from filename: DATE_title.md
          const parts = file.name.replace('.md', '').split('_');
          const date = parts[0];
          const title = parts.slice(1).join('_').replace(/_/g, ' ') || 'Untitled';
          
          // Get preview (first 100 chars of content)
          const preview = content.substring(0, 100).replace(/[#*_`]/g, '').trim();
          
          return { filename: file.name, date, title, preview };
        })
      );

      // Sort by date descending
      entriesData.sort((a, b) => b.date.localeCompare(a.date));
      setEntries(entriesData);
      
      // Show import prompt if no entries
      if (entriesData.length === 0) {
        setShowImportPrompt(true);
      }
    } catch (error) {
      console.error('Error loading entries:', error);
      Alert.alert('Error', 'Failed to load diary entries');
    }
  };

  const checkSyncOnStartup = async () => {
    const configured = await webdavService.isConfigured();
    if (!configured) return;

    try {
      const status = await webdavService.checkSyncStatus();
      
      if (!status.inSync) {
        setSyncStatus({
          localOnly: status.localOnly.length,
          remoteOnly: status.remoteOnly.length,
        });
        setShowSyncPrompt(true);
      }
    } catch (error) {
      console.error('Error checking sync status:', error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadEntries();
      checkSyncOnStartup();
    }, [])
  );

  const createNewEntry = () => {
    const today = new Date().toISOString().split('T')[0];
    router.push(`/entry?date=${today}&new=true`);
  };

  const openEntry = useCallback((entry: DiaryEntry) => {
    router.push(`/entry?filename=${entry.filename}`);
  }, [router]);

  const renderItem = useCallback(({ item }: { item: DiaryEntry }) => (
    <EntryCard item={item} onPress={() => openEntry(item)} />
  ), [openEntry]);

  const handleImport = async () => {
    setShowImportPrompt(false);
    
    // Check if WebDAV is configured
    const configured = await webdavService.isConfigured();
    
    if (!configured) {
      Alert.alert(
        'Setup WebDAV',
        'WebDAV sync is not configured. Would you like to set it up now?',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Setup', 
            onPress: () => {
              // Navigate to settings
              router.push('/(tabs)/settings');
            }
          }
        ]
      );
      return;
    }
    
    // Import from WebDAV
    setIsImporting(true);
    setImportProgress({ current: 0, total: 0, filename: '' });
    try {
      const result = await webdavService.importFromWebDAV((current, total, filename) => {
        setImportProgress({ current, total, filename });
      });
      
      // Reload entries first
      await loadEntries();
      
      // Only show alert if there were errors or failed completely
      if (!result.success && result.errors.length > 0) {
        Alert.alert(
          'Import Complete with Errors',
          `Imported ${result.imported} ${result.imported === 1 ? 'entry' : 'entries'}.\n\nErrors:\n${result.errors.join('\n')}`,
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Import error:', error);
      Alert.alert('Import Failed', 'Failed to import from WebDAV. Please check your connection and settings.');
    } finally {
      setIsImporting(false);
      setImportProgress({ current: 0, total: 0, filename: '' });
    }
  };

  const handleSyncUp = async () => {
    setShowSyncPrompt(false);
    setIsImporting(true);
    
    try {
      const result = await webdavService.syncAllToWebDAV();
      
      if (result.success) {
        Toast.show({
          type: 'success',
          text1: 'Sync Complete',
          text2: `Uploaded ${result.uploaded} ${result.uploaded === 1 ? 'file' : 'files'} to WebDAV`,
        });
      } else {
        Alert.alert(
          'Sync Complete with Errors',
          `Uploaded ${result.uploaded} files.\n\nErrors:\n${result.errors.join('\n')}`,
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Sync error:', error);
      Alert.alert('Sync Failed', 'Failed to sync to WebDAV. Please check your connection and settings.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleSyncDown = async () => {
    setShowSyncPrompt(false);
    setIsImporting(true);
    setImportProgress({ current: 0, total: 0, filename: '' });
    
    try {
      const result = await webdavService.importFromWebDAV((current, total, filename) => {
        setImportProgress({ current, total, filename });
      });
      
      await loadEntries();
      
      if (result.success) {
        Toast.show({
          type: 'success',
          text1: 'Sync Complete',
          text2: `Downloaded ${result.imported} ${result.imported === 1 ? 'file' : 'files'} from WebDAV`,
        });
      } else if (result.errors.length > 0) {
        Alert.alert(
          'Sync Complete with Errors',
          `Downloaded ${result.imported} files.\n\nErrors:\n${result.errors.join('\n')}`,
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Sync error:', error);
      Alert.alert('Sync Failed', 'Failed to sync from WebDAV. Please check your connection and settings.');
    } finally {
      setIsImporting(false);
      setImportProgress({ current: 0, total: 0, filename: '' });
    }
  };

  const handleSyncBoth = async () => {
    setShowSyncPrompt(false);
    setIsImporting(true);
    setImportProgress({ current: 0, total: 0, filename: '' });
    
    try {
      // First upload local files
      const uploadResult = await webdavService.syncAllToWebDAV();
      
      // Then download remote files
      const downloadResult = await webdavService.importFromWebDAV((current, total, filename) => {
        setImportProgress({ current, total, filename });
      });
      
      await loadEntries();
      
      Toast.show({
        type: 'success',
        text1: 'Sync Complete',
        text2: `Uploaded ${uploadResult.uploaded}, downloaded ${downloadResult.imported} files`,
      });
    } catch (error) {
      console.error('Sync error:', error);
      Alert.alert('Sync Failed', 'Failed to sync. Please check your connection and settings.');
    } finally {
      setIsImporting(false);
      setImportProgress({ current: 0, total: 0, filename: '' });
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>SimpleDay</Text>
        <TouchableOpacity style={styles.addButton} onPress={createNewEntry}>
          <Ionicons name="add-circle" size={36} color="#007AFF" />
        </TouchableOpacity>
      </View>

      {entries.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="book-outline" size={64} color="#ccc" />
          <Text style={styles.emptyText}>No entries yet</Text>
          <Text style={styles.emptySubtext}>Tap + to create your first entry</Text>
          
          {showImportPrompt && (
            <View style={styles.importPrompt}>
              <Text style={styles.importPromptText}>
                Do you want to import entries from WebDAV?
              </Text>
              <View style={styles.importButtons}>
                <TouchableOpacity 
                  style={[styles.importButton, styles.importButtonSecondary]} 
                  onPress={() => setShowImportPrompt(false)}
                  disabled={isImporting}
                >
                  <Text style={styles.importButtonTextSecondary}>No, thanks</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.importButton, styles.importButtonPrimary]} 
                  onPress={handleImport}
                  disabled={isImporting}
                >
                  {isImporting ? (
                    <View style={styles.importingContainer}>
                      <ActivityIndicator color="#fff" size="small" />
                      {importProgress.total > 0 && (
                        <Text style={styles.importingText}>
                          {importProgress.current}/{importProgress.total}
                        </Text>
                      )}
                    </View>
                  ) : (
                    <Text style={styles.importButtonTextPrimary}>Yes, import</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.filename}
          renderItem={renderItem}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
          initialNumToRender={15}
          windowSize={10}
          contentContainerStyle={styles.listContent}
        />
      )}
      
      {showSyncPrompt && syncStatus && (
        <View style={styles.progressOverlay}>
          <View style={styles.syncPromptCard}>
            <Ionicons name="cloud-outline" size={64} color="#007AFF" />
            <Text style={styles.syncPromptTitle}>Files Not in Sync</Text>
            <Text style={styles.syncPromptMessage}>
              {syncStatus.localOnly > 0 && `${syncStatus.localOnly} file${syncStatus.localOnly !== 1 ? 's' : ''} only on device`}
              {syncStatus.localOnly > 0 && syncStatus.remoteOnly > 0 && '\n'}
              {syncStatus.remoteOnly > 0 && `${syncStatus.remoteOnly} file${syncStatus.remoteOnly !== 1 ? 's' : ''} only on server`}
            </Text>
            <Text style={styles.syncPromptSubtext}>How would you like to sync?</Text>
            
            <View style={styles.syncButtonsContainer}>
              {syncStatus.localOnly > 0 && (
                <TouchableOpacity 
                  style={styles.syncOptionButton} 
                  onPress={handleSyncUp}
                  disabled={isImporting}
                >
                  <Ionicons name="cloud-upload-outline" size={24} color="#007AFF" />
                  <Text style={styles.syncOptionText}>Upload to Server</Text>
                  <Text style={styles.syncOptionSubtext}>{syncStatus.localOnly} file{syncStatus.localOnly !== 1 ? 's' : ''}</Text>
                </TouchableOpacity>
              )}
              
              {syncStatus.remoteOnly > 0 && (
                <TouchableOpacity 
                  style={styles.syncOptionButton} 
                  onPress={handleSyncDown}
                  disabled={isImporting}
                >
                  <Ionicons name="cloud-download-outline" size={24} color="#007AFF" />
                  <Text style={styles.syncOptionText}>Download to Device</Text>
                  <Text style={styles.syncOptionSubtext}>{syncStatus.remoteOnly} file{syncStatus.remoteOnly !== 1 ? 's' : ''}</Text>
                </TouchableOpacity>
              )}
              
              {syncStatus.localOnly > 0 && syncStatus.remoteOnly > 0 && (
                <TouchableOpacity 
                  style={styles.syncOptionButton} 
                  onPress={handleSyncBoth}
                  disabled={isImporting}
                >
                  <Ionicons name="sync-outline" size={24} color="#007AFF" />
                  <Text style={styles.syncOptionText}>Sync Both Ways</Text>
                  <Text style={styles.syncOptionSubtext}>Upload & download</Text>
                </TouchableOpacity>
              )}
              
              <TouchableOpacity 
                style={[styles.syncOptionButton, styles.syncCancelButton]} 
                onPress={() => setShowSyncPrompt(false)}
                disabled={isImporting}
              >
                <Text style={styles.syncCancelText}>Not Now</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
      
      {isImporting && importProgress.total > 0 && (
        <View style={styles.progressOverlay}>
          <View style={styles.progressCard}>
            <View style={styles.progressIconContainer}>
              <Ionicons name="cloud-download-outline" size={64} color="#007AFF" />
              <Text style={styles.progressPercentage}>
                {Math.round((importProgress.current / importProgress.total) * 100)}%
              </Text>
            </View>
            
            <View style={styles.progressBarContainer}>
              <View 
                style={[
                  styles.progressBarFill,
                  { width: `${(importProgress.current / importProgress.total) * 100}%` }
                ]} 
              />
            </View>
            
            <Text style={styles.progressTitle}>Importing from WebDAV</Text>
            <View style={styles.progressStats}>
              <View style={styles.progressStat}>
                <Ionicons name="cloud-outline" size={16} color="#007AFF" />
                <Text style={styles.progressStatText}>{importProgress.total} on server</Text>
              </View>
              <View style={styles.progressStat}>
                <Ionicons name="checkmark-circle" size={16} color="#34C759" />
                <Text style={styles.progressStatText}>{importProgress.current} imported</Text>
              </View>
              <View style={styles.progressStat}>
                <Ionicons name="time-outline" size={16} color="#999" />
                <Text style={styles.progressStatText}>{importProgress.total - importProgress.current} remaining</Text>
              </View>
            </View>
            <Text style={styles.progressFilename} numberOfLines={1}>
              {importProgress.filename}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
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
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
  },
  addButton: {
    padding: 5,
  },
  listContent: {
    padding: 16,
  },
  entryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  entryDate: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  entryTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  entryPreview: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#999',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#bbb',
    marginTop: 8,
  },
  importPrompt: {
    marginTop: 32,
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    width: '100%',
    maxWidth: 300,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  importPromptText: {
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
    marginBottom: 16,
  },
  importButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  importButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  importButtonPrimary: {
    backgroundColor: '#007AFF',
  },
  importButtonSecondary: {
    backgroundColor: '#f0f0f0',
  },
  importButtonTextPrimary: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  importButtonTextSecondary: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
  },
  importingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  importingText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
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
  progressText: {
    fontSize: 16,
    color: '#666',
    marginTop: 8,
  },
  progressFilename: {
    fontSize: 11,
    color: '#999',
    marginTop: 8,
    width: '100%',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  syncPromptCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  syncPromptTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  syncPromptMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
  },
  syncPromptSubtext: {
    fontSize: 14,
    color: '#999',
    marginBottom: 24,
  },
  syncButtonsContainer: {
    width: '100%',
    gap: 12,
  },
  syncOptionButton: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  syncOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 8,
  },
  syncOptionSubtext: {
    fontSize: 13,
    color: '#999',
    marginTop: 4,
  },
  syncCancelButton: {
    backgroundColor: '#fff',
    marginTop: 8,
  },
  syncCancelText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
});
