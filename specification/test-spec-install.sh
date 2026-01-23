#!/usr/bin/env bash
set -euo pipefail
PKGDIR="$(mktemp -d -t specification)"
TARGET="dist/shared/specification/index.js"

# Run inside specification/ package

echo "[spec-test] check backend build"

# Ensure runtime import path works: dist/m2mspecification.js imports ../shared/specification/index.js
# In the repo, shared/ is a symlink; for packing we temporarily replace it with a real dir containing a shim.
if [ ! -e "$TARGET" ]; then
  echo "[spec-test] ERROR: Missing $TARGET. Did the build succeed?" >&2
  exit 1
fi


echo "[spec-test] Creating tarball..."
info=$(npm pack --json)
tarball=$(echo "$info" | grep -o '"filename": "[^"]*"' | sed 's/"filename": "\(.*\)"/\1/')
version=$(echo "$info" | grep -o '"version": "[^"]*"' | sed 's/"version": "\(.*\)"/\1/')
mv $tarball "$PKGDIR"
echo "[spec-test] Built tarball: $tarball (version $version)"
TARBALL_PATH="$PKGDIR/$tarball"
echo "[spec-test] Built tarball: $TARBALL_PATH"

echo "[spec-test] Creating temp project and installing tarball..."
cd "$PKGDIR"
pwd 
ls 
npm init -y 
ls
npm install "$tarball" 

echo "[spec-test] Verifying import of @modbus2mqtt/specification ..."
node -e "import('@modbus2mqtt/specification').then(()=>{console.log('OK: import succeeded')}).catch(e=>{console.error('FAIL:',e);process.exit(1)})"

echo "[spec-test] Success. Cleaning up."
popd >/dev/null
rm -rf "$TMP_DIR"
exit 0
