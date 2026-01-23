#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
SPEC_DIR="$ROOT_DIR/specification"
TMP_DIR="$SPEC_DIR/tmp-npm-install-test"

echo "[spec-test] Preparing tarball from specification package..."
pushd "$SPEC_DIR" >/dev/null
rm -f *.tgz || true
TARBALL=$(npm pack | tail -n1)
TARBALL_PATH="$SPEC_DIR/$TARBALL"
echo "[spec-test] Built tarball: $TARBALL_PATH"
popd >/dev/null

echo "[spec-test] Creating temp project and installing tarball..."
rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR"
pushd "$TMP_DIR" >/dev/null
npm init -y >/dev/null
npm install "$TARBALL_PATH" >/dev/null

echo "[spec-test] Verifying import of @modbus2mqtt/specification ..."
node -e "import('@modbus2mqtt/specification').then(() => { console.log('OK: @modbus2mqtt/specification import succeeded'); }).catch(e => { console.error('FAIL: import failed', e); process.exit(1); })"

echo "[spec-test] Success. Cleaning up."
popd >/dev/null
rm -rf "$TMP_DIR"
exit 0
