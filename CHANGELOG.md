# Changelog

All notable changes to SimpleDay will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.1] - 2026-08-01

### Fixed
- The universal APK attached to the GitHub releases crashed on startup on x86_64
  devices and emulators, right after the splash screen. Since 1.2.2 the release
  build is split per ABI, and the split filter also narrowed the native build to
  the two arm architectures — but the universal APK still packaged the x86 and
  x86_64 libraries that ship prebuilt inside the AARs. Those directories held
  `libhermes.so` and `libreactnative.so` but no `libappmodules.so`, so the app
  installed and then died in TurboModule init. The build now pins
  `ndk.abiFilters` to the ABIs it compiles, so packaging can no longer outrun the
  build, and it refuses to finish if an APK contains an ABI without its compiled
  libraries. The per-ABI arm APKs — the ones F-Droid builds and ships — were never
  affected.

### Added
- An x86_64 APK is built and published alongside the two arm ones, so the app can
  be run in an emulator.

## [1.3.0] - 2026-07-31

### Fixed
- A day could end up with two entries: with today's entry already saved, the `+`
  button still opened an empty editor for the same date. Both entry points — the
  button and the daily reminder notification — now reopen the existing entry,
  ready to edit. Tapping an entry in the list still opens it read-only.
  Duplicates an older version created are left untouched and stay readable; the
  day reopens whichever file was written first.

- WebDAV sync over plain `http://` could not work at all. With `targetSdk 36` and
  no cleartext policy in the manifest, Android blocked the connection before it
  left the device, and `fetch` reported it as a generic "Network request failed" —
  so the dialog blamed the URL and credentials. Self-hosted servers on a LAN are
  reachable again, and the failure now names cleartext as the cause when it is.
- Entries started between midnight and the UTC offset were filed under the
  previous day, because the date came from `toISOString()`. Dates are now taken
  in the device's timezone, both when creating an entry and when displaying one.

### Security
- WebDAV entries are now authenticated with HMAC-SHA256 over the ciphertext
  (encrypt-then-MAC), using a key derived separately from the encryption key. A
  malicious or compromised WebDAV server could previously alter stored entries;
  only PKCS#7 padding stood in the way, which lets most tampering through.
  Existing entries stay readable and are rewritten in the new format on save.
- Corrected the encryption documentation, which claimed "AES-256-CBC with
  PBKDF2". No KDF was ever involved — the stored key is already 256 random bits.
  The unused per-entry salt is no longer written.
- Entry contents are encrypted before upload, but WebDAV credentials travel in a
  Basic auth header. The settings screen now warns about this when the server URL
  is `http://`.

### Changed
- Removed 20 launcher-badge permissions (`com.sec.android.provider.badge.*`,
  `com.htc.launcher.*`, `com.sonyericsson.home.*`, `com.huawei.android.launcher.*`,
  `com.oppo.launcher.*`, `me.everything.badger.*` and others). They come from the
  ShortcutBadger AAR that `expo-notifications` depends on; SimpleDay never sets a
  badge.

## [1.2.2] - 2026-07-27

### Changed
- Removed three permissions the app never used: `SYSTEM_ALERT_WINDOW` ("draw over
  other apps") and read/write access to shared storage. They were merged in by the
  React Native and expo-file-system manifests; all diary data has always lived in
  app-private storage.

### Fixed
- F-Droid changelogs are now named after the per-ABI split versionCodes, so release
  notes actually show up on the app page.

## [1.2.1] - 2026-07-24

### Changed
- Added SPDX license headers (GPL-3.0-only) to all source files. No functional changes.

## [1.2.0] - 2026-07-22

### Added
- **App Lock**: Unlock the diary with biometrics (fingerprint/Face ID) or the device PIN

### Changed
- Improved storage of the end-to-end encryption key

## [1.1.0] - 2025-11-12

### Added
- **Startup Sync Check**: Automatically checks sync status when app starts with WebDAV enabled
- **Sync Status Dialog**: Smart prompt showing files that are out of sync (local-only vs remote-only)
- **Flexible Sync Options**: 
  - Upload local files to server
  - Download remote files to device
  - Sync both ways (bidirectional)
- **Batch Sync Operations**: Upload all local files or download all remote files
- **Progress Tracking**: Visual progress indicators for sync operations with file counts
- **Toast Notifications**: Non-intrusive success messages for sync operations

### Changed
- Improved sync error handling with detailed error messages
- Enhanced sync UI with modern card-based dialogs
- Updated WebDAV documentation with startup sync check details

### Fixed
- Better handling of sync conflicts and edge cases

## [1.0.0] - 2025-01-XX

### Added
- **Diary App**: Simple, elegant diary/journal application
- **Local-First Storage**: All entries stored locally using Expo FileSystem
- **Markdown Support**: Write entries with markdown formatting
- **WebDAV Sync**: Optional cloud sync via WebDAV
  - Enable/disable sync toggle
  - Connection verification
  - Automatic background sync after saving entries
  - Manual import from WebDAV
  - Secure password storage with XOR encryption
- **Daily Notifications**: Optional reminders to write diary entries
- **Entry Management**:
  - Create new entries
  - Edit existing entries
  - Date-based organization
  - Preview on list screen
- **Modern UI**:
  - Clean, minimal design
  - Dark mode support
  - Smooth animations
  - Progress indicators for imports
- **Settings Screen**:
  - WebDAV configuration
  - Notification settings
  - Last sync timestamp display

### Technical
- Built with Expo SDK 54
- React Native 0.81
- TypeScript support
- React Navigation 7
- Hermes JavaScript engine
- GPL v3 License
