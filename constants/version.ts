// SPDX-License-Identifier: GPL-3.0-only
// Single source for the version shown in the UI. `app.json` is what
// `expo prebuild` turns into the Android `versionName`, so reading it here
// keeps the screen and the installed package in step without a second bump.

import appJson from '../app.json';

export const APP_VERSION: string = appJson.expo.version;
