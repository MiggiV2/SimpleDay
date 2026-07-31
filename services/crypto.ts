// SPDX-License-Identifier: GPL-3.0-only
import * as ExpoCrypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import CryptoJS from 'crypto-js';

// AES-256-CBC + HMAC-SHA256 (encrypt-then-MAC) for WebDAV backups.
// Secure storage using platform keystore (iOS Keychain, Android Keystore).

/** Envelope written since 1.3.0: `v2:iv:ciphertext:mac`, all base64 but the tag. */
const V2_PREFIX = 'v2';
// Distinct label per derived key so the encryption key and the MAC key can never
// coincide. Changing a label invalidates every file written with the old one.
const ENC_KEY_LABEL = 'SimpleDay/webdav/enc/v2';
const MAC_KEY_LABEL = 'SimpleDay/webdav/mac/v2';

class CryptoService {
  // Legacy XOR key for backward compatibility (migration only)
  private readonly LEGACY_CREDENTIAL_KEY = 'SimpleDay-2024-Secure-Key-XOR';
  
  // Secure storage keys
  private readonly WEBDAV_PASSWORD_KEY = 'webdav_password_secure';
  private readonly ENCRYPTION_KEY_KEY = 'encryption_key_secure';

  // ===== Secure Credential Storage =====
  
