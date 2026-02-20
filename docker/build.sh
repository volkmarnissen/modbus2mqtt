#!/bin/bash
set -e

# docker/build.sh
# Local Docker build script - builds modbus2mqtt Docker image from npm pack tarball
# Usage: ./docker/build.sh [version]

# Determine script directory and project root
SCRIPT_DIR="$(cd "$(dirname "$0")" >/dev/null 2>&1 && pwd -P)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." >/dev/null 2>&1 && pwd -P)"

# Get version from parameter or package.json
BUILD_VERSION="${1:-$(cd "$PROJECT_ROOT" && node -p "require('./package.json').version" 2>/dev/null || echo "dev")}"

# Read Node.js major version from .nvmrc
NODE_MAJOR="$(cut -d. -f1 "$PROJECT_ROOT/.nvmrc" 2>/dev/null || echo "22")"

echo "Building modbus2mqtt Docker image"
echo "  Version: $BUILD_VERSION"
echo "  Node.js: ${NODE_MAJOR}.x (from .nvmrc)"
echo "  Project root: $PROJECT_ROOT"

cd "$PROJECT_ROOT"

# Build the project
echo ""
echo "=== Building project ==="
pnpm run build

# Create npm pack tarball
echo ""
echo "=== Creating npm pack tarball ==="
npm pack --pack-destination docker/
mv docker/modbus2mqtt-*.tgz docker/modbus2mqtt.tgz
echo "Tarball: docker/modbus2mqtt.tgz ($(du -h docker/modbus2mqtt.tgz | cut -f1))"

# Build the Docker image
echo ""
echo "=== Building Docker image ==="
docker build -t modbus2mqtt \
    -f docker/Dockerfile.npm-pack \
    --build-arg NODE_MAJOR="$NODE_MAJOR" \
    --build-arg BUILD_DATE="$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
    --build-arg BUILD_DESCRIPTION="modbus2mqtt Docker Image" \
    --build-arg BUILD_NAME="modbus2mqtt" \
    --build-arg BUILD_REPOSITORY="modbus2mqtt" \
    --build-arg BUILD_VERSION="$BUILD_VERSION" \
    .

# Clean up tarball
rm -f docker/modbus2mqtt.tgz

echo ""
echo "✓ Docker image 'modbus2mqtt' built successfully"
echo "  Image: modbus2mqtt:latest"
echo "  Version: $BUILD_VERSION"
echo ""
echo "Next steps:"
echo "  Test: ./docker/test.sh"
echo "  Run:  docker run -d -p 3000:3000 modbus2mqtt"
