# ✨ SimpleDay - Your Personal Minimalist Diary

<p align="center">
  <img src="https://img.shields.io/badge/Made%20with-Expo-blue?style=for-the-badge&logo=expo" alt="Expo">
  <img src="https://img.shields.io/badge/React%20Native-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React Native">
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Markdown-000000?style=for-the-badge&logo=markdown&logoColor=white" alt="Markdown">
</p>

<p align="center">
  <strong>A beautiful, minimalistic diary app with Markdown support and cloud sync</strong>
</p>

---

## 🌟 Why SimpleDay?

In a world of complex productivity apps, **SimpleDay** brings you back to the simple joy of journaling. Write your thoughts, experiences, and memories in beautiful Markdown, with the peace of mind that your entries are securely backed up.

### ✨ Key Features

- 📝 **Markdown Support** - Write with formatting, lists, headers, and more
- 🎨 **Minimalist Design** - Clean, distraction-free interface
- ☁️ **WebDAV Sync** - Automatic backup to your own cloud (Nextcloud, ownCloud, etc.)
- 🔒 **Privacy First** - Your data stays on your device and your cloud
- 🔐 **App Lock** - Protect the app with biometrics (fingerprint/Face ID) or your device PIN
- 📱 **Cross-Platform** - Works on iOS, Android, and Web
- 🌓 **One Entry Per Day** - Simple, focused approach to journaling
- ✏️ **Live Preview** - Toggle between edit and preview mode
- 💾 **Auto-Save** - Never lose your thoughts
- 🔄 **Smart Import** - Import existing entries from WebDAV on first launch

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
- [Expo CLI](https://docs.expo.dev/get-started/installation/)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/simpleday.git

# Navigate to project directory
cd simpleday

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

## 📦 Building a Release APK

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

## ☁️ Cloud Sync with Nextcloud

SimpleDay works perfectly with **Nextcloud** using WebDAV sync!

### Setup with Nextcloud

1. **Open SimpleDay** and go to Settings ⚙️
2. **Enable WebDAV Sync**
3. **Enter your Nextcloud credentials**:
   ```
   URL: https://your-nextcloud.com/remote.php/dav/files/username/SimpleDay/
   Username: your-username
   Password: your-password or app-password
   ```
4. **Click "Verify Connection"** to test
5. **Save Settings** ✅

> 💡 **Pro Tip**: Create an app-specific password in Nextcloud (Settings → Security) for better security!

### Other WebDAV Services

SimpleDay works with any WebDAV-compatible service:

- ✅ **Nextcloud** - Perfect for self-hosted privacy
- ✅ **ownCloud** - Another great self-hosted option
- ✅ **Box.com** - WebDAV support available
- ✅ **4shared** - Free WebDAV storage
- ✅ **Any WebDAV server** - Full standard support

---

## 📖 How to Use

### Creating Your First Entry

1. **Tap the + button** in the top right
2. **Add a title** for your entry
3. **Write your thoughts** in Markdown
4. **Tap the checkmark** to save

### Markdown Features

SimpleDay supports all standard Markdown:

```markdown
# Big Header
## Medium Header
### Small Header

**Bold text**
*Italic text*

- Bullet points
- Make lists easy

1. Numbered lists
2. Keep things organized

> Quotes for inspiration

`Inline code` for technical notes
```

### Viewing Entries

- **Tap any entry** to view or edit
- **Toggle preview mode** with the eye icon
- **Delete entries** with the trash icon

### Cloud Sync

- **Auto-sync** happens in the background when you save
- **Import** existing entries when you first open the app
- **Check sync status** in Settings

---

## 🎯 Use Cases

### 📓 Personal Journaling
Keep a daily log of your thoughts, feelings, and experiences.

### 🎓 Learning Notes
Document what you learn each day with Markdown formatting.

### 💡 Idea Collection
Capture ideas and insights as they come to you.

### 🌍 Travel Diary
Record your adventures with dates and locations.

### 🧘 Gratitude Journal
Write what you're grateful for every day.

### 📊 Work Log
Track daily accomplishments and tasks.

---

## 🔒 Privacy & Security

- ✅ **Local-first** - All data stored on your device
- ✅ **Encrypted passwords** - WebDAV credentials obfuscated
- ✅ **App Lock** - Optional biometric/PIN gate (Face ID, fingerprint, or device passcode via `expo-local-authentication`) that locks the app on cold start and whenever it's backgrounded
  > ⚠️ Note: App Lock only gates the UI — it does **not** encrypt your diary entries at rest. For encryption, enable WebDAV backup encryption above.
- ✅ **No tracking** - Zero analytics or data collection
- ✅ **Open source** - Audit the code yourself
- ✅ **Your cloud, your data** - Full control over backups

---

## 🛠️ Technical Details

### Built With

- **React Native** - Cross-platform mobile framework
- **Expo** - Development platform and tools
- **TypeScript** - Type-safe JavaScript
- **Expo FileSystem** - Local storage
- **Expo Router** - Navigation
- **react-native-markdown-display** - Beautiful Markdown rendering
- **expo-local-authentication** - Biometric/PIN App Lock

### Storage

- **Local**: Files stored in app's private document directory
- **Format**: Each entry is a `DATE_title.md` file
- **Cloud**: Optional WebDAV sync for backup

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

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Commit your changes** (`git commit -m 'Add some amazing feature'`)
4. **Push to the branch** (`git push origin feature/amazing-feature`)
5. **Open a Pull Request**

### Development Guidelines

- Follow the existing code style
- Write meaningful commit messages
- Test on both iOS and Android
- Update documentation for new features

---

## 📄 License

Copyright (C) 2026 Michael Hainz

SimpleDay is free software: you can redistribute it and/or modify it under the
terms of the GNU General Public License as published by the Free Software
Foundation, version 3.

This project is licensed under the GNU GPLv3 - see the [LICENSE](LICENSE) file for details.

---

## 💖 Acknowledgments

- Inspired by the simplicity of journaling with pen and paper
- Built with love for the privacy-conscious community
- Thanks to all contributors and users!

---

<p align="center">
  Made with ❤️ for people who value simplicity and privacy
</p>

<p align="center">
  <strong>Start journaling today. It's that simple.</strong>
</p>

---

## 🌟 Star History

If you find SimpleDay useful, please consider giving it a star ⭐

<p align="center">
  <strong>SimpleDay</strong> - Write. Sync. Reflect.
</p>
