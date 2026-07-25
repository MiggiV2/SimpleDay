// SPDX-License-Identifier: GPL-3.0-only
import * as LocalAuthentication from 'expo-local-authentication';
import { appLock } from '../services/appLock';
import { storage } from '../services/storage';

jest.mock('../services/storage', () => {
  const items: Record<string, string> = {};
  return {
    storage: {
      getItem: jest.fn(async (key: string) => items[key] ?? null),
      setItem: jest.fn(async (key: string, value: string) => {
        items[key] = value;
      }),
      removeItem: jest.fn(async (key: string) => {
        delete items[key];
      }),
    },
  };
});

describe('appLock: enabled flag', () => {
  it('is disabled when nothing was stored yet', async () => {
    await expect(appLock.isEnabled()).resolves.toBe(false);
  });

  it('persists the flag as a string under app_lock_enabled', async () => {
    await appLock.setEnabled(true);

    expect(storage.setItem).toHaveBeenCalledWith('app_lock_enabled', 'true');
    await expect(appLock.isEnabled()).resolves.toBe(true);

    await appLock.setEnabled(false);
    await expect(appLock.isEnabled()).resolves.toBe(false);
  });
});

describe('appLock: availability', () => {
  afterEach(() => {
    (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
    (LocalAuthentication.getEnrolledLevelAsync as jest.Mock).mockResolvedValue(
      LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG
    );
  });

  it('is available with hardware and an enrolled security level', async () => {
    await expect(appLock.isAvailable()).resolves.toBe(true);
  });

  it('is unavailable without authentication hardware', async () => {
    (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(false);

    await expect(appLock.isAvailable()).resolves.toBe(false);
  });

  it('is unavailable when no PIN or biometric is enrolled', async () => {
    (LocalAuthentication.getEnrolledLevelAsync as jest.Mock).mockResolvedValue(
      LocalAuthentication.SecurityLevel.NONE
    );

    await expect(appLock.isAvailable()).resolves.toBe(false);
  });
});

describe('appLock: authentication', () => {
  it('reports success from the platform prompt', async () => {
    (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({ success: true });

    await expect(appLock.authenticate()).resolves.toBe(true);
  });

  it('reports a cancelled prompt as failure', async () => {
    (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({
      success: false,
      error: 'user_cancel',
    });

    await expect(appLock.authenticate()).resolves.toBe(false);
  });

  it('does not propagate platform errors', async () => {
    (LocalAuthentication.authenticateAsync as jest.Mock).mockRejectedValue(new Error('no keyguard'));

    await expect(appLock.authenticate()).resolves.toBe(false);
  });
});
