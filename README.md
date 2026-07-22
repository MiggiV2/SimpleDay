# SimpleDay - Minimalist Diary

<p align="center">
  <img src="https://img.shields.io/badge/Made%20with-Expo-blue?style=for-the-badge&logo=expo" alt="Expo">
  <img src="https://img.shields.io/badge/React%20Native-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React Native">
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Markdown-000000?style=for-the-badge&logo=markdown&logoColor=white" alt="Markdown">
</p>

A minimalistic diary app with Markdown support and WebDAV cloud sync.

### Key Features

- **Markdown** - write entries with formatting, lists, headers
- **WebDAV Sync** - automatic backup to your own cloud (Nextcloud, ownCloud, etc.)
- **Privacy First** - data stays on your device and your cloud, no tracking
- **App Lock** - biometrics (fingerprint/Face ID) or device PIN
- **Cross-Platform** - iOS, Android, Web
- **One Entry Per Day** - simple, focused journaling model
- **Live Preview** - toggle between edit and preview mode
- **Auto-Save**
- **Smart Import** - imports existing WebDAV entries on first launch

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
- [Expo CLI](https://docs.expo.dev/get-started/installation/)

### Installation

```bash
# Clone the repository
git clone https://github.com/MiggiV2/SimpleDay.git

# Navigate to project directory
cd SimpleDay

# Install dependencies
npm install

# Start the development server
npm start
```

### Run on Your Device

- **iOS**: Press `i` or scan QR code with Camera app
- **Android**: Press `a` or scan QR code with Expo Go app
- **Web**: Press `w` to open in browser

---

## Building a Release APK

SimpleDay ships to [IzzyOnDroid](https://apt.izzysoft.de/fdroid/) (an F-Droid-compatible repo), so release APKs must be reproducible, signed with the real release key, and buildable without any cloud service. Release builds are produced **locally and offline** with `./build-offline.sh` — no EAS or other cloud build service needed.

```bash
./build-offline.sh
```

The script runs `expo prebuild`, injects the release signing config into the generated Gradle project, writes `android/local.properties`, then runs `gradlew assembleRelease`. The finished APK is copied to `simpleday-release.apk` in the repo root.

### Additional Prerequisites

On top of the usual Node/npm setup above, a release build needs:

- **JDK 17 or 21** — the repo pins JDK 21 via jenv (`.java-version`); newer JDKs (e.g. 25) break the Gradle/Kotlin toolchain. The script aborts if the active JDK isn't 17 or 21.
- **Android SDK** — auto-detected from `$ANDROID_HOME`/`$ANDROID_SDK_ROOT` or `~/Android/Sdk`.
- **A release keystore + `keystore.properties`**:
  1. Generate the keystore **once** and keep it forever — losing it means you can never ship an update under the same app identity:
     ```bash
     keytool -genkeypair -v -keystore simpleday-release.keystore \
       -alias simpleday -keyalg RSA -keysize 2048 -validity 10000
     ```
  2. `cp keystore.properties.example keystore.properties` and fill in `storeFile` (absolute path), `storePassword`, `keyAlias`, and `keyPassword`.
  3. Both `simpleday-release.keystore` and `keystore.properties` are gitignored — never commit them.

The script refuses to produce a debug-signed release and verifies the final APK's signer isn't the Android debug key before handing it off.

---

## Cloud Sync with Nextcloud

### Setup

1. Open SimpleDay and go to Settings
2. Enable WebDAV Sync
3. Enter your Nextcloud credentials:
   ```
   URL: https://your-nextcloud.com/remote.php/dav/files/username/SimpleDay/
   Username: your-username
   Password: your-password or app-password
   ```
4. Click "Verify Connection" to test
5. Save Settings

> Tip: create an app-specific password in Nextcloud (Settings → Security) for better security.

SimpleDay works with any WebDAV-compatible server (Nextcloud, ownCloud, etc.).

---

## How to Use

### Creating an Entry

1. Tap the + button in the top right
2. Add a title
3. Write your thoughts in Markdown
4. Tap the checkmark to save

### Markdown Features

SimpleDay supports standard Markdown:

```markdown
# Big Header
## Medium Header

**Bold text**
*Italic text*

- Bullet points

1. Numbered lists

> Quotes

`Inline code`
```

### Viewing Entries

- Tap any entry to view or edit
- Toggle preview mode with the eye icon
- Delete entries with the trash icon

### Cloud Sync

- Auto-sync happens in the background when you save
- Import runs against existing entries when you first open the app
- Sync status is visible in Settings

---

## Privacy & Security

- **Local-first** - all data stored on your device
- **Encrypted passwords** - WebDAV credentials obfuscated
- **App Lock** - optional biometric/PIN gate (Face ID, fingerprint, or device passcode via `expo-local-authentication`) that locks the app on cold start and whenever it's backgrounded
  > Note: App Lock only gates the UI — it does **not** encrypt your diary entries at rest. For encryption, enable WebDAV backup encryption above.
- **No tracking** - zero analytics or data collection
- **Open source** - audit the code yourself
- **Your cloud, your data** - full control over backups

---

## Technical Details

### Built With

- **React Native** - cross-platform mobile framework
- **Expo** - development platform and tools
- **TypeScript**
- **Expo FileSystem** - local storage
- **Expo Router** - navigation
- **react-native-markdown-display** - Markdown rendering
- **expo-local-authentication** - biometric/PIN App Lock

### Storage

- **Local**: files stored in the app's private document directory
- **Format**: each entry is a `DATE_title.md` file
- **Cloud**: optional WebDAV sync for backup

### Architecture

```
SimpleDay/
├── Local Storage (Primary)
│   └── Instant read/write
│   └── Works offline
└── WebDAV Sync (Backup)
    └── Background upload on save
    └── Import on first launch
    └── Delete sync
```

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow the existing code style
- Write meaningful commit messages
- Test on both iOS and Android
- Update documentation for new features

---

## License

Copyright (C) 2026 Michael Hainz

SimpleDay is free software: you can redistribute it and/or modify it under the
terms of the GNU General Public License as published by the Free Software
Foundation, version 3.

This project is licensed under the GNU GPLv3 - see the [LICENSE](LICENSE) file for details.
