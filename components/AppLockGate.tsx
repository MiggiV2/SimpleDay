// SPDX-License-Identifier: GPL-3.0-only
import { View, Text, StyleSheet, TouchableOpacity, AppState, AppStateStatus } from 'react-native';
import { useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { appLock } from '../services/appLock';

interface AppLockGateProps {
  children: ReactNode;
}

export function AppLockGate({ children }: AppLockGateProps) {
  // null = still loading the enabled flag, avoid flashing content
  const [locked, setLocked] = useState<boolean | null>(null);
  const [authFailed, setAuthFailed] = useState(false);
  const authInProgress = useRef(false);
  const lockedRef = useRef<boolean | null>(null);
  const backgroundedAt = useRef<number | null>(null);
  lockedRef.current = locked;

  const tryUnlock = useCallback(async () => {
    if (authInProgress.current) return;
    authInProgress.current = true;
    setAuthFailed(false);
    try {
      const success = await appLock.authenticate();
      if (success) {
        backgroundedAt.current = null;
        setLocked(false);
      } else {
        setAuthFailed(true);
      }
    } finally {
      authInProgress.current = false;
    }
  }, []);

  // Initial lock check on cold start
  useEffect(() => {
    const init = async () => {
      const enabled = await appLock.isEnabled();
      if (enabled && (await appLock.isAvailable())) {
        setLocked(true);
        tryUnlock();
      } else {
        setLocked(false);
      }
    };
    init();
  }, [tryUnlock]);

  // Re-lock when app goes to background
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
      if (nextState === 'background') {
        // Ignore background events caused by the auth prompt itself
        if (authInProgress.current) return;
        const enabled = await appLock.isEnabled();
        if (enabled) {
          // Cover the app right away so the entry is not readable in the task
          // switcher; whether coming back costs a prompt is decided on resume.
          backgroundedAt.current = Date.now();
          setLocked(true);
        }
      } else if (nextState === 'active') {
        if (lockedRef.current !== true) return;

        const since = backgroundedAt.current;
        if (since !== null && !(await appLock.shouldLock(since, Date.now()))) {
          backgroundedAt.current = null;
          setLocked(false);
          return;
        }
        tryUnlock();
      }
    });
    return () => subscription.remove();
  }, [tryUnlock]);

  // The screens stay mounted behind the lock. Unmounting them would throw away
  // whatever the user had typed but not saved yet, which is exactly what a trip
  // to another app used to cost.
  return (
    <View style={styles.container}>
      <View style={styles.content} pointerEvents={locked === false ? 'auto' : 'none'}>
        {children}
      </View>

      {locked !== false && (
        <View style={[StyleSheet.absoluteFill, styles.lockScreen]}>
          {locked === true && (
            <>
              <Ionicons name="lock-closed" size={64} color="#007AFF" />
              <Text style={styles.title}>SimpleDay is locked</Text>
              <Text style={styles.subtitle}>Authenticate to access your diary</Text>
              {authFailed && (
                <TouchableOpacity style={styles.unlockButton} onPress={tryUnlock}>
                  <Ionicons name="finger-print" size={20} color="#fff" />
                  <Text style={styles.unlockButtonText}>Unlock</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  lockScreen: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: '#333',
    marginTop: 24,
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  unlockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginTop: 32,
  },
  unlockButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
