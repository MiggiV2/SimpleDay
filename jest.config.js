// SPDX-License-Identifier: GPL-3.0-only

// Pin the timezone before the workers spawn. Date handling has to be asserted
// against a fixed offset, not whatever the machine happens to use — the bug
// these tests guard against (deriving a date from `toISOString()`) is invisible
// in UTC and only shows up east of it.
process.env.TZ = 'Europe/Berlin';

module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.ts'],
  testMatch: ['<rootDir>/__tests__/**/*.test.ts?(x)'],
  collectCoverageFrom: ['services/**/*.ts', 'hooks/**/*.ts'],
};
