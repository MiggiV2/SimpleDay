// SPDX-License-Identifier: GPL-3.0-only
// Guards the Android manifest surface that `expo prebuild` derives from app.json.
// Third-party modules merge their own <uses-permission> entries into the release
// manifest; anything the app does not actually use has to be listed in
// `android.blockedPermissions` or it ends up in the shipped APK and shows up in
// F-Droid's permission list.

import appJson from '../app.json';

const android = appJson.expo.android as {
  blockedPermissions?: string[];
  versionCode: number;
};

describe('android manifest configuration', () => {
  const blocked = android.blockedPermissions ?? [];

  it('blocks SYSTEM_ALERT_WINDOW leaked by the React Native debug manifest', () => {
    // react-native/ReactAndroid/src/debug/AndroidManifest.xml declares it for the
    // dev overlay; the merger pulls it into release builds too. The app never
    // draws over other apps.
    expect(blocked).toContain('android.permission.SYSTEM_ALERT_WINDOW');
  });

  it('blocks the external storage permissions declared by expo-file-system', () => {
    // Every diary/settings path goes through `Paths.document`, which is the
    // app-private internal directory and needs no permission on any API level.
    // expo-file-system declares these unconditionally for apps that do touch
    // shared storage.
    expect(blocked).toContain('android.permission.READ_EXTERNAL_STORAGE');
    expect(blocked).toContain('android.permission.WRITE_EXTERNAL_STORAGE');
  });

  it('keeps the permissions the app genuinely needs', () => {
    // Regression guard: blocking these would break notifications or biometrics.
    expect(blocked).not.toContain('android.permission.POST_NOTIFICATIONS');
    expect(blocked).not.toContain('android.permission.USE_BIOMETRIC');
    expect(blocked).not.toContain('android.permission.RECEIVE_BOOT_COMPLETED');
  });
});
