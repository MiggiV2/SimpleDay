#!/bin/bash
set -e

# Always operate from the repo root, regardless of where the script is invoked from
cd "$(dirname "$0")"

echo "🏗️  Building SimpleDay APK locally..."

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

# Require a supported JDK — RN 0.81 / Gradle 8.14 crash on JDK 23+
JAVA_VER=$("$JAVA_HOME/bin/java" -version 2>&1 | head -1 | sed -E 's/.*version "([0-9]+).*/\1/')
if [ "$JAVA_VER" != "17" ] && [ "$JAVA_VER" != "21" ]; then
    echo -e "${RED}❌ Java $JAVA_VER (JAVA_HOME=$JAVA_HOME). This build needs JDK 17 or 21 (newer JDKs break the Gradle/Kotlin toolchain).${NC}"
    echo -e "${YELLOW}   With jenv: jenv local 21.0.10${NC}"
    exit 1
fi
echo -e "${GREEN}☕ Using JDK $JAVA_VER at $JAVA_HOME${NC}"

# Require a release signing config — refuse to ship a debug-signed release
if [ ! -f "keystore.properties" ]; then
    echo -e "${RED}❌ keystore.properties not found.${NC}"
    echo -e "${YELLOW}   Copy keystore.properties.example to keystore.properties and fill it in,${NC}"
    echo -e "${YELLOW}   then generate a keystore (once, keep it forever):${NC}"
    echo -e "${YELLOW}   keytool -genkeypair -v -keystore simpleday-release.keystore \\\\${NC}"
    echo -e "${YELLOW}     -alias simpleday -keyalg RSA -keysize 2048 -validity 10000${NC}"
    exit 1
fi

# Clean previous build
echo -e "${BLUE}🧹 Cleaning previous Android build...${NC}"
rm -rf android

# Generate native Android project
echo -e "${BLUE}📦 Generating native Android project...${NC}"
npx expo prebuild --platform android

# Inject release signing into the freshly generated build.gradle.
# prebuild always regenerates this file with debug signing, so we patch it every build.
echo -e "${BLUE}🔏 Injecting release signing config...${NC}"
GRADLE_FILE="android/app/build.gradle"

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

# Build release APK
echo -e "${BLUE}🔨 Building release APK...${NC}"
./gradlew assembleRelease

# Find and display the APK location
APK_PATH=$(find app/build/outputs/apk/release -name "*.apk" | head -n 1)
if [ -n "$APK_PATH" ]; then
    APK_SIZE=$(du -h "$APK_PATH" | cut -f1)
    echo -e "${GREEN}✅ Build successful!${NC}"
    echo -e "${GREEN}📱 APK location: android/$APK_PATH${NC}"
    echo -e "${GREEN}📊 APK size: $APK_SIZE${NC}"
    
    # Copy APK to root directory for easy access
    cp "$APK_PATH" ../simpleday-release.apk
    echo -e "${GREEN}📋 Copied to: simpleday-release.apk${NC}"

    # Verify the APK is NOT signed with the Android debug key
    echo -e "${BLUE}🔎 Verifying signer...${NC}"
    CERTS=$(keytool -printcert -jarfile "$APK_PATH" 2>/dev/null)
    if [ -z "$CERTS" ]; then
        echo -e "${YELLOW}⚠️  Could not read signer (no apksigner; APK may be v2/v3-only). Verify manually:${NC}"
        echo -e "${YELLOW}   apksigner verify --print-certs $APK_PATH${NC}"
    elif echo "$CERTS" | grep -qi "CN=Android Debug"; then
        echo -e "${RED}❌ APK is signed with the DEBUG key — do NOT publish this.${NC}"
        exit 1
    else
        echo -e "${GREEN}🔐 Signer OK (not the debug key):${NC}"
        echo "$CERTS" | grep -iE "Owner:|SHA256:" | head -2
    fi
else
    echo -e "${RED}❌ Build failed: APK not found${NC}"
    exit 1
fi
