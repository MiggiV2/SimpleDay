// SPDX-License-Identifier: GPL-3.0-only
import * as LocalAuthentication from 'expo-local-authentication';
import { appLock, describeLockDelay, LOCK_DELAY_OPTIONS } from '../services/appLock';
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

describe('appLock: lock delay', () => {
  afterEach(async () => {
    await storage.removeItem('app_lock_delay_ms');
  });

  it('waits five minutes before locking until configured otherwise', async () => {
    await expect(appLock.getLockDelayMs()).resolves.toBe(5 * 60 * 1000);
  });

  it('persists a custom delay', async () => {
    await appLock.setLockDelayMs(60_000);

    expect(storage.setItem).toHaveBeenCalledWith('app_lock_delay_ms', '60000');
    await expect(appLock.getLockDelayMs()).resolves.toBe(60_000);
  });

  it('falls back to the default when the stored value is not a number', async () => {
    await storage.setItem('app_lock_delay_ms', 'soon');

    await expect(appLock.getLockDelayMs()).resolves.toBe(5 * 60 * 1000);
  });
});

describe('appLock: delay labels', () => {
  it('calls a zero delay immediate rather than "0 min"', () => {
    expect(describeLockDelay(0)).toBe('Immediately');
  });

  it('labels the delays in whole minutes', () => {
    expect(describeLockDelay(60_000)).toBe('1 min');
    expect(describeLockDelay(15 * 60 * 1000)).toBe('15 min');
  });

  it('labels every option the settings screen offers', () => {
    expect(LOCK_DELAY_OPTIONS.map(describeLockDelay)).toEqual([
      'Immediately',
      '1 min',
      '5 min',
      '15 min',
    ]);
  });
});

describe('appLock: re-locking after a short trip to another app', () => {
  beforeEach(async () => {
    await appLock.setEnabled(true);
  });

  afterEach(async () => {
    await appLock.setEnabled(false);
    await storage.removeItem('app_lock_delay_ms');
  });

  it('keeps the app open when the user comes back within the delay', async () => {
    await expect(appLock.shouldLock(1_000, 1_000 + 4 * 60 * 1000)).resolves.toBe(false);
  });

  it('locks once the delay has passed', async () => {
    await expect(appLock.shouldLock(1_000, 1_000 + 5 * 60 * 1000)).resolves.toBe(true);
  });

  it('locks immediately when the delay is zero', async () => {
    await appLock.setLockDelayMs(0);

    await expect(appLock.shouldLock(1_000, 1_000)).resolves.toBe(true);
  });

  it('locks when the clock jumped backwards while the app was away', async () => {
    await expect(appLock.shouldLock(10_000, 1_000)).resolves.toBe(true);
  });

  it('never locks while the app lock is switched off', async () => {
    await appLock.setEnabled(false);

    await expect(appLock.shouldLock(0, Number.MAX_SAFE_INTEGER)).resolves.toBe(false);
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
