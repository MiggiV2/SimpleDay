// SPDX-License-Identifier: GPL-3.0-only
// Shared mocks for Expo native modules. The unit tests only exercise plain
// TypeScript logic, so every native module is replaced by an in-memory fake.

jest.mock('expo-secure-store', () => {
  const store: Record<string, string> = {};
  return {
    __store: store,
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store[key] = value;
    }),
    getItemAsync: jest.fn(async (key: string) => store[key] ?? null),
    deleteItemAsync: jest.fn(async (key: string) => {
      delete store[key];
    }),
  };
});

jest.mock('expo-crypto', () => ({
  // Deterministic "random" bytes keep the assertions reproducible.
  getRandomBytesAsync: jest.fn(
    async (size: number) => new Uint8Array(Array.from({ length: size }, (_, i) => (i * 7 + 13) % 256))
  ),
}));

jest.mock('expo-local-authentication', () => ({
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
  hasHardwareAsync: jest.fn(async () => true),
  getEnrolledLevelAsync: jest.fn(async () => 3),
  authenticateAsync: jest.fn(async () => ({ success: true })),
}));

// Silence the services' error logging so failing-path tests stay readable.
jest.spyOn(console, 'error').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});
