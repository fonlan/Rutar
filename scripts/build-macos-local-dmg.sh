#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$ROOT/src-tauri/tauri.macos.conf.json"
BUNDLE_DIR="$ROOT/src-tauri/target/release/bundle/macos"
APP_PATH="$BUNDLE_DIR/rutar.app"
STAGE_DIR="$BUNDLE_DIR/.local-dmg-stage"

cd "$ROOT"

PRODUCT_NAME="$(node -e 'const fs = require("fs"); const config = JSON.parse(fs.readFileSync("src-tauri/tauri.conf.json", "utf8")); process.stdout.write(config.productName || "rutar");')"
VERSION="$(node -e 'const fs = require("fs"); const config = JSON.parse(fs.readFileSync("src-tauri/tauri.conf.json", "utf8")); process.stdout.write(config.version || "0.0.0");')"
ARCH="$(uname -m)"
DMG_PATH="$BUNDLE_DIR/${PRODUCT_NAME}_${VERSION}_${ARCH}_local.dmg"

npm run tauri build -- --config "$CONFIG" --bundles app

if [[ ! -d "$APP_PATH" ]]; then
  echo "Rutar app bundle not found after build: $APP_PATH" >&2
  exit 1
fi

rm -rf "$STAGE_DIR" "$DMG_PATH"
mkdir -p "$STAGE_DIR"
cp -R "$APP_PATH" "$STAGE_DIR/"
ln -s /Applications "$STAGE_DIR/Applications"

# ponytail: local installer only; no Finder window cosmetics. Use Tauri's dmg target if we later need polished public distribution.
hdiutil create -volname "$PRODUCT_NAME" -srcfolder "$STAGE_DIR" -ov -format UDZO "$DMG_PATH"
rm -rf "$STAGE_DIR"

echo "Created app bundle: $APP_PATH"
echo "Created local installer: $DMG_PATH"
echo "Open the DMG and drag $PRODUCT_NAME.app to Applications, then use that installed app for daily use."
