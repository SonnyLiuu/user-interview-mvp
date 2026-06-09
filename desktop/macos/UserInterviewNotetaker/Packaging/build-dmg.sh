#!/bin/sh
set -eu

APP_NAME="User Interview Notetaker"
EXECUTABLE_NAME="UserInterviewNotetaker"
VERSION="0.1.0"
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
APP_DIR="$DIST_DIR/$APP_NAME.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
DMG_PATH="$DIST_DIR/User-Interview-Notetaker-$VERSION-macOS.dmg"
IDENTITY="${FOUNDRY_MACOS_CODESIGN_IDENTITY:-}"
NOTARY_PROFILE="${FOUNDRY_MACOS_NOTARY_PROFILE:-}"

cd "$ROOT_DIR"
swift build -c release

rm -rf "$APP_DIR" "$DMG_PATH"
mkdir -p "$MACOS_DIR" "$RESOURCES_DIR"

cp ".build/release/$EXECUTABLE_NAME" "$MACOS_DIR/$EXECUTABLE_NAME"
cp "UserInterviewNotetaker/Resources/Info.plist" "$CONTENTS_DIR/Info.plist"
cp "UserInterviewNotetaker/Resources/UserInterviewNotetaker.entitlements" "$RESOURCES_DIR/UserInterviewNotetaker.entitlements"
cp "UserInterviewNotetaker/Resources/AppIcon.icns" "$RESOURCES_DIR/AppIcon.icns"

if [ -n "$IDENTITY" ]; then
  codesign \
    --force \
    --options runtime \
    --timestamp \
    --entitlements "$RESOURCES_DIR/UserInterviewNotetaker.entitlements" \
    --sign "$IDENTITY" \
    "$APP_DIR"
fi

hdiutil create \
  -volname "$APP_NAME" \
  -srcfolder "$APP_DIR" \
  -ov \
  -format UDZO \
  "$DMG_PATH"

if [ -n "$IDENTITY" ]; then
  codesign --force --timestamp --sign "$IDENTITY" "$DMG_PATH"
fi

if [ -n "$NOTARY_PROFILE" ]; then
  xcrun notarytool submit "$DMG_PATH" --keychain-profile "$NOTARY_PROFILE" --wait
  xcrun stapler staple "$DMG_PATH"
fi

shasum -a 256 "$DMG_PATH" > "$DMG_PATH.sha256"
printf '%s\n' "$DMG_PATH"
