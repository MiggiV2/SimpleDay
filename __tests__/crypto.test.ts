// SPDX-License-Identifier: GPL-3.0-only
import * as SecureStore from 'expo-secure-store';
import CryptoJS from 'crypto-js';
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

/**
 * Reproduces exactly what versions up to 1.2.2 wrote: `salt:iv:ciphertext`,
 * AES-256-CBC with the stored key used directly, no MAC. The salt was random per
 * encryption and never fed into a KDF — it is dead weight in the envelope.
 * Kept here so the v1 read path is tested against the real legacy layout.
 */
function encryptV1(plaintext: string, encryptionKey: string): string {
  const salt = btoa('0123456789abcdef');
  const iv = btoa('fedcba9876543210');
  const encrypted = CryptoJS.AES.encrypt(plaintext, CryptoJS.enc.Base64.parse(encryptionKey), {
    iv: CryptoJS.enc.Base64.parse(iv),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  return `${salt}:${iv}:${encrypted.toString()}`;
}

describe('crypto: content encryption', () => {
  it('round-trips content with the same key', async () => {
    const key = await crypto.generateEncryptionKey();
    const plaintext = '# Diary\n\nUmlaute: äöüß and emoji 🌱';

    const encrypted = await crypto.encryptContent(plaintext, key);

    expect(encrypted).not.toContain(plaintext);
    await expect(crypto.decryptContent(encrypted, key)).resolves.toBe(plaintext);
  });

  it('produces the v2:iv:ciphertext:mac envelope', async () => {
    const key = await crypto.generateEncryptionKey();

    const parts = (await crypto.encryptContent('hello', key)).split(':');

    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe('v2');
    expect(atob(parts[1])).toHaveLength(16); // IV
    expect(parts[2]).toMatch(BASE64);
    expect(atob(parts[3])).toHaveLength(32); // HMAC-SHA256
  });

  it('no longer writes the unused PBKDF2 salt', async () => {
    const key = await crypto.generateEncryptionKey();

    await expect(crypto.encryptContent('hello', key)).resolves.toMatch(/^v2:/);
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
      'Failed to decrypt content'
    );
  });

  it('round-trips genuinely empty content', async () => {
    const key = await crypto.generateEncryptionKey();

    const encrypted = await crypto.encryptContent('', key);

    await expect(crypto.decryptContent(encrypted, key)).resolves.toBe('');
  });
});

describe('crypto: tamper detection', () => {
  // The threat these cover: the WebDAV server is not trusted. Without a MAC,
  // CBC lets whoever holds the file flip bits and the only thing standing in the
  // way is a 1-in-256 padding check.
  it('rejects a ciphertext whose bytes were changed', async () => {
    const key = await crypto.generateEncryptionKey();
    const [, iv, ct, mac] = (await crypto.encryptContent('top secret', key)).split(':');
    const flipped = btoa(atob(ct).slice(0, -1) + String.fromCharCode(atob(ct).charCodeAt(atob(ct).length - 1) ^ 0x01));

    await expect(crypto.decryptContent(`v2:${iv}:${flipped}:${mac}`, key)).rejects.toThrow(
      'Failed to decrypt content'
    );
  });

  it('rejects a changed IV, so the first block cannot be rewritten', async () => {
    const key = await crypto.generateEncryptionKey();
    const [, , ct, mac] = (await crypto.encryptContent('top secret', key)).split(':');
    const otherIv = btoa('0000000000000000');

    await expect(crypto.decryptContent(`v2:${otherIv}:${ct}:${mac}`, key)).rejects.toThrow(
      'Failed to decrypt content'
    );
  });

  it('rejects a replaced MAC', async () => {
    const key = await crypto.generateEncryptionKey();
    const [, iv, ct] = (await crypto.encryptContent('top secret', key)).split(':');
    const forged = btoa('z'.repeat(32));

    await expect(crypto.decryptContent(`v2:${iv}:${ct}:${forged}`, key)).rejects.toThrow(
      'Failed to decrypt content'
    );
  });

  it('rejects a v2 envelope with the MAC stripped off', async () => {
    const key = await crypto.generateEncryptionKey();
    const [, iv, ct] = (await crypto.encryptContent('top secret', key)).split(':');

    await expect(crypto.decryptContent(`v2:${iv}:${ct}`, key)).rejects.toThrow(
      'Failed to decrypt content'
    );
  });

  it('rejects a ciphertext swapped in from another entry under the same key', async () => {
    // The other tamper cases are also caught by the padding and UTF-8 checks, so
    // they do not prove the MAC does anything. This one does: both halves are
    // genuine output of this key, so B's ciphertext decrypts perfectly cleanly.
    // Only the tag ties a ciphertext to its envelope.
    const key = await crypto.generateEncryptionKey();
    const [, , ctA, macA] = (await crypto.encryptContent('entry A', key)).split(':');
    const [, ivB, ctB] = (await crypto.encryptContent('entry B, valid on its own', key)).split(':');

    expect(ctB).not.toBe(ctA);
    await expect(crypto.decryptContent(`v2:${ivB}:${ctB}:${macA}`, key)).rejects.toThrow(
      'Failed to decrypt content'
    );
  });

  it('does not accept a ciphertext resealed under a different key', async () => {
    const key = await crypto.generateEncryptionKey();
    const otherKey = btoa('y'.repeat(32));
    const foreign = await crypto.encryptContent('injected by the server', otherKey);

    await expect(crypto.decryptContent(foreign, key)).rejects.toThrow('Failed to decrypt content');
  });
});

describe('crypto: reading entries written by 1.2.2 and earlier', () => {
  it('decrypts a v1 salt:iv:ciphertext payload', async () => {
    const key = await crypto.generateEncryptionKey();
    const plaintext = '# Old entry\n\nWritten by 1.2.2.';

    await expect(crypto.decryptContent(encryptV1(plaintext, key), key)).resolves.toBe(plaintext);
  });

  it('still refuses a v1 payload under the wrong key', async () => {
    const key = await crypto.generateEncryptionKey();
    const wrongKey = btoa('x'.repeat(32));

    await expect(crypto.decryptContent(encryptV1('secret', key), wrongKey)).rejects.toThrow(
      'Failed to decrypt content'
    );
  });

  it('re-encrypting a v1 entry upgrades it to v2', async () => {
    const key = await crypto.generateEncryptionKey();
    const plaintext = 'migrate me';

    const upgraded = await crypto.encryptContent(
      await crypto.decryptContent(encryptV1(plaintext, key), key),
      key
    );

    expect(upgraded).toMatch(/^v2:/);
    await expect(crypto.decryptContent(upgraded, key)).resolves.toBe(plaintext);
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
