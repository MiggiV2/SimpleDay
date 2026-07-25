// SPDX-License-Identifier: GPL-3.0-only
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.ts'],
  testMatch: ['<rootDir>/__tests__/**/*.test.ts?(x)'],
  collectCoverageFrom: ['services/**/*.ts', 'hooks/**/*.ts'],
};
