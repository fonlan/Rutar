#!/usr/bin/env bash
set -euo pipefail

APP_PATH="${1:-/Applications/rutar.app}"
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"

if [[ ! -d "$APP_PATH" ]]; then
  echo "Rutar app bundle not found: $APP_PATH" >&2
  echo "Install it first from the DMG, or pass an explicit .app path." >&2
  exit 1
fi

"$LSREGISTER" -f "$APP_PATH"
echo "Registered macOS file associations for: $APP_PATH"
echo "To make Rutar the default app for an extension, use Finder > Get Info > Open with > Change All."
