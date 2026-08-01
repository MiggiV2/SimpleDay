// SPDX-License-Identifier: GPL-3.0-only
// Guards the ABI contract of build-offline.sh.
//
// 1.3.0 shipped a universal APK that crashed on x86_64: the injected
// `splits.abi.include` narrowed the CMake build to the two arm ABIs, but the
// prebuilt x86/x86_64 `.so` files that ship inside the AARs were still packaged
// into the universal APK. The result was an APK with `lib/x86_64/libhermes.so`
// but no `lib/x86_64/libappmodules.so`, so TurboModule init hit `std::terminate()`
// right after the splash screen. Nothing in the build failed — the broken APK was
// produced, signed and published.
//
// The fix is to make packaging follow the build: an explicit `ndk.abiFilters`
// pinned to the same ABI list, plus a post-build check that every packaged
// `lib/<abi>/` carries the locally compiled libraries.

import fs from 'fs';
import path from 'path';

const script = fs.readFileSync(path.join(__dirname, '..', 'build-offline.sh'), 'utf8');

/** `ABIS="${ABIS:-armeabi-v7a arm64-v8a x86_64}"` → the default list. */
const defaultAbis = (): string[] => {
  const match = script.match(/^ABIS="\$\{ABIS:-([^}]+)\}"$/m);
  if (!match) throw new Error('no ABIS default found in build-offline.sh');
  return match[1].trim().split(/\s+/);
};

describe('build-offline.sh ABI handling', () => {
  it('builds an x86_64 APK', () => {
    // F-Droid reviewers test in an x86_64 emulator, and x86_64 is the only
    // non-arm ABI still worth shipping. Without it there is no APK they can run.
    expect(defaultAbis()).toContain('x86_64');
  });

  it('pins ndk.abiFilters to the ABIs it builds', () => {
    // splits.abi.include alone only filters the per-ABI outputs. The universal
    // APK takes whatever jniLibs the AARs contribute, which is how 1.3.0 got
    // half-populated x86/x86_64 directories. abiFilters applies to every output.
    const injections = script.match(/abiFilters[^\n]*/g) ?? [];
    expect(injections.length).toBeGreaterThan(0);
    expect(injections.some((line) => line.includes('ABI_FILTERS'))).toBe(true);
  });

  it('derives both the split include and the abiFilters from the same ABI list', () => {
    // Two hand-maintained lists would drift; drift is exactly the 1.3.0 bug.
    expect(script).toMatch(/SPLIT_INCLUDE=\$\(printf[^\n]*\$ABIS\)?/);
    expect(script).toMatch(/ABI_FILTERS=\$\(printf[^\n]*\$ABIS/);
  });

  it('fails the build when a packaged ABI is missing its compiled libraries', () => {
    // The check that would have caught 1.3.0 before it was published.
    expect(script).toContain('libappmodules.so');
  });

  it('knows a versionCode suffix for every ABI it builds by default', () => {
    // A missing suffix silently produces `simpleday-unknown-<abi>-release.apk`
    // and an APK whose versionCode does not line up with the F-Droid recipe.
    const map = script.match(/declare -A ABI_CODE=\(([^)]*)\)/);
    if (!map) throw new Error('no ABI_CODE map found in build-offline.sh');
    const known = [...map[1].matchAll(/\[([a-z0-9_-]+)\]=(\d+)/g)].map((m) => m[1]);
    for (const abi of defaultAbis()) {
      expect(known).toContain(abi);
    }
  });
});