  /**
   * Store WebDAV password securely in platform keystore
   */
  async storePassword(password: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(this.WEBDAV_PASSWORD_KEY, password);
    } catch (error) {
      console.error('Error storing password:', error);
      throw new Error('Failed to securely store password');
    }
  }

  /**
   * Retrieve WebDAV password from secure storage
   */
  async getPassword(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(this.WEBDAV_PASSWORD_KEY);
    } catch (error) {
      console.error('Error retrieving password:', error);
      return null;
    }
  }

  /**
   * Delete WebDAV password from secure storage
   */
  async deletePassword(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(this.WEBDAV_PASSWORD_KEY);
    } catch (error) {
      console.error('Error deleting password:', error);
    }
  }

  /**
   * Store encryption key securely in platform keystore
   */
  async storeEncryptionKey(key: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(this.ENCRYPTION_KEY_KEY, key);
    } catch (error) {
      console.error('Error storing encryption key:', error);
      throw new Error('Failed to securely store encryption key');
    }
  }

  /**
   * Retrieve encryption key from secure storage
   */
  async getEncryptionKey(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(this.ENCRYPTION_KEY_KEY);
    } catch (error) {
      console.error('Error retrieving encryption key:', error);
      return null;
    }
  }

  /**
   * Delete encryption key from secure storage
   */
  async deleteEncryptionKey(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(this.ENCRYPTION_KEY_KEY);
    } catch (error) {
      console.error('Error deleting encryption key:', error);
    }
  }

  // ===== Legacy Migration Support =====
  
  /**
   * Migrate from legacy XOR obfuscation to secure storage
   * @deprecated For backward compatibility only
   */
  private xorCipher(input: string, key: string): string {
    let output = '';
    for (let i = 0; i < input.length; i++) {
      const charCode = input.charCodeAt(i) ^ key.charCodeAt(i % key.length);
      output += String.fromCharCode(charCode);
    }
    return output;
  }

  /**
   * Decrypt legacy XOR-encrypted password
   * @deprecated For migration only
   */
  decryptLegacy(ciphertext: string): string {
    try {
      const decoded = atob(ciphertext);
      return this.xorCipher(decoded, this.LEGACY_CREDENTIAL_KEY);
    } catch (error) {
      console.error('Legacy decryption error:', error);
      return ciphertext;
    }
  }

  // ===== WebDAV Encryption (AES-256-CBC, encrypt-then-HMAC-SHA256) =====
  //
  // No password-based KDF is involved. `generateEncryptionKey` already returns
  // 256 bits from the system CSPRNG, so there is nothing to stretch — versions up
  // to 1.2.2 claimed PBKDF2 in this comment and wrote a random salt into every
  // envelope that no code ever read. The two subkeys below are derived from that
  // key with HMAC, which is domain separation, not key stretching.

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
   * Derive the encryption and authentication subkeys from the stored key.
   * Separate labels mean a MAC can never be computed with the key that encrypts,
   * so the two uses cannot be played off against each other.
   */
  private deriveKeys(encryptionKey: string): {
    encKey: CryptoJS.lib.WordArray;
    macKey: CryptoJS.lib.WordArray;
  } {
    const master = CryptoJS.enc.Base64.parse(encryptionKey);

    return {
      encKey: CryptoJS.HmacSHA256(ENC_KEY_LABEL, master),
      macKey: CryptoJS.HmacSHA256(MAC_KEY_LABEL, master),
    };
  }

  /** Authentication tag over everything in the envelope except the tag itself. */
  private authTag(signedPart: string, macKey: CryptoJS.lib.WordArray): string {
    return CryptoJS.enc.Base64.stringify(CryptoJS.HmacSHA256(signedPart, macKey));
  }

  /**
   * Encrypt content with AES-256-CBC and authenticate it with HMAC-SHA256.
   *
   * The MAC covers the version tag, the IV and the ciphertext, so a WebDAV server
   * cannot flip bits, swap IVs or downgrade the envelope without detection.
   *
   * @param plaintext - The content to encrypt
   * @param encryptionKey - Base64-encoded encryption key (256-bit)
   * @returns `v2:iv:ciphertext:mac`
   */
  async encryptContent(plaintext: string, encryptionKey: string): Promise<string> {
    try {
      const { encKey, macKey } = this.deriveKeys(encryptionKey);

      // Random IV (16 bytes for CBC)
      const ivBytes = await ExpoCrypto.getRandomBytesAsync(16);
      const iv = this.arrayBufferToBase64(ivBytes);

      const encrypted = CryptoJS.AES.encrypt(plaintext, encKey, {
        iv: CryptoJS.enc.Base64.parse(iv),
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      });

      // Encrypt-then-MAC: authenticate the finished ciphertext, never the plaintext.
      const signedPart = `${V2_PREFIX}:${iv}:${encrypted.toString()}`;

      return `${signedPart}:${this.authTag(signedPart, macKey)}`;
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Failed to encrypt content');
    }
  }

  /**
   * Decrypt a `v2:iv:ciphertext:mac` envelope, or a `salt:iv:ciphertext` one
   * written by 1.2.2 and earlier.
   *
   * v2 verifies the MAC before touching the ciphertext. v1 has no MAC to verify —
   * it is read so existing WebDAV files keep opening, and every save rewrites the
   * entry as v2. Support for it can go once no v1 files are left on any server.
   *
   * @param ciphertext - The stored envelope
   * @param encryptionKey - Base64-encoded encryption key (256-bit)
   * @returns Decrypted plaintext
   */
  async decryptContent(ciphertext: string, encryptionKey: string): Promise<string> {
    try {
      const parts = ciphertext.split(':');

      if (parts[0] === V2_PREFIX) {
        if (parts.length !== 4) {
          throw new Error('Invalid encrypted format');
        }

        const [, iv, encrypted, mac] = parts;
        const { encKey, macKey } = this.deriveKeys(encryptionKey);
        const expected = this.authTag(`${V2_PREFIX}:${iv}:${encrypted}`, macKey);

        // Reject before decrypting: an unauthenticated ciphertext is attacker
        // input and must not be fed to AES at all.
        if (!this.constantTimeEquals(mac, expected)) {
          throw new Error('Authentication failed');
        }

        return this.decryptCbc(encrypted, encKey, iv);
      }

      if (parts.length !== 3) {
        throw new Error('Invalid encrypted format');
      }

      // v1: parts[0] is the vestigial salt, and the stored key was used directly.
      const [, iv, encrypted] = parts;

      return this.decryptCbc(encrypted, CryptoJS.enc.Base64.parse(encryptionKey), iv);
    } catch (error) {
      console.error('Decryption error:', error);
      throw new Error('Failed to decrypt content. Wrong encryption key?');
    }
  }

  /**
   * AES-256-CBC decryption with validated padding. CryptoJS strips PKCS#7 without
   * checking it, which turns a wrong key into an empty string instead of an error.
   */
  private decryptCbc(encrypted: string, key: CryptoJS.lib.WordArray, iv: string): string {
    const decrypted = CryptoJS.AES.decrypt(encrypted, key, {
      iv: CryptoJS.enc.Base64.parse(iv),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.NoPadding
    });

    return this.stripPkcs7Padding(decrypted).toString(CryptoJS.enc.Utf8);
  }

  /**
   * Compare two base64 tags without an early exit, so the time taken does not
   * reveal how many leading bytes a forged tag got right. Length is not secret:
   * both are always a base64 SHA-256.
   */
  private constantTimeEquals(a: string, b: string): boolean {
    if (a.length !== b.length) return false;

    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return diff === 0;
  }

  // ===== Helper Methods =====

  /**
   * Remove and validate PKCS#7 padding.
   * Invalid padding means the ciphertext was decrypted with the wrong key or
   * was corrupted, so it must surface as an error instead of empty content.
   */
  private stripPkcs7Padding(data: CryptoJS.lib.WordArray): CryptoJS.lib.WordArray {
    const BLOCK_SIZE = 16;
    const { sigBytes } = data;

    if (sigBytes <= 0 || sigBytes % BLOCK_SIZE !== 0) {
      throw new Error('Invalid block size');
    }

    const byteAt = (index: number) => (data.words[index >>> 2] >>> (24 - (index % 4) * 8)) & 0xff;
    const padLength = byteAt(sigBytes - 1);

    if (padLength < 1 || padLength > BLOCK_SIZE) {
      throw new Error('Invalid padding');
    }

    for (let i = sigBytes - padLength; i < sigBytes; i++) {
      if (byteAt(i) !== padLength) {
        throw new Error('Invalid padding');
      }
    }

    return CryptoJS.lib.WordArray.create(data.words.slice(), sigBytes - padLength);
  }

  private arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
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
