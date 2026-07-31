// SPDX-License-Identifier: GPL-3.0-only
// Guards the Android manifest surface that `expo prebuild` derives from app.json.
// Third-party modules merge their own <uses-permission> entries into the release
// manifest; anything the app does not actually use has to be listed in
// `android.blockedPermissions` or it ends up in the shipped APK and shows up in
// F-Droid's permission list.

import fs from 'fs';
import path from 'path';

import appJson from '../app.json';

const android = appJson.expo.android as {
  blockedPermissions?: string[];
  versionCode: number;
};

/** Every `<uses-permission>` in ShortcutBadger 1.1.22's AndroidManifest.xml. */
const BADGE_PERMISSIONS = [
  'android.permission.READ_APP_BADGE',
  'com.anddoes.launcher.permission.UPDATE_COUNT',
  'com.android.launcher.permission.INSTALL_SHORTCUT',
  'com.android.launcher.permission.READ_SETTINGS',
  'com.android.launcher.permission.UNINSTALL_SHORTCUT',
  'com.android.launcher.permission.WRITE_SETTINGS',
  'com.htc.launcher.permission.READ_SETTINGS',
  'com.htc.launcher.permission.UPDATE_SHORTCUT',
  'com.huawei.android.launcher.permission.CHANGE_BADGE',
  'com.huawei.android.launcher.permission.READ_SETTINGS',
  'com.huawei.android.launcher.permission.WRITE_SETTINGS',
  'com.majeur.launcher.permission.UPDATE_BADGE',
  'com.oppo.launcher.permission.READ_SETTINGS',
  'com.oppo.launcher.permission.WRITE_SETTINGS',
  'com.sec.android.provider.badge.permission.READ',
  'com.sec.android.provider.badge.permission.WRITE',
  'com.sonyericsson.home.permission.BROADCAST_BADGE',
  'com.sonymobile.home.permission.PROVIDER_INSERT_BADGE',
  'me.everything.badger.permission.BADGE_COUNT_READ',
  'me.everything.badger.permission.BADGE_COUNT_WRITE',
];

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

  it('blocks every launcher-badge permission ShortcutBadger declares', () => {
    // `me.leolin:ShortcutBadger:1.1.22@aar`, pulled in by expo-notifications
    // (its android/build.gradle), declares one permission per launcher vendor it
    // knows how to poke. SimpleDay never sets a badge — the notification handler
    // returns `shouldSetBadge: false` — so all of them are dead weight, and
    // F-Droid renders them as a wall of scary vendor permissions on the app page.
    // Sourced from the AAR's own AndroidManifest.xml, not from the merged output,
    // so a ShortcutBadger bump that adds a vendor makes this list stale rather
    // than silently shipping a new permission.
    expect(blocked).toEqual(expect.arrayContaining(BADGE_PERMISSIONS));
  });

  it('keeps the permissions the app genuinely needs', () => {
    // Regression guard: blocking these would break notifications or biometrics.
    expect(blocked).not.toContain('android.permission.POST_NOTIFICATIONS');
    expect(blocked).not.toContain('android.permission.USE_BIOMETRIC');
    expect(blocked).not.toContain('android.permission.RECEIVE_BOOT_COMPLETED');
  });

  it('ships a changelog for every versionCode F-Droid builds', () => {
    // The recipe splits per ABI via `VercodeOperation: 1000 * %c + N`, so
    // fdroidserver looks for `<base * 1000 + N>.txt`, not `<base>.txt`.
    const dir = path.join(__dirname, '..', 'fastlane/metadata/android/en-US/changelogs');
    for (const abiCode of [1, 2]) {
      expect(fs.existsSync(path.join(dir, `${android.versionCode * 1000 + abiCode}.txt`))).toBe(
        true
      );
    }
  });
});
