// SPDX-License-Identifier: GPL-3.0-only
import * as SecureStore from 'expo-secure-store';
import { crypto } from '../services/crypto';

// Same constant the service uses for the deprecated XOR obfuscation.
const LEGACY_KEY = 'SimpleDay-2024-Secure-Key-XOR';

function legacyEncrypt(plaintext: string): string {
  let output = '';
  for (let i = 0; i < plaintext.length; i++) {
    output += String.fromCharCode(plaintext.charCodeAt(i) ^ LEGACY_KEY.charCodeAt(i % LEGACY_KEY.length));
  }
  return btoa(output);
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

describe('crypto: key generation', () => {
  it('generates a 256-bit base64 encryption key', async () => {
    const key = await crypto.generateEncryptionKey();

    expect(key).toMatch(BASE64);
    expect(atob(key)).toHaveLength(32);
  });

  it('generates a 12-word passphrase', async () => {
    const passphrase = await crypto.generatePassphrase();
    const words = passphrase.split(' ');

    expect(words).toHaveLength(12);
    expect(words.every(word => /^[a-z]+$/.test(word))).toBe(true);
  });
});

describe('crypto: AES-256-CBC content encryption', () => {
  it('round-trips content with the same key', async () => {
    const key = await crypto.generateEncryptionKey();
    const plaintext = '# Diary\n\nUmlaute: äöüß and emoji 🌱';

    const encrypted = await crypto.encryptContent(plaintext, key);

    expect(encrypted).not.toContain(plaintext);
    await expect(crypto.decryptContent(encrypted, key)).resolves.toBe(plaintext);
  });

  it('produces the salt:iv:ciphertext envelope', async () => {
    const key = await crypto.generateEncryptionKey();

    const parts = (await crypto.encryptContent('hello', key)).split(':');

    expect(parts).toHaveLength(3);
    expect(atob(parts[0])).toHaveLength(16); // salt
    expect(atob(parts[1])).toHaveLength(16); // IV
    expect(parts[2]).toMatch(BASE64);
  });

  it('rejects a payload that is not in the envelope format', async () => {
    const key = await crypto.generateEncryptionKey();

    await expect(crypto.decryptContent('not-encrypted', key)).rejects.toThrow(
      'Failed to decrypt content'
    );
  });

  it('rejects instead of returning empty content when the key is wrong', async () => {
    const key = await crypto.generateEncryptionKey();
    const wrongKey = btoa('x'.repeat(32));
    const encrypted = await crypto.encryptContent('top secret', key);

    await expect(crypto.decryptContent(encrypted, wrongKey)).rejects.toThrow(
      'Failed to decrypt content. Wrong encryption key?'
    );
  });

  it('rejects a tampered ciphertext', async () => {
    const key = await crypto.generateEncryptionKey();
    const [salt, iv, ciphertext] = (await crypto.encryptContent('top secret', key)).split(':');
    const tampered = `${salt}:${iv}:${btoa('garbage'.repeat(8))}`;

    await expect(crypto.decryptContent(tampered, key)).rejects.toThrow('Failed to decrypt content');
  });

  it('round-trips genuinely empty content', async () => {
    const key = await crypto.generateEncryptionKey();

    const encrypted = await crypto.encryptContent('', key);

    await expect(crypto.decryptContent(encrypted, key)).resolves.toBe('');
  });
});

describe('crypto: legacy XOR migration', () => {
  it('decrypts a legacy XOR-obfuscated password', () => {
    expect(crypto.decryptLegacy(legacyEncrypt('hunter2'))).toBe('hunter2');
  });

  it('returns the input unchanged when it is not legacy ciphertext', () => {
    expect(crypto.decryptLegacy('***not base64***')).toBe('***not base64***');
  });
});

describe('crypto: secure credential storage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stores, reads and deletes the WebDAV password', async () => {
    await crypto.storePassword('s3cret');
    await expect(crypto.getPassword()).resolves.toBe('s3cret');

    await crypto.deletePassword();
    await expect(crypto.getPassword()).resolves.toBeNull();
  });

  it('stores, reads and deletes the encryption key', async () => {
    await crypto.storeEncryptionKey('a-key');
    await expect(crypto.getEncryptionKey()).resolves.toBe('a-key');

    await crypto.deleteEncryptionKey();
    await expect(crypto.getEncryptionKey()).resolves.toBeNull();
  });

  it('keeps password and encryption key in separate keystore entries', async () => {
    await crypto.storePassword('pw');
    await crypto.storeEncryptionKey('key');

    const usedKeys = (SecureStore.setItemAsync as jest.Mock).mock.calls.map(call => call[0]);
    expect(new Set(usedKeys).size).toBe(2);
  });

  it('returns null instead of throwing when the keystore read fails', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keystore locked'));

    await expect(crypto.getPassword()).resolves.toBeNull();
  });

  it('throws a wrapped error when the keystore write fails', async () => {
    (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keystore locked'));

    await expect(crypto.storePassword('pw')).rejects.toThrow('Failed to securely store password');
  });
});
