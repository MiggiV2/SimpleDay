import { StyleSheet, View, TextInput, TouchableOpacity, Alert, ScrollView, Text } from 'react-native';
import { useState, useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Paths, Directory, File } from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import Toast from 'react-native-toast-message';
import { webdavService } from '../services/webdav';

export default function EntryScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isPreview, setIsPreview] = useState(false);

  useEffect(() => {
    loadEntry();
  }, [params.filename, params.date]);

  const loadEntry = async () => {
    try {
      if (params.new === 'true') {
        setIsEditing(true);
        setTitle('');
        setContent('');
        return;
      }

      if (params.filename) {
        const diaryDir = new Directory(Paths.document, 'diary');
        const file = new File(diaryDir, params.filename as string);
        const fileContent = await file.text();
        setContent(fileContent);
        
        // Extract title from filename
        const parts = (params.filename as string).replace('.md', '').split('_');
        setTitle(parts.slice(1).join('_').replace(/_/g, ' ') || 'Untitled');
      }
    } catch (error) {
      console.error('Error loading entry:', error);
      Alert.alert('Error', 'Failed to load entry');
    }
  };

  const saveEntry = async () => {
    try {
      if (!content.trim()) {
        Alert.alert('Error', 'Entry cannot be empty');
        return;
      }

      const diaryDir = new Directory(Paths.document, 'diary');
      if (!(await diaryDir.exists)) {
        await diaryDir.create();
      }

      const date = params.date || (params.filename as string).split('_')[0];
      const sanitizedTitle = title.trim().replace(/[^a-zA-Z0-9]/g, '_') || 'untitled';
      const filename = `${date}_${sanitizedTitle}.md`;

      // If editing existing file with different title, delete old file
      if (params.filename && params.filename !== filename) {
        const oldFile = new File(diaryDir, params.filename as string);
        if (await oldFile.exists) {
          await oldFile.delete();
        }
      }

      const file = new File(diaryDir, filename);
      await file.write(content);
      
      // Sync to WebDAV in background
      webdavService.syncAfterSave(filename);
      
      Toast.show({
        type: 'success',
        text1: 'Entry saved',
        position: 'bottom',
        visibilityTime: 2000,
      });
      
      router.back();
    } catch (error) {
      console.error('Error saving entry:', error);
      Alert.alert('Error', 'Failed to save entry');
    }
  };

  const deleteEntry = () => {
    Alert.alert(
      'Delete Entry',
      'Are you sure you want to delete this entry?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (params.filename) {
                const diaryDir = new Directory(Paths.document, 'diary');
                const file = new File(diaryDir, params.filename as string);
                await file.delete();
                
                // Sync deletion to WebDAV
                webdavService.syncAfterDelete(params.filename as string);
                
                router.back();
              }
            } catch (error) {
              console.error('Error deleting entry:', error);
              Alert.alert('Error', 'Failed to delete entry');
            }
          },
        },
      ]
    );
  };

  const getFormattedDate = () => {
    const dateStr = params.date || (params.filename as string)?.split('_')[0];
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
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        
        <Text style={styles.dateText}>{getFormattedDate()}</Text>

        <View style={styles.headerButtons}>
          {!isEditing && !params.new && (
            <TouchableOpacity onPress={deleteEntry} style={styles.iconButton}>
              <Ionicons name="trash-outline" size={24} color="#FF3B30" />
            </TouchableOpacity>
          )}
          {isEditing && (
            <TouchableOpacity onPress={() => setIsPreview(!isPreview)} style={styles.iconButton}>
              <Ionicons name={isPreview ? "create-outline" : "eye-outline"} size={24} color="#007AFF" />
            </TouchableOpacity>
          )}
          <TouchableOpacity 
            onPress={() => {
              if (isEditing) {
                saveEntry();
              } else {
                setIsEditing(true);
              }
            }} 
            style={styles.iconButton}
          >
            <Ionicons name={isEditing ? "checkmark" : "create-outline"} size={24} color="#007AFF" />
          </TouchableOpacity>
        </View>
      </View>

      {isEditing && (
        <View style={styles.titleContainer}>
          <TextInput
            style={styles.titleInput}
            placeholder="Entry title..."
            value={title}
            onChangeText={setTitle}
            placeholderTextColor="#999"
          />
        </View>
      )}

      {isEditing && !isPreview ? (
        <TextInput
          style={styles.textInput}
          value={content}
          onChangeText={setContent}
          placeholder="Write your thoughts here... (Markdown supported)"
          placeholderTextColor="#999"
          multiline
          textAlignVertical="top"
        />
      ) : (
        <ScrollView style={styles.previewContainer} contentContainerStyle={styles.previewContent}>
          {content ? (
            <Markdown style={markdownStyles}>{content}</Markdown>
          ) : (
            <Text style={styles.emptyText}>No content yet</Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 4,
  },
  dateText: {
    fontSize: 14,
    color: '#666',
    flex: 1,
    textAlign: 'center',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  iconButton: {
    padding: 4,
  },
  titleContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  titleInput: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  textInput: {
    flex: 1,
    padding: 16,
    fontSize: 16,
    color: '#333',
    lineHeight: 24,
  },
  previewContainer: {
    flex: 1,
  },
  previewContent: {
    padding: 16,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    fontStyle: 'italic',
  },
});

const markdownStyles = {
  body: {
    fontSize: 16,
    color: '#333',
    lineHeight: 24,
  },
  heading1: {
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 10,
  },
  heading2: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  heading3: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 12,
    marginBottom: 6,
  },
  paragraph: {
    marginBottom: 12,
  },
  listItem: {
    marginBottom: 6,
  },
  code_inline: {
    backgroundColor: '#f5f5f5',
    padding: 4,
    borderRadius: 4,
    fontFamily: 'monospace',
  },
  code_block: {
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    fontFamily: 'monospace',
  },
  blockquote: {
    borderLeftWidth: 4,
    borderLeftColor: '#ddd',
    paddingLeft: 12,
    marginLeft: 0,
    fontStyle: 'italic',
  },
};
