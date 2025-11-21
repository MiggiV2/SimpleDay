#!/bin/bash
set -e

echo "🏗️  Building TaskFlow APK locally..."

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

# Clean previous build
echo -e "${BLUE}🧹 Cleaning previous Android build...${NC}"
rm -rf android

# Generate native Android project
echo -e "${BLUE}📦 Generating native Android project...${NC}"
npx expo prebuild --platform android

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
    cp "$APK_PATH" ../taskflow-release.apk
    echo -e "${GREEN}📋 Copied to: taskflow-release.apk${NC}"
else
    echo -e "${RED}❌ Build failed: APK not found${NC}"
    exit 1
fi
