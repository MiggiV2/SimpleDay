import { View, Text, StyleSheet, TouchableOpacity, Alert, Modal } from 'react-native';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Button } from './Button';
import { Toggle } from './Toggle';
import { crypto } from '../services/crypto';
import * as Clipboard from 'expo-clipboard';

interface EncryptionKeyManagerProps {
  enabled: boolean;
  encryptionKey?: string;
  onToggle: (enabled: boolean) => void;
  onKeyGenerated: (key: string) => void;
}

export function EncryptionKeyManager({ 
  enabled, 
  encryptionKey, 
  onToggle, 
  onKeyGenerated 
}: EncryptionKeyManagerProps) {
  const [showKey, setShowKey] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [generatedKey, setGeneratedKey] = useState('');

  const handleToggle = (newValue: boolean) => {
    if (newValue && !encryptionKey) {
      // Need to generate key first
      Alert.alert(
        'Generate Encryption Key',
        'You need to generate an encryption key before enabling encryption. Would you like to generate one now?',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Generate', 
            onPress: () => handleGenerateKey()
          }
        ]
      );
    } else if (!newValue && encryptionKey) {
      // Warn about disabling encryption
      Alert.alert(
        'Disable Encryption',
        '⚠️ Warning: Disabling encryption will upload future entries as plain text. Existing encrypted files on WebDAV will remain encrypted.\n\nAre you sure?',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Disable', 
            style: 'destructive',
            onPress: () => onToggle(false)
          }
        ]
      );
    } else {
      onToggle(newValue);
    }
  };

  const handleGenerateKey = async () => {
    try {
      const newKey = await crypto.generateEncryptionKey();
      setGeneratedKey(newKey);
      setShowKeyModal(true);
    } catch (error) {
      Alert.alert('Error', 'Failed to generate encryption key');
    }
  };

  const handleConfirmKey = () => {
    onKeyGenerated(generatedKey);
    onToggle(true);
    setShowKeyModal(false);
    setGeneratedKey('');
  };

  const copyToClipboard = async (text: string) => {
    try {
      await Clipboard.setStringAsync(text);
      Alert.alert('Copied', 'Encryption key copied to clipboard');
    } catch (error) {
      Alert.alert('Error', 'Failed to copy to clipboard');
    }
  };

  const maskKey = (key: string) => {
    if (!key) return '';
    return key.substring(0, 8) + '••••••••' + key.substring(key.length - 8);
  };

  return (
    <View style={styles.container}>
      <Toggle
        label="Enable WebDAV Encryption"
        value={enabled}
        onToggle={handleToggle}
      />

      <Text style={styles.description}>
        Encrypt your diary entries before uploading to WebDAV using AES-256-GCM encryption.
        Your encryption key never leaves your device.
      </Text>

      {encryptionKey && (
        <View style={styles.keySection}>
          <View style={styles.keyHeader}>
            <Text style={styles.keyLabel}>Encryption Key</Text>
            <TouchableOpacity onPress={() => setShowKey(!showKey)}>
              <Ionicons 
                name={showKey ? "eye-off-outline" : "eye-outline"} 
                size={20} 
                color="#007AFF" 
              />
            </TouchableOpacity>
          </View>
          
          <View style={styles.keyContainer}>
            <Text style={styles.keyText} numberOfLines={showKey ? undefined : 1}>
              {showKey ? encryptionKey : maskKey(encryptionKey)}
            </Text>
            <TouchableOpacity 
              onPress={() => copyToClipboard(encryptionKey)}
              style={styles.copyButton}
            >
              <Ionicons name="copy-outline" size={18} color="#007AFF" />
            </TouchableOpacity>
          </View>

          <Text style={styles.warningText}>
            ⚠️ Store this key safely! You'll need it to decrypt your backups if you reinstall the app.
          </Text>
        </View>
      )}

      {!encryptionKey && (
        <Button
          title="Generate Encryption Key"
          onPress={handleGenerateKey}
          icon="key-outline"
          variant="outline"
          style={styles.generateButton}
        />
      )}

      {/* Key Generation Modal */}
      <Modal
        visible={showKeyModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowKeyModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Ionicons name="key" size={48} color="#007AFF" />
            <Text style={styles.modalTitle}>Your Encryption Key</Text>
            <Text style={styles.modalDescription}>
              This is your encryption key. Store it safely - you'll need it to decrypt your backups.
            </Text>

            <View style={styles.keyDisplay}>
              <Text style={styles.keyDisplayText} selectable>
                {generatedKey}
              </Text>
            </View>

            <Button
              title="Copy to Clipboard"
              onPress={() => copyToClipboard(generatedKey)}
              icon="copy-outline"
              variant="outline"
              style={styles.modalButton}
            />

            <Text style={styles.modalWarning}>
              ⚠️ Make sure to save this key! If you lose it, you won't be able to decrypt your backups.
            </Text>

            <View style={styles.modalActions}>
              <Button
                title="Cancel"
                onPress={() => {
                  setShowKeyModal(false);
                  setGeneratedKey('');
                }}
                variant="secondary"
                style={styles.modalActionButton}
              />
              <Button
                title="I've Saved It"
                onPress={handleConfirmKey}
                style={styles.modalActionButton}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
  },
  description: {
    fontSize: 13,
    color: '#666',
    marginTop: 8,
    lineHeight: 18,
  },
  keySection: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  keyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  keyLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  keyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  keyText: {
    flex: 1,
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#333',
  },
  copyButton: {
    padding: 4,
    marginLeft: 8,
  },
  warningText: {
    fontSize: 11,
    color: '#FF6B00',
    marginTop: 8,
    fontStyle: 'italic',
  },
  generateButton: {
    marginTop: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  modalDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  keyDisplay: {
    width: '100%',
    backgroundColor: '#f8f9fa',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginBottom: 16,
  },
  keyDisplayText: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#333',
    textAlign: 'center',
  },
  modalButton: {
    width: '100%',
    marginBottom: 16,
  },
  modalWarning: {
    fontSize: 12,
    color: '#FF6B00',
    textAlign: 'center',
    marginBottom: 16,
    fontWeight: '500',
  },
  modalActions: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  modalActionButton: {
    flex: 1,
  },
});
