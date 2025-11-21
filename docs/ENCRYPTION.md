# WebDAV Encryption Feature

## Overview

SimpleDay now supports **AES-256-CBC encryption** for your diary entries when syncing to WebDAV. This ensures your private thoughts remain secure even if your WebDAV server is compromised.

## Features

### 🔐 Strong Encryption
- **Algorithm**: AES-256-CBC (Advanced Encryption Standard, 256-bit key)
- **Key Size**: 256 bits (32 bytes) - Industry standard for strong encryption
- **IV**: Random 16-byte initialization vector for each encryption
- **Salt**: Random 16-byte salt for additional security

### 🔑 Encryption Key Management
- **Automatic Generation**: Secure random key generation using `expo-crypto`
- **User-Friendly Display**: Keys are shown in base64 format for easy copying
- **Secure Storage**: Encryption keys stored in platform secure storage (iOS Keychain, Android Keystore)
- **Hardware Protection**: Keys protected by device hardware security on supported devices
- **Backup Reminder**: The app prompts you to save your encryption key

### 🛡️ Security Properties
- **End-to-End**: Encryption happens on your device before upload
- **Zero-Knowledge**: Your WebDAV server only stores encrypted data
- **No Server Access**: The encryption key never leaves your device
- **File Format**: Encrypted files use `.md.enc` extension on WebDAV

## How It Works

### Encryption Process
1. User writes a diary entry
2. Entry is saved locally as plain text
3. When syncing to WebDAV with encryption enabled:
   - Random IV (16 bytes) is generated
   - Random salt (16 bytes) is generated
   - Content is encrypted using AES-256-CBC
   - Format: `salt:iv:ciphertext` (all base64-encoded)
   - Encrypted file is uploaded with `.enc` extension

### Decryption Process
1. Encrypted file is downloaded from WebDAV
2. Format is parsed: `salt:iv:ciphertext`
3. Content is decrypted using stored encryption key
4. Decrypted content is saved locally as plain text

## User Guide

### Setting Up Encryption

1. **Navigate to Settings** → WebDAV Sync section
2. **Enable WebDAV Sync** (if not already enabled)
3. **Enable WebDAV Encryption** toggle
4. **Generate Encryption Key**:
   - Tap "Generate Encryption Key" button
   - A secure 256-bit key is automatically generated
   - Modal displays your encryption key
5. **Save Your Key**:
   - Copy the key to a secure location (password manager recommended)
   - Store it safely - you'll need it if you reinstall the app
   - Confirm you've saved it by tapping "I've Saved It"

### Managing Your Encryption Key

- **View Key**: Tap the eye icon to show/hide your key
- **Copy Key**: Tap the copy icon to copy to clipboard
- **Warning**: Never share your encryption key with anyone

### Disabling Encryption

1. Toggle "Enable WebDAV Encryption" off
2. Confirm the warning dialog
3. **Important**: 
   - Future uploads will be unencrypted
   - Existing encrypted files remain encrypted on WebDAV
   - You can still download and decrypt existing encrypted files

## Technical Details

### Encryption Scheme

```
Algorithm: AES-256-CBC
Key Size: 256 bits (32 bytes)
IV Size: 128 bits (16 bytes)
Salt Size: 128 bits (16 bytes)
Output Format: base64(salt):base64(iv):base64(ciphertext)
```

### Key Generation

```typescript
// Uses expo-crypto for cryptographically secure random generation
const randomBytes = await ExpoCrypto.getRandomBytesAsync(32); // 256 bits
const encryptionKey = base64Encode(randomBytes);
```

### File Naming

- **Unencrypted**: `2024-11-13_My_Diary_Entry.md`
- **Encrypted**: `2024-11-13_My_Diary_Entry.md.enc`

### Storage Locations

- **Local**: Plain text in app's document directory
- **WebDAV (Unencrypted)**: `.md` files
- **WebDAV (Encrypted)**: `.md.enc` files
- **Encryption Key**: Stored in platform secure storage (iOS Keychain / Android Keystore)
- **WebDAV Credentials**: Stored in platform secure storage (iOS Keychain / Android Keystore)

## Security Considerations

### ✅ What's Protected
- Diary content on WebDAV server
- Content during transmission (combined with HTTPS)
- Content at rest on untrusted servers

### ⚠️ What's NOT Protected
- Local content on your device (stored as plain text)
- Metadata (filenames, file sizes, modification dates)
- WebDAV server access logs
- Your device if physically compromised

### Best Practices

1. **Use HTTPS**: Always use HTTPS URLs for WebDAV (e.g., `https://example.com/webdav`)
2. **Strong WebDAV Password**: Use a strong, unique password for WebDAV access
3. **Backup Your Key**: Store encryption key in a secure password manager
4. **Device Security**: Use device lock screen and biometric authentication
5. **Regular Backups**: Keep multiple backups of your encryption key

## Troubleshooting

### "Failed to decrypt content" Error
- **Cause**: Wrong encryption key
- **Solution**: Ensure you're using the correct encryption key
- **Recovery**: If key is lost, encrypted backups cannot be recovered

### Files Not Syncing After Enabling Encryption
- **Cause**: Normal behavior - existing unencrypted files remain unencrypted
- **Solution**: They will upload as `.md.enc` on next modification

### Switching Between Encrypted/Unencrypted
- **Not Recommended**: Mixing encrypted and unencrypted files can cause confusion
- **Best Practice**: Choose one mode and stick with it

## Migration Scenarios

### From Unencrypted to Encrypted
1. Enable encryption and generate key
2. Save your encryption key securely
3. Existing files on WebDAV remain unencrypted
4. New/modified entries will be uploaded encrypted
5. Both encrypted and unencrypted files will be downloaded

### From Encrypted to Unencrypted
1. Disable encryption
2. New uploads will be unencrypted
3. Encrypted files on WebDAV remain encrypted
4. You can still download encrypted files if key is available

## FAQ

**Q: What happens if I lose my encryption key?**
A: Encrypted backups cannot be recovered. Always backup your key in a secure location.

**Q: Can I use the same encryption key on multiple devices?**
A: Yes, but you'll need to manually enter the key on each device.

**Q: Is my encryption key sent to the WebDAV server?**
A: No, the encryption key never leaves your device.

**Q: Can someone decrypt my files if they access my WebDAV server?**
A: No, without your encryption key, the files are secure.

**Q: Why AES-256-CBC instead of AES-256-GCM?**
A: CBC mode with random IVs provides strong encryption. GCM would add authenticated encryption but requires different crypto libraries.

**Q: How are my passwords and keys protected?**
A: They're stored in platform secure storage: iOS Keychain (hardware-backed) and Android Keystore (encrypted by OS). Not accessible via file system.

## Implementation Details

### Libraries Used
- `expo-crypto`: Secure random number generation
- `crypto-js`: AES-256-CBC encryption/decryption
- `expo-secure-store`: Platform secure storage (iOS Keychain, Android Keystore)
- Native platform crypto APIs under the hood

### Code Location
- **Encryption Service**: `services/crypto.ts`
- **WebDAV Integration**: `services/webdav.ts`
- **UI Component**: `components/EncryptionKeyManager.tsx`
- **Settings Screen**: `app/(tabs)/settings.tsx`

## Future Enhancements

Potential improvements for future versions:
- [ ] PBKDF2 key derivation for password-based encryption
- [ ] Encrypted local storage option
- [ ] Multi-device key sync via QR codes
- [ ] Hardware-backed keystore integration
- [ ] Encrypted metadata (filenames)
- [ ] Key rotation support
