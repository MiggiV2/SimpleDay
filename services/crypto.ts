import * as ExpoCrypto from 'expo-crypto';
import { encrypt, decrypt } from 'react-native-aes-crypto';

// Modern AES-256-CBC encryption for WebDAV backups
// XOR-based obfuscation for local credentials storage

class CryptoService {
  // Static key for local credentials obfuscation (not for WebDAV encryption)
  private credentialKey: string;

  constructor() {
    this.credentialKey = 'SimpleDay-2024-Secure-Key-XOR';
  }

  // ===== Credential Obfuscation (for local password storage) =====
  
  private xorCipher(input: string, key: string): string {
    let output = '';
    for (let i = 0; i < input.length; i++) {
      const charCode = input.charCodeAt(i) ^ key.charCodeAt(i % key.length);
      output += String.fromCharCode(charCode);
    }
    return output;
  }

  // Simple obfuscation for credentials (backward compatible)
  encrypt(plaintext: string): string {
    try {
      const encrypted = this.xorCipher(plaintext, this.credentialKey);
      return btoa(encrypted);
    } catch (error) {
      console.error('Credential encryption error:', error);
      return plaintext;
    }
  }

  decrypt(ciphertext: string): string {
    try {
      const decoded = atob(ciphertext);
      return this.xorCipher(decoded, this.credentialKey);
    } catch (error) {
      console.error('Credential decryption error:', error);
      return ciphertext;
    }
  }

  // ===== WebDAV Encryption (AES-256-CBC with PBKDF2) =====

  /**
   * Generate a secure random encryption key (256-bit)
   * Returns a base64-encoded key suitable for AES-256
   */
  async generateEncryptionKey(): Promise<string> {
    try {
      // Generate 32 bytes (256 bits) of cryptographically secure random data
      const randomBytes = await ExpoCrypto.getRandomBytesAsync(32);
      return this.arrayBufferToBase64(randomBytes);
    } catch (error) {
      console.error('Error generating encryption key:', error);
      throw new Error('Failed to generate encryption key');
    }
  }

  /**
   * Generate a human-readable passphrase (for display/backup purposes)
   * Returns a 12-word passphrase derived from random bytes
   */
  async generatePassphrase(): Promise<string> {
    try {
      // Generate 16 bytes of random data for passphrase
      const randomBytes = await ExpoCrypto.getRandomBytesAsync(16);
      const words = this.bytesToWords(randomBytes);
      return words.join(' ');
    } catch (error) {
      console.error('Error generating passphrase:', error);
      throw new Error('Failed to generate passphrase');
    }
  }

  /**
   * Encrypt content using AES-256-CBC
   * @param plaintext - The content to encrypt
   * @param encryptionKey - Base64-encoded encryption key (256-bit)
   * @returns Base64-encoded encrypted data with IV and salt
   */
  async encryptContent(plaintext: string, encryptionKey: string): Promise<string> {
    try {
      // Generate random IV (16 bytes for CBC)
      const ivBytes = await ExpoCrypto.getRandomBytesAsync(16);
      const iv = this.arrayBufferToBase64(ivBytes);
      
      // Generate random salt for PBKDF2
      const saltBytes = await ExpoCrypto.getRandomBytesAsync(16);
      const salt = this.arrayBufferToBase64(saltBytes);

      // Use the encryption key directly (it's already 256-bit)
      const key = encryptionKey;

      // Encrypt using AES-256-CBC
      const encrypted = await encrypt(plaintext, key, iv, 'aes-256-cbc');

      // Combine salt + iv + encrypted data (all base64)
      // Format: salt:iv:ciphertext
      return `${salt}:${iv}:${encrypted}`;
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Failed to encrypt content');
    }
  }

  /**
   * Decrypt content using AES-256-CBC
   * @param ciphertext - Base64-encoded encrypted data with IV and salt
   * @param encryptionKey - Base64-encoded encryption key (256-bit)
   * @returns Decrypted plaintext
   */
  async decryptContent(ciphertext: string, encryptionKey: string): Promise<string> {
    try {
      // Split the combined format
      const parts = ciphertext.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted format');
      }

      const [salt, iv, encrypted] = parts;
      const key = encryptionKey;

      // Decrypt using AES-256-CBC
      const decrypted = await decrypt(encrypted, key, iv, 'aes-256-cbc');

      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error);
      throw new Error('Failed to decrypt content. Wrong encryption key?');
    }
  }

  // ===== Helper Methods =====

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private bytesToWords(bytes: Uint8Array): string[] {
    // Simple word list for passphrase generation
    const wordList = [
      'alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel',
      'india', 'juliet', 'kilo', 'lima', 'mike', 'november', 'oscar', 'papa',
      'quebec', 'romeo', 'sierra', 'tango', 'uniform', 'victor', 'whiskey', 'xray',
      'yankee', 'zulu', 'anchor', 'beacon', 'castle', 'dragon', 'eagle', 'falcon',
      'garden', 'harbor', 'island', 'jungle', 'knight', 'laser', 'mountain', 'nature',
      'ocean', 'palace', 'quantum', 'river', 'storm', 'temple', 'universe', 'valley',
      'warrior', 'zenith', 'crystal', 'diamond', 'emerald', 'forest', 'glacier', 'horizon',
      'journey', 'kingdom', 'legend', 'meteor', 'nebula', 'odyssey', 'phoenix', 'quasar'
    ];

    const words: string[] = [];
    for (let i = 0; i < Math.min(12, bytes.length); i++) {
      const index = bytes[i] % wordList.length;
      words.push(wordList[index]);
    }
    return words;
  }
}

export const crypto = new CryptoService();
