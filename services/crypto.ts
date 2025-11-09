// Simple XOR-based obfuscation for credentials
// Note: This is NOT strong encryption, but provides basic obfuscation
// For production, use expo-crypto or expo-secure-store with native builds

class SimpleCrypto {
  // Simple key derivation from device-specific string
  private key: string;

  constructor() {
    // In production, this should be device-specific or user-specific
    // For now, using a static key (better than plain text)
    this.key = 'SimpleDay-2024-Secure-Key-XOR';
  }

  // XOR-based obfuscation
  private xorCipher(input: string, key: string): string {
    let output = '';
    for (let i = 0; i < input.length; i++) {
      const charCode = input.charCodeAt(i) ^ key.charCodeAt(i % key.length);
      output += String.fromCharCode(charCode);
    }
    return output;
  }

  // Convert to base64 for safe storage
  encrypt(plaintext: string): string {
    try {
      const encrypted = this.xorCipher(plaintext, this.key);
      return btoa(encrypted);
    } catch (error) {
      console.error('Encryption error:', error);
      return plaintext; // Fallback to plaintext
    }
  }

  decrypt(ciphertext: string): string {
    try {
      const decoded = atob(ciphertext);
      return this.xorCipher(decoded, this.key);
    } catch (error) {
      console.error('Decryption error:', error);
      return ciphertext; // Fallback to ciphertext
    }
  }
}

export const crypto = new SimpleCrypto();
