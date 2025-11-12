# Building the App with Notifications Support

## The Issue

The error `Cannot find native module 'ExpoPushTokenManager'` occurs because:
- `expo-notifications` requires native modules
- The app needs to be rebuilt as a **development build** or **production build**
- You cannot use `expo start` (Expo Go) for this feature

## Solution: Build the App

### Option 1: Local Development Build (Recommended for Testing)

**For Android:**
```bash
# Make sure you have Android SDK installed
npx expo run:android
```

**For iOS:**
```bash
# Requires macOS with Xcode
npx expo run:ios
```

This will:
1. Generate native Android/iOS projects
2. Install the native modules
3. Build and run the app on emulator/device

### Option 2: EAS Build (Recommended for Production)

**Prerequisites:**
```bash
# Install EAS CLI if not already installed
npm install -g eas-cli

# Login to Expo account
eas login
```

**Build for Android:**
```bash
# Development build (for testing)
eas build --profile development --platform android

# Production build (for release)
eas build --profile production --platform android
```

**Build for iOS:**
```bash
# Development build
eas build --profile development --platform ios

# Production build
eas build --profile production --platform ios
```

### Option 3: Quick Test Build

If you just want to test quickly:

```bash
# Create a development build APK for Android
eas build --profile development --platform android --local

# Or use the existing build command if you have it set up
npm run android
```

## After Building

Once the app is built and installed:

1. Open the app
2. Go to Settings tab
3. Enable "Daily Reminder"
4. Select a time
5. Tap "Save Settings"
6. Grant notification permissions when prompted

## Troubleshooting

### "Cannot find native module" Error
- **Cause**: Using Expo Go instead of a development build
- **Solution**: Build the app using one of the methods above

### Build Fails
```bash
# Clear cache and retry
npx expo start -c
rm -rf node_modules
npm install
npx expo run:android
```

### Permission Issues on Android
- Android 13+ requires explicit notification permissions
- The app will request this automatically when you enable notifications

### Notifications Not Appearing
1. Check device notification settings for the app
2. Verify notification permission is granted
3. Check scheduled notifications:
   ```typescript
   import { notificationService } from './services/notifications';
   const scheduled = await notificationService.getAllScheduledNotifications();
   console.log(scheduled);
   ```

## Why Expo Go Doesn't Work

Expo Go is a sandbox app that includes common Expo packages, but:
- It doesn't include all native modules
- `expo-notifications` requires native code that's not in Expo Go
- You must create a custom development build or production build

## Current Build Status

Based on the APK files in your directory:
- `build-1762695709443.apk`
- `build-1762704163284.apk`
- `build-1762712949734.apk`

These were built BEFORE the notification feature was added. You need to create a new build that includes the notification changes.

## Quick Start Command

```bash
# The easiest way to build and test:
npx expo run:android

# This will:
# 1. Install dependencies
# 2. Generate native code
# 3. Build the app
# 4. Install on connected device/emulator
# 5. Start the development server
```

## Alternative: Install Existing APK

If you want to quickly test on a device without rebuilding:

```bash
# Create a new production build
eas build --platform android --profile production

# Download the APK and install it on your device
```

The APK will be available in your EAS dashboard or via the link provided after build completes.
