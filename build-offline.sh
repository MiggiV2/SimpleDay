#!/bin/bash
set -e

# Always operate from the repo root, regardless of where the script is invoked from
cd "$(dirname "$0")"
REPO_ROOT="$(pwd)"

# ─────────────────────────── Configuration ───────────────────────────
# Everything project-specific lives here. To reuse this script in another
# Expo/RN app, only this block needs to change.

# Human-readable app name (used in log output only)
APP_NAME="SimpleDay"

# Prefix of the produced APKs: <prefix>-<versionCode>-<arch>-release.apk
APK_PREFIX="simpleday"

# Keystore hints shown when keystore.properties is missing
KEYSTORE_FILE="simpleday-release.keystore"
KEY_ALIAS="simpleday"

# Where app.json lives (read as fallback for the base versionCode)
APP_JSON="app.json"

# JDKs that work with this RN/Gradle combo (RN 0.81 / Gradle 8.14 break on 23+)
SUPPORTED_JDKS="17 21"

# ABI splits: one lean APK per architecture instead of one large universal APK.
# x86_64 is here for emulators (F-Droid reviewers test in one); 32-bit x86 is dead.
# Override per invocation:  ABIS="arm64-v8a" ./build-offline.sh
ABIS="${ABIS:-armeabi-v7a arm64-v8a x86_64}"

# Set to 1 to ALSO emit a universal (all-ABI) APK as a fallback
INCLUDE_UNIVERSAL="${INCLUDE_UNIVERSAL:-0}"

# Where the renamed APKs are copied. Point at your F-Droid repo to drop them
# straight in:  OUT_DIR=~/my-fdroid/repo ./build-offline.sh
OUT_DIR="${OUT_DIR:-..}"

# Per-ABI versionCode suffix: final code = base * VERSION_CODE_FACTOR + suffix.
# Must match the F-Droid recipe's VercodeOperation so sideload updates line up.
declare -A ABI_CODE=( [armeabi-v7a]=1 [arm64-v8a]=2 [x86_64]=3 [x86]=4 )
VERSION_CODE_FACTOR=1000

# ─────────────────────────── End configuration ───────────────────────

echo "🏗️  Building $APP_NAME APK locally..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠️  node_modules not found. Installing dependencies...${NC}"
    npm install
fi

# Force Gradle to use the repo-pinned JDK (jenv reads .java-version).
# Gradle honours JAVA_HOME, NOT the jenv PATH shim, so we must export it.
if command -v jenv >/dev/null 2>&1; then
    export JAVA_HOME="$(jenv prefix)"
fi

# Require a supported JDK
JAVA_VER=$("$JAVA_HOME/bin/java" -version 2>&1 | head -1 | sed -E 's/.*version "([0-9]+).*/\1/')
if ! echo " $SUPPORTED_JDKS " | grep -q " $JAVA_VER "; then
    echo -e "${RED}❌ Java $JAVA_VER (JAVA_HOME=$JAVA_HOME). This build needs JDK $SUPPORTED_JDKS (newer JDKs break the Gradle/Kotlin toolchain).${NC}"
    echo -e "${YELLOW}   With jenv: jenv local 21.0.10${NC}"
    exit 1
fi
echo -e "${GREEN}☕ Using JDK $JAVA_VER at $JAVA_HOME${NC}"

# Require a release signing config — refuse to ship a debug-signed release
if [ ! -f "keystore.properties" ]; then
    echo -e "${RED}❌ keystore.properties not found.${NC}"
    echo -e "${YELLOW}   Copy keystore.properties.example to keystore.properties and fill it in,${NC}"
    echo -e "${YELLOW}   then generate a keystore (once, keep it forever):${NC}"
    echo -e "${YELLOW}   keytool -genkeypair -v -keystore $KEYSTORE_FILE \\\\${NC}"
    echo -e "${YELLOW}     -alias $KEY_ALIAS -keyalg RSA -keysize 2048 -validity 10000${NC}"
    exit 1
