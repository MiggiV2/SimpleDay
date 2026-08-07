// SPDX-License-Identifier: GPL-3.0-only
// App lock service using device biometrics / PIN via expo-local-authentication
import * as LocalAuthentication from 'expo-local-authentication';
import { storage } from './storage';

const APP_LOCK_KEY = 'app_lock_enabled';
const LOCK_DELAY_KEY = 'app_lock_delay_ms';

/**
 * How long the app may stay in the background before it asks for
 * authentication again. Without a grace period every trip to another app (say,
 * looking a date up in the calendar) costs a fingerprint, which is why the
 * default is five minutes rather than zero.
 */
export const DEFAULT_LOCK_DELAY_MS = 5 * 60 * 1000;

/** Delays offered in settings, in milliseconds. */
export const LOCK_DELAY_OPTIONS = [0, 60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000];

export function describeLockDelay(delayMs: number): string {
  if (delayMs === 0) return 'Immediately';
  return `${Math.round(delayMs / 60000)} min`;
}

class AppLockService {
  async isEnabled(): Promise<boolean> {
    const value = await storage.getItem(APP_LOCK_KEY);
    return value === 'true';
  }

  async setEnabled(enabled: boolean): Promise<void> {
    await storage.setItem(APP_LOCK_KEY, enabled ? 'true' : 'false');
  }

  async getLockDelayMs(): Promise<number> {
    const value = await storage.getItem(LOCK_DELAY_KEY);
    if (value === null) return DEFAULT_LOCK_DELAY_MS;

    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_LOCK_DELAY_MS;
  }

  async setLockDelayMs(delayMs: number): Promise<void> {
    await storage.setItem(LOCK_DELAY_KEY, String(delayMs));
  }

  /**
   * Whether returning to the foreground has to go through the platform prompt.
   * A backwards clock jump counts as "long enough ago" so a manipulated or
   * corrected system time can never hold the lock open.
   */
  async shouldLock(backgroundedAt: number, now: number): Promise<boolean> {
    if (!(await this.isEnabled())) return false;

    const away = now - backgroundedAt;
    return away < 0 || away >= (await this.getLockDelayMs());
  }

  // Device must have biometrics or PIN/passcode set up
  async isAvailable(): Promise<boolean> {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const securityLevel = await LocalAuthentication.getEnrolledLevelAsync();
    return hasHardware && securityLevel !== LocalAuthentication.SecurityLevel.NONE;
  }

  async authenticate(): Promise<boolean> {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock SimpleDay',
        fallbackLabel: 'Use device PIN',
        disableDeviceFallback: false,
        cancelLabel: 'Cancel',
      });
      return result.success;
    } catch (error) {
      console.error('Authentication error:', error);
      return false;
    }
  }
}

export const appLock = new AppLockService();
