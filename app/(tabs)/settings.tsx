import { StyleSheet, View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Platform } from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { storage } from '../../services/storage';
import { crypto } from '../../services/crypto';
import { notificationService } from '../../services/notifications';
import Toast from 'react-native-toast-message';
import { useCallback } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';

interface WebDAVConfig {
  url: string;
  username: string;
  password: string;
  enabled: boolean;
}

export default function SettingsScreen() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  
  // Notification settings
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState(new Date());
  const [showTimePicker, setShowTimePicker] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  useFocusEffect(
    useCallback(() => {
      // Reload sync time when screen comes into focus
      const reloadSyncTime = async () => {
        const lastSync = await storage.getItem('last_sync_time');
        if (lastSync) {
          setLastSyncTime(lastSync);
        }
      };
      reloadSyncTime();
    }, [])
  );

  const loadSettings = async () => {
    try {
      const configStr = await storage.getItem('webdav_config');
      if (configStr) {
        const config: WebDAVConfig = JSON.parse(configStr);
        setUrl(config.url || '');
        setUsername(config.username || '');
        // Decrypt password when loading
        setPassword(config.password ? crypto.decrypt(config.password) : '');
        setEnabled(config.enabled || false);
      }

      const lastSync = await storage.getItem('last_sync_time');
      if (lastSync) {
        setLastSyncTime(lastSync);
      }

      // Load notification settings
      const notifSettings = await notificationService.loadSettings();
      setNotificationsEnabled(notifSettings.enabled);
      const time = new Date();
      time.setHours(notifSettings.hour, notifSettings.minute, 0, 0);
      setReminderTime(time);
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const verifyConnection = async () => {
    if (!url.trim()) {
      Alert.alert('Error', 'Please enter a WebDAV URL');
      return;
    }

    setIsVerifying(true);
    try {
      const response = await fetch(url, {
        method: 'PROPFIND',
        headers: {
          'Authorization': 'Basic ' + btoa(username + ':' + password),
          'Depth': '0',
        },
      });

      if (response.ok || response.status === 207) {
        Toast.show({
          type: 'success',
          text1: 'Connection successful!',
          text2: 'WebDAV server is reachable',
          position: 'bottom',
        });
      } else {
        Alert.alert('Connection Failed', `Server returned status: ${response.status}`);
      }
    } catch (error) {
      Alert.alert('Connection Failed', 'Could not reach WebDAV server. Please check your URL and credentials.');
      console.error('WebDAV verification error:', error);
    } finally {
      setIsVerifying(false);
    }
  };

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      const config: WebDAVConfig = {
        url: url.trim(),
        username: username.trim(),
        // Encrypt password before saving
        password: password ? crypto.encrypt(password) : '',
        enabled: enabled,
      };

      await storage.setItem('webdav_config', JSON.stringify(config));
      
      // Save notification settings
      const notificationResult = await notificationService.saveSettings({
        enabled: notificationsEnabled,
        hour: reminderTime.getHours(),
        minute: reminderTime.getMinutes(),
      });

      if (notificationsEnabled && !notificationResult) {
        Alert.alert(
          'Notification Permission Required',
          'Please enable notifications in your device settings to receive daily reminders.',
          [{ text: 'OK' }]
        );
        setNotificationsEnabled(false);
      }
      
      Toast.show({
        type: 'success',
        text1: 'Settings saved',
        position: 'bottom',
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      Alert.alert('Error', 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const formatSyncTime = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const handleWipeLocalEntries = () => {
    Alert.alert(
      '⚠️ WARNING: Dangerous Action',
      'This will PERMANENTLY DELETE all local diary entries from your device.\n\n' +
      '✓ WebDAV entries will NOT be affected\n' +
      '✓ You can re-import them later\n\n' +
      'Are you absolutely sure?',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Yes, Delete All',
          style: 'destructive',
          onPress: () => showFinalConfirmation()
        }
      ]
    );
  };

  const showFinalConfirmation = () => {
    Alert.alert(
      '⚠️⚠️⚠️ FINAL WARNING ⚠️⚠️⚠️',
      'This is your LAST CHANCE to cancel.\n\n' +
      'All local entries will be PERMANENTLY deleted.\n\n' +
      'This action CANNOT be undone!',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'DELETE EVERYTHING',
          style: 'destructive',
          onPress: () => wipeLocalEntries()
        }
      ]
    );
  };

  const wipeLocalEntries = async () => {
    try {
      const { Paths, Directory } = await import('expo-file-system');
      const diaryDir = new Directory(Paths.document, 'diary');
      
      if (!(await diaryDir.exists)) {
        Alert.alert('Info', 'No local entries found.');
        return;
      }

      const files = await diaryDir.list();
      const mdFiles = files.filter(f => f.name.endsWith('.md'));
      
      if (mdFiles.length === 0) {
        Alert.alert('Info', 'No local entries found.');
        return;
      }

      // Delete all .md files
      for (const file of mdFiles) {
        const { File } = await import('expo-file-system');
        const fileObj = new File(diaryDir, file.name);
        await fileObj.delete();
      }

      Alert.alert(
        'Success',
        `${mdFiles.length} ${mdFiles.length === 1 ? 'entry' : 'entries'} deleted from local storage.\n\nYou can re-import from WebDAV if needed.`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Error wiping entries:', error);
      Alert.alert('Error', 'Failed to delete local entries. Please try again.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Daily Reminder</Text>
          <Text style={styles.sectionDescription}>
            Get a daily notification to remind you to write in your diary
          </Text>

          <View style={styles.toggleContainer}>
            <Text style={styles.label}>Enable Daily Reminder</Text>
            <TouchableOpacity
              style={[styles.toggle, notificationsEnabled && styles.toggleActive]}
              onPress={() => setNotificationsEnabled(!notificationsEnabled)}
            >
              <View style={[styles.toggleThumb, notificationsEnabled && styles.toggleThumbActive]} />
            </TouchableOpacity>
          </View>

          {notificationsEnabled && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Reminder Time</Text>
              <TouchableOpacity
                style={styles.timePickerButton}
                onPress={() => setShowTimePicker(true)}
              >
                <Ionicons name="time-outline" size={20} color="#007AFF" />
                <Text style={styles.timePickerText}>
                  {reminderTime.toLocaleTimeString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit',
                    hour12: true 
                  })}
                </Text>
              </TouchableOpacity>

              {showTimePicker && (
                <DateTimePicker
                  value={reminderTime}
                  mode="time"
                  is24Hour={false}
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(event, selectedDate) => {
                    setShowTimePicker(Platform.OS === 'ios');
                    if (selectedDate) {
                      setReminderTime(selectedDate);
                    }
                  }}
                />
              )}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>WebDAV Sync</Text>
          <Text style={styles.sectionDescription}>
            Sync your diary entries with a WebDAV server for backup and cross-device access
          </Text>

          <View style={styles.toggleContainer}>
            <Text style={styles.label}>Enable WebDAV Sync</Text>
            <TouchableOpacity
              style={[styles.toggle, enabled && styles.toggleActive]}
              onPress={() => setEnabled(!enabled)}
            >
              <View style={[styles.toggleThumb, enabled && styles.toggleThumbActive]} />
            </TouchableOpacity>
          </View>

          {enabled && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>WebDAV URL</Text>
                <TextInput
                  style={styles.input}
                  value={url}
                  onChangeText={setUrl}
                  placeholder="https://your-server.com/webdav"
                  placeholderTextColor="#999"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Username</Text>
                <TextInput
                  style={styles.input}
                  value={username}
                  onChangeText={setUsername}
                  placeholder="username"
                  placeholderTextColor="#999"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Password</Text>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="password"
                  placeholderTextColor="#999"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <TouchableOpacity
                style={styles.verifyButton}
                onPress={verifyConnection}
                disabled={isVerifying}
              >
                {isVerifying ? (
                  <ActivityIndicator color="#007AFF" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={20} color="#007AFF" />
                    <Text style={styles.verifyButtonText}>Verify Connection</Text>
                  </>
                )}
              </TouchableOpacity>

              <View style={styles.syncInfo}>
                <Ionicons name="time-outline" size={16} color="#666" />
                <Text style={styles.syncInfoText}>
                  Last sync: {formatSyncTime(lastSyncTime)}
                </Text>
              </View>
            </>
          )}
        </View>

        <TouchableOpacity
          style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
          onPress={saveSettings}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Save Settings</Text>
          )}
        </TouchableOpacity>

        <View style={styles.dangerSection}>
          <Text style={styles.dangerSectionTitle}>Danger Zone</Text>
          <TouchableOpacity
            style={styles.dangerButton}
            onPress={handleWipeLocalEntries}
          >
            <Ionicons name="trash-outline" size={20} color="#FF3B30" />
            <Text style={styles.dangerButtonText}>Wipe All Local Entries</Text>
          </TouchableOpacity>
          <Text style={styles.dangerWarning}>
            ⚠️ This will permanently delete all local entries. WebDAV entries will NOT be affected.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.aboutText}>SimpleDay v1.0.0</Text>
          <Text style={styles.aboutText}>A minimalistic diary app with Markdown support</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
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
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    lineHeight: 20,
  },
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
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
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#333',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  verifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
    gap: 8,
    marginBottom: 16,
  },
  verifyButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '500',
  },
  timePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    gap: 8,
  },
  timePickerText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '500',
  },
  syncInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  syncInfoText: {
    fontSize: 14,
    color: '#666',
  },
  aboutText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  saveButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 32,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  dangerSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#FF3B30',
  },
  dangerSectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FF3B30',
    marginBottom: 12,
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#FF3B30',
    borderRadius: 8,
    padding: 12,
    gap: 8,
    marginBottom: 12,
  },
  dangerButtonText: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: '600',
  },
  dangerWarning: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
  },
});

