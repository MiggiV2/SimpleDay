// App lock service using device biometrics / PIN via expo-local-authentication
import * as LocalAuthentication from 'expo-local-authentication';
import { storage } from './storage';

const APP_LOCK_KEY = 'app_lock_enabled';

class AppLockService {
  async isEnabled(): Promise<boolean> {
    const value = await storage.getItem(APP_LOCK_KEY);
    return value === 'true';
  }

  async setEnabled(enabled: boolean): Promise<void> {
    await storage.setItem(APP_LOCK_KEY, enabled ? 'true' : 'false');
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
