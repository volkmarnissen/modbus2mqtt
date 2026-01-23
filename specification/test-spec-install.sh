#!/usr/bin/env bash
set -euo pipefail
PKGDIR="$(mktemp -d -t specification)"
SOURCE="../dist/shared/specification/index.js"

# Run inside specification/ package

echo "[spec-test] check backend build"

# Ensure runtime import path works: dist/m2mspecification.js imports ../shared/specification/index.js
# In the repo, shared/ is a symlink; for packing we temporarily replace it with a real dir containing a shim.
if [ ! -e "$SOURCE" ]; then
  echo "[spec-test] ERROR: Missing $SOURCE. Did the build succeed?" >&2
  exit 1
fi


echo "[spec-test] Creating tarball..."
rm -rf dist
mkdir -p dist/shared
cp -R ../dist/specification dist/specification
cp -R ../dist/shared/specification dist/shared/specification
info=$(npm pack --json)
tarball=$(echo "$info" | grep -o '"filename": "[^"]*"' | sed 's/"filename": "\(.*\)"/\1/')
version=$(echo "$info" | grep -o '"version": "[^"]*"' | sed 's/"version": "\(.*\)"/\1/')
mv $tarball "$PKGDIR"
echo "[spec-test] Built tarball: $tarball (version $version)"
TARBALL_PATH="$PKGDIR/$tarball"
echo "[spec-test] Built tarball: $TARBALL_PATH"

echo "[spec-test] Creating temp project and installing tarball..."
cd "$PKGDIR"
npm init -y 2>/dev/null >/dev/null
npm install "$tarball" 2>/dev/null >/dev/null

echo "[spec-test] Verifying validate.js exists in installed package ..."
PKG_NODE_DIR="$PKGDIR/node_modules/@modbus2mqtt/specification"
( (npx m2m-validate --help 2>&1 || true) | grep -q "Usage" ) || {
  echo "FAIL: 'npx m2m-validate' command failed" >&2
  echo "Installed package contents:" >&2
  cd "$PKG_NODE_DIR"
  find "dist" -type f >&2
  exit 1
}
echo "[spec-test] OK: 'npx m2m-validate' command succeeded"
exit 0