fi

# Clean previous build
echo -e "${BLUE}🧹 Cleaning previous Android build...${NC}"
rm -rf android

# Generate native Android project
echo -e "${BLUE}📦 Generating native Android project...${NC}"
npx expo prebuild --platform android

# The injections below are release-only. Leaving them in place would poison
# every later `expo run:android`: the ABI splits drop the emulator's x86_64
# build, and the per-ABI versionCode blocks reinstalls as a downgrade. Keep a
# pristine copy and put it back on exit, however the script ends.
GRADLE_FILE="android/app/build.gradle"
PROPS_FILE="android/gradle.properties"
PRISTINE_GRADLE="$(mktemp)"
PRISTINE_PROPS="$(mktemp)"

restore_gradle() {
    local status=$?
    if [ -s "$PRISTINE_GRADLE" ]; then
        cp "$PRISTINE_GRADLE" "$REPO_ROOT/$GRADLE_FILE"
        echo -e "${BLUE}↩️  Restored pristine $GRADLE_FILE${NC}"
    fi
    if [ -s "$PRISTINE_PROPS" ]; then
        cp "$PRISTINE_PROPS" "$REPO_ROOT/$PROPS_FILE"
    fi
    rm -f "$PRISTINE_GRADLE" "$PRISTINE_PROPS"
    return $status
}
trap restore_gradle EXIT

cp "$GRADLE_FILE" "$PRISTINE_GRADLE"
cp "$PROPS_FILE" "$PRISTINE_PROPS"

# Inject release signing into the freshly generated build.gradle.
# prebuild always regenerates this file with debug signing, so we patch it every build.
echo -e "${BLUE}🔏 Injecting release signing config...${NC}"

