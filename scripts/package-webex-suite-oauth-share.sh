#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATE_STAMP="$(date +%Y%m%d)"
SHARE_DIR="$ROOT_DIR/share"
PACKAGE_NAME="webex-suite-oauth-share-$DATE_STAMP"
ARCHIVE_PATH="$SHARE_DIR/$PACKAGE_NAME.tar.gz"

mkdir -p "$SHARE_DIR"
rm -f "$ARCHIVE_PATH"

tar \
  --exclude='./.git' \
  --exclude='./node_modules' \
  --exclude='./share' \
  --exclude='./.env' \
  --exclude='./.webex-suite-oauth.env' \
  --exclude='./.webex-suite-oauth.json' \
  --exclude='./coverage' \
  --exclude='./.nyc_output' \
  -czf "$ARCHIVE_PATH" \
  -C "$ROOT_DIR" \
  .

echo "Created share package:"
echo "$ARCHIVE_PATH"
