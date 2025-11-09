import { StyleSheet, FlatList, TouchableOpacity, View, Text, Alert } from 'react-native';
import { useState, useCallback } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Paths, Directory, File } from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';

interface DiaryEntry {
  filename: string;
  date: string;
  title: string;
  preview: string;
}

export default function DiaryListScreen() {
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
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
    } catch (error) {
      console.error('Error loading entries:', error);
      Alert.alert('Error', 'Failed to load diary entries');
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadEntries();
    }, [])
  );

  const createNewEntry = () => {
    const today = new Date().toISOString().split('T')[0];
    router.push(`/entry?date=${today}&new=true`);
  };

  const openEntry = (entry: DiaryEntry) => {
    router.push(`/entry?filename=${entry.filename}`);
  };

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
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.filename}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.entryCard} onPress={() => openEntry(item)}>
              <Text style={styles.entryDate}>{formatDate(item.date)}</Text>
              <Text style={styles.entryTitle}>{item.title}</Text>
              <Text style={styles.entryPreview} numberOfLines={2}>
                {item.preview}
              </Text>
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.listContent}
        />
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
});