# 1. Add a `release` signingConfig (reads ../keystore.properties) next to the debug one
perl -0777 -i -pe '
s{(signingConfigs\s*\{\s*\n)(\s*debug\s*\{.*?\n\s*\}\n)}{$1$2        release {\n            def kp = rootProject.file("../keystore.properties")\n            if (kp.exists()) {\n                def props = new Properties()\n                kp.withInputStream { props.load(it) }\n                storeFile file(props["storeFile"])\n                storePassword props["storePassword"]\n                keyAlias props["keyAlias"]\n                keyPassword props["keyPassword"]\n            }\n        }\n}s;
' "$GRADLE_FILE"

# 2. Point the release buildType at the release signingConfig (only the one after the caution comment)
perl -0777 -i -pe '
s{(reactnative\.dev/docs/signed-apk-android\.\s*\n\s*signingConfig signingConfigs\.)debug}{${1}release}s;
' "$GRADLE_FILE"

if ! grep -q "signingConfig signingConfigs.release" "$GRADLE_FILE"; then
    echo -e "${RED}❌ Failed to inject release signing config into $GRADLE_FILE${NC}"
    exit 1
fi

# Inject ABI splits so Gradle emits one lean APK per architecture instead of a
# single universal APK. RN 0.81's generated build.gradle has no splits block,
# so we add one. `universalApk` is toggled by INCLUDE_UNIVERSAL.
echo -e "${BLUE}🔀 Injecting ABI splits ($ABIS, universal=$INCLUDE_UNIVERSAL)...${NC}"
SPLIT_INCLUDE=$(printf '"%s", ' $ABIS | sed 's/, $//')
ABI_FILTERS=$(printf '"%s", ' $ABIS | sed 's/, $//')
UNIVERSAL_FLAG=$([ "$INCLUDE_UNIVERSAL" = "1" ] && echo true || echo false)

perl -0777 -i -pe '
s{(\n\s*android\s*\{\n)}{$1    splits {\n        abi {\n            enable true\n            reset()\n            include '"$SPLIT_INCLUDE"'\n            universalApk '"$UNIVERSAL_FLAG"'\n        }\n    }\n}s;
' "$GRADLE_FILE"

# `splits.abi.include` only narrows the *per-ABI* outputs and the CMake build. The
# universal APK still swallows every prebuilt .so the AARs contribute, so leaving
# it at that produces x86/x86_64 directories that hold libhermes.so and friends but
# none of the locally compiled libappmodules.so / codegen libraries — an APK that
# installs on those devices and dies during TurboModule init (shipped as 1.3.0).
# abiFilters applies to every output, so packaging can no longer outrun the build.
cat >> "$GRADLE_FILE" <<GRADLE

// Package exactly the ABIs we compile — see the universal-APK trap above.
android {
    defaultConfig {
        ndk {
            abiFilters.clear()
            abiFilters.addAll([$ABI_FILTERS])
        }
    }
}
GRADLE

# Keep the native build in sync with the same list (prebuild writes all four).
sed -i -E "s/^reactNativeArchitectures=.*/reactNativeArchitectures=$(echo $ABIS | tr ' ' ',')/" "$PROPS_FILE"

# Give each split a distinct, monotonic versionCode (base*FACTOR + abiCode),
# matching the F-Droid recipe so sideload updates and store entries stay in sync.
# The Groovy map is generated from ABI_CODE above — single source of truth.
GROOVY_ABI_MAP=""
for abi in "${!ABI_CODE[@]}"; do
    GROOVY_ABI_MAP+="\"$abi\": ${ABI_CODE[$abi]}, "
done
GROOVY_ABI_MAP="${GROOVY_ABI_MAP%, }"

cat >> "$GRADLE_FILE" <<GRADLE

// Per-ABI versionCode: base * $VERSION_CODE_FACTOR + abiCode
android.applicationVariants.all { variant ->
    def abiCodes = [$GROOVY_ABI_MAP]
    variant.outputs.each { output ->
        def abi = output.getFilter(com.android.build.OutputFile.ABI)
        if (abi != null) {
            output.versionCodeOverride = variant.versionCode * $VERSION_CODE_FACTOR + abiCodes.get(abi)
        }
    }
}
GRADLE

if ! grep -q "splits {" "$GRADLE_FILE"; then
    echo -e "${RED}❌ Failed to inject ABI splits into $GRADLE_FILE${NC}"
    exit 1
fi

# Point Gradle at the Android SDK (prebuild does not create local.properties)
SDK_DIR="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Android/Sdk}}"
if [ ! -d "$SDK_DIR" ]; then
    echo -e "${RED}❌ Android SDK not found at '$SDK_DIR'. Set ANDROID_HOME or install the SDK.${NC}"
    exit 1
fi
echo "sdk.dir=$SDK_DIR" > android/local.properties
echo -e "${GREEN}📍 SDK: $SDK_DIR${NC}"

# Navigate to android directory and build
cd android

# Build release APK(s)
echo -e "${BLUE}🔨 Building release APK(s)...${NC}"
./gradlew assembleRelease

# Collect every produced APK (one per ABI, plus universal if enabled)
mapfile -t APKS < <(find app/build/outputs/apk/release -name "*.apk" | sort)
if [ "${#APKS[@]}" -eq 0 ]; then
    echo -e "${RED}❌ Build failed: no APK found${NC}"
    exit 1
fi

mkdir -p "$OUT_DIR"

# Locate aapt (in the SDK build-tools) to read each APK's real versionCode
AAPT=$(find "$SDK_DIR/build-tools" -maxdepth 2 -name aapt 2>/dev/null | sort -V | tail -1)
# Fallback base versionCode from app.json (android.versionCode) if aapt is missing
BASE_VC=$(grep -oE '"versionCode"[[:space:]]*:[[:space:]]*[0-9]+' "../$APP_JSON" | grep -oE '[0-9]+' | head -1)

echo -e "${GREEN}✅ Build successful! ${#APKS[@]} APK(s) → $OUT_DIR${NC}"
DEBUG_SIGNED=0
INCOMPLETE_ABI=0
for APK_PATH in "${APKS[@]}"; do
    APK_SIZE=$(du -h "$APK_PATH" | cut -f1)
    BASENAME=$(basename "$APK_PATH")
    # Arch from the gradle output name (app-<abi>-release.apk); "universal" if none
    ARCH=$(echo "$BASENAME" | sed -nE 's/^app-([a-z0-9_-]+)-release\.apk$/\1/p')
    [ -z "$ARCH" ] && ARCH="universal"
    # versionCode: prefer the real value from the APK, else compute base*FACTOR+abiCode
    VC=""
    [ -n "$AAPT" ] && VC=$("$AAPT" dump badging "$APK_PATH" 2>/dev/null | sed -nE "s/.*versionCode='([0-9]+)'.*/\1/p")
    if [ -z "$VC" ] && [ -n "$BASE_VC" ] && [ -n "${ABI_CODE[$ARCH]}" ]; then
        VC=$(( BASE_VC * VERSION_CODE_FACTOR + ABI_CODE[$ARCH] ))
    fi
    [ -z "$VC" ] && VC="unknown"
    DEST="${APK_PREFIX}-${VC}-${ARCH}-release.apk"
    cp "$APK_PATH" "$OUT_DIR/$DEST"
    echo -e "${GREEN}📱 $DEST  (${APK_SIZE})${NC}"

    # Verify every packaged ABI is complete. `libappmodules.so` is compiled from
    # the app's own codegen output, so it exists only for ABIs that were really
    # built — an ABI directory without it means the APK installs there and then
    # crashes in TurboModule init.
    if command -v unzip >/dev/null 2>&1; then
        PACKAGED_ABIS=$(unzip -Z1 "$APK_PATH" 'lib/*' 2>/dev/null | cut -d/ -f2 | sort -u)
        for PACKAGED in $PACKAGED_ABIS; do
            if ! unzip -Z1 "$APK_PATH" "lib/$PACKAGED/libappmodules.so" >/dev/null 2>&1; then
                echo -e "${RED}   ❌ lib/$PACKAGED has no libappmodules.so — would crash on $PACKAGED.${NC}"
                INCOMPLETE_ABI=1
            fi
        done
        echo -e "${GREEN}   🧩 ABIs: $(echo $PACKAGED_ABIS | tr '\n' ' ')${NC}"
    else
        echo -e "${YELLOW}   ⚠️  unzip not found — skipped the ABI completeness check.${NC}"
    fi

    # Verify each APK is NOT signed with the Android debug key
    CERTS=$(keytool -printcert -jarfile "$APK_PATH" 2>/dev/null)
    if [ -z "$CERTS" ]; then
        echo -e "${YELLOW}   ⚠️  Could not read signer (no apksigner; APK may be v2/v3-only). Verify: apksigner verify --print-certs $APK_PATH${NC}"
    elif echo "$CERTS" | grep -qi "CN=Android Debug"; then
        echo -e "${RED}   ❌ Signed with the DEBUG key — do NOT publish this.${NC}"
        DEBUG_SIGNED=1
    else
        echo -e "${GREEN}   🔐 Signer OK (not debug key)${NC}"
    fi
done

if [ "$DEBUG_SIGNED" = "1" ]; then
    echo -e "${RED}❌ One or more APKs are debug-signed. Aborting.${NC}"
    exit 1
fi

if [ "$INCOMPLETE_ABI" = "1" ]; then
    echo -e "${RED}❌ One or more APKs package an ABI they did not build. Aborting.${NC}"
    exit 1
fi

echo -e "${GREEN}📋 APKs written to '$OUT_DIR' as ${APK_PREFIX}-<versionCode>-<arch>-release.apk${NC}"
echo -e "${BLUE}ℹ️  For your own F-Droid repo:  OUT_DIR=~/my-fdroid/repo ./build-offline.sh  then  (cd ~/my-fdroid && fdroid update)${NC}"
echo -e "${BLUE}ℹ️  INCLUDE_UNIVERSAL=1 also builds a universal fallback APK.${NC}"
