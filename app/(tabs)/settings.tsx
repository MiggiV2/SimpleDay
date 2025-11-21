import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Alert, Platform } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { storage } from '../../services/storage';
import { crypto } from '../../services/crypto';
import { notificationService } from '../../services/notifications';
import Toast from 'react-native-toast-message';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Header } from '../../components/Header';
import { Toggle } from '../../components/Toggle';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { EncryptionKeyManager } from '../../components/EncryptionKeyManager';

interface WebDAVConfig {
  url: string;
  username: string;
  password: string;
  enabled: boolean;
  encryptionEnabled: boolean;
  encryptionKey?: string;
}

export default function SettingsScreen() {
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [encryptionEnabled, setEncryptionEnabled] = useState(false);
  const [encryptionKey, setEncryptionKey] = useState<string | undefined>();
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
        setEnabled(config.enabled || false);
        setEncryptionEnabled(config.encryptionEnabled || false);
        
        // Migrate legacy password storage to secure storage
        if (config.password) {
          try {
            const legacyPassword = crypto.decryptLegacy(config.password);
            await crypto.storePassword(legacyPassword);
            setPassword(legacyPassword);
            
            // Clear legacy password from config
            config.password = '';
            await storage.setItem('webdav_config', JSON.stringify(config));
            console.log('Migrated password to secure storage');
          } catch (error) {
            console.error('Error migrating password:', error);
          }
        } else {
          // Load from secure storage
          const securePassword = await crypto.getPassword();
          setPassword(securePassword || '');
        }
        
        // Migrate legacy encryption key to secure storage
        if (config.encryptionKey) {
          try {
            await crypto.storeEncryptionKey(config.encryptionKey);
            setEncryptionKey(config.encryptionKey);
            
            // Clear legacy key from config
            config.encryptionKey = undefined;
            await storage.setItem('webdav_config', JSON.stringify(config));
            console.log('Migrated encryption key to secure storage');
          } catch (error) {
            console.error('Error migrating encryption key:', error);
            setEncryptionKey(config.encryptionKey);
          }
        } else {
          // Load from secure storage
          const secureKey = await crypto.getEncryptionKey();
          setEncryptionKey(secureKey || undefined);
        }
      } else {
        // No config exists, try loading from secure storage
        const securePassword = await crypto.getPassword();
        const secureKey = await crypto.getEncryptionKey();
        setPassword(securePassword || '');
        setEncryptionKey(secureKey || undefined);
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
      // Store password securely in platform keystore
      if (password) {
        await crypto.storePassword(password);
      } else {
        await crypto.deletePassword();
      }
      
      // Store encryption key securely in platform keystore
      if (encryptionKey) {
        await crypto.storeEncryptionKey(encryptionKey);
      } else {
        await crypto.deleteEncryptionKey();
      }
      
      // Store only non-sensitive configuration
      const config: WebDAVConfig = {
        url: url.trim(),
        username: username.trim(),
        password: '', // No longer store password in config
        enabled: enabled,
        encryptionEnabled: encryptionEnabled,
        encryptionKey: undefined, // No longer store key in config
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
      <Header title="Settings" />

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Daily Reminder</Text>
          <Text style={styles.sectionDescription}>
            Get a daily notification to remind you to write in your diary
          </Text>

          <Toggle
            label="Enable Daily Reminder"
            value={notificationsEnabled}
            onToggle={setNotificationsEnabled}
          />

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

          <Toggle
            label="Enable WebDAV Sync"
            value={enabled}
            onToggle={setEnabled}
          />

          {enabled && (
            <>
              <Input
                label="WebDAV URL"
                value={url}
                onChangeText={setUrl}
                placeholder="https://your-server.com/webdav"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />

              <Input
                label="Username"
                value={username}
                onChangeText={setUsername}
                placeholder="username"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Input
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="password"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Button
                title="Verify Connection"
                onPress={verifyConnection}
                variant="outline"
                icon="checkmark-circle-outline"
                loading={isVerifying}
                style={styles.verifyButton}
              />

              <EncryptionKeyManager
                enabled={encryptionEnabled}
                encryptionKey={encryptionKey}
                onToggle={setEncryptionEnabled}
                onKeyGenerated={setEncryptionKey}
              />

              <View style={styles.syncInfo}>
                <Ionicons name="time-outline" size={16} color="#666" />
                <Text style={styles.syncInfoText}>
                  Last sync: {formatSyncTime(lastSyncTime)}
                </Text>
              </View>
            </>
          )}
        </View>

        <Button
          title="Save Settings"
          onPress={saveSettings}
          loading={isSaving}
        />

        <View style={styles.dangerSection}>
          <Text style={styles.dangerSectionTitle}>Danger Zone</Text>
          <Button
            title="Wipe All Local Entries"
            onPress={handleWipeLocalEntries}
            variant="danger"
            icon="trash-outline"
          />
          <Text style={styles.dangerWarning}>
            ⚠️ This will permanently delete all local entries. WebDAV entries will NOT be affected.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.aboutText}>SimpleDay v1.1.0</Text>
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
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  verifyButton: {
    marginBottom: 16,
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
  dangerSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
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
  dangerWarning: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 12,
  },
});

