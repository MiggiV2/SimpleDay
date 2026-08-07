// SPDX-License-Identifier: GPL-3.0-only
// The About block on the settings screen used to carry a hand-typed version
// string that stopped matching reality after 1.1.0. It now reads `app.json`,
// the same source `expo prebuild` derives `versionName` from, so a release bump
// updates the screen too. These tests guard both halves: the constant tracks
// app.json, and the screen never grows another literal.

import fs from 'fs';
import path from 'path';

import appJson from '../app.json';
import { APP_VERSION } from '../constants/version';

describe('APP_VERSION', () => {
  it('matches the version expo prebuild ships as versionName', () => {
    expect(APP_VERSION).toBe(appJson.expo.version);
  });

  it('is a semver string', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('settings screen', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'app', '(tabs)', 'settings.tsx'),
    'utf8'
  );

  it('renders the version from APP_VERSION instead of a literal', () => {
    expect(source).toContain('APP_VERSION');
    expect(source).not.toMatch(/v\d+\.\d+\.\d+/);
  });
});
