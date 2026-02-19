#!/bin/bash
set -e

# docker/test.sh
# Test script for modbus2mqtt Docker image
# Usage: ./docker/test.sh [--keep|-k] [--quick|-q] [--docker-tag <TAG>]

# Optional: --docker-tag <TAG> as argument
IMAGE_TAG="modbus2mqtt"
POSITIONAL=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --keep|-k|--quick|-q)
      POSITIONAL+=("$1")
      shift
      ;;
    --docker-tag)
      if [[ -n "$2" ]]; then
        IMAGE_TAG="$2"
        shift 2
      else
        echo "ERROR: --docker-tag requires an argument" >&2
        exit 1
      fi
      ;;
    *)
      echo "Usage: $0 [--keep|-k] [--quick|-q] [--docker-tag <TAG>]"
      echo "  --keep|-k         Keep containers running for debugging"
      echo "  --quick|-q        Quick test (main container only, no standalone test)"
      echo "  --docker-tag TAG  Use specific Docker image tag (default: modbus2mqtt)"
      exit 1
      ;;
  esac
done
set -- "${POSITIONAL[@]}"

# Configuration
KEEP_CONTAINER=false
QUICK_TEST=false
TEST_PORTS=(3010 3011)
MAX_ATTEMPTS=6
WAIT_SECONDS=2

# Parse command line options
for arg in "$@"; do
  case "$arg" in
    --keep|-k)
      KEEP_CONTAINER=true
      echo "Container will be kept running for debugging"
      ;;
    --quick|-q)
      QUICK_TEST=true
      echo "Running quick test (main container only)"
      ;;
  esac
done

echo "Testing modbus2mqtt Docker image..."

cleanup_containers() {
  echo "Cleaning up test containers..."
  docker stop modbus2mqtt-test-main modbus2mqtt-test-standalone >/dev/null 2>&1 || true
  docker rm modbus2mqtt-test-main modbus2mqtt-test-standalone >/dev/null 2>&1 || true
}

cleanup_containers_or_keep() {
  if [ "$KEEP_CONTAINER" = "true" ]; then
    echo ""
    echo "=== Containers kept for debugging ==="
    echo "Main container:       modbus2mqtt-test-main"
    echo "  Web:  http://localhost:3010/"
    if [ "$QUICK_TEST" = "false" ]; then
      echo "Standalone container: modbus2mqtt-test-standalone"
      echo "  Web:  http://localhost:3011/"
    fi
    echo ""
    echo "Commands:"
    echo "  docker logs modbus2mqtt-test-main"
    echo "  docker exec -it modbus2mqtt-test-main sh"
    echo "  docker stop modbus2mqtt-test-main modbus2mqtt-test-standalone"
    echo "  docker rm modbus2mqtt-test-main modbus2mqtt-test-standalone"
  else
    cleanup_containers
  fi
}

# Function: Check if ports are free
check_ports() {
  local ports_in_use=()
  for port in "${TEST_PORTS[@]}"; do
    if lsof -i ":$port" >/dev/null 2>&1; then
      ports_in_use+=("$port")
    fi
  done

  if [ ${#ports_in_use[@]} -gt 0 ]; then
    echo "ERROR: Ports in use: ${ports_in_use[*]}" >&2
    echo "Run: docker ps -a | grep modbus2mqtt" >&2
    exit 1
  fi
}

# Function: Wait for service to be ready
wait_for_service() {
  local port=$1
  local name=$2
  local container=$3
  local attempts=0

  echo "Waiting for $name on port $port..."
  while [ $attempts -lt $MAX_ATTEMPTS ]; do
    attempts=$((attempts + 1))
    echo "  Attempt $attempts/$MAX_ATTEMPTS..."

    if curl -s -f -o /dev/null "http://localhost:$port/"; then
      echo "✓ $name is ready on port $port"
      return 0
    fi

    # Check if container is still running
    if ! docker inspect -f '{{.State.Running}}' "$container" >/dev/null 2>&1 || [ "$(docker inspect -f '{{.State.Running}}' "$container")" != "true" ]; then
      echo "ERROR: Container $container stopped unexpectedly" >&2
      docker logs "$container" >&2
      return 1
    fi

    sleep $WAIT_SECONDS
  done

  echo "ERROR: $name failed to respond after $MAX_ATTEMPTS attempts" >&2
  docker logs "$container" >&2
  return 1
}

# Main execution starts here
echo "=== modbus2mqtt Docker Test ==="

# Preliminary checks
cleanup_containers_or_keep
check_ports

# Check if image exists
if [ -z "$(docker images -q "$IMAGE_TAG" 2> /dev/null)" ]; then
  docker images >&2
  echo "ERROR: Docker image '$IMAGE_TAG' not found" >&2
  echo "Run: ./docker/build.sh first" >&2
  exit 1
fi

# Create test data directory
TEST_DIR=$(mktemp -d)
mkdir -p "$TEST_DIR/data" "$TEST_DIR/ssl" "$TEST_DIR/config"
trap 'rm -rf "$TEST_DIR"' EXIT

# Test 1: Container with volume mount
echo ""
echo "=== Test 1: Full Configuration Test ==="
chmod -R 755 "$TEST_DIR"
cleanup_containers
echo "Starting container with volume mount..."
docker run -d -p 3010:3000 \
  -v "$TEST_DIR/data:/data" \
  -v "$TEST_DIR/ssl:/ssl" \
  -v "$TEST_DIR/config:/config" \
  --name modbus2mqtt-test-main "$IMAGE_TAG"

# Wait for web service
if ! wait_for_service 3010 "Web service" "modbus2mqtt-test-main"; then
  cleanup_containers_or_keep
  exit 1
fi

echo "✓ Test 1 passed: Container with volume mount"

# Test 2: Standalone container (if not in quick mode)
if [ "$QUICK_TEST" = "false" ]; then
  echo ""
  echo "=== Test 2: Standalone Container Test ==="
  echo "Starting standalone container..."
  docker run -d -p 3011:3000 --name modbus2mqtt-test-standalone "$IMAGE_TAG"

  if ! wait_for_service 3011 "Standalone web service" "modbus2mqtt-test-standalone"; then
    cleanup_containers_or_keep
    exit 1
  fi

  echo "✓ Test 2 passed: Standalone container"
fi

cleanup_containers_or_keep

echo ""
echo "=== All Tests Passed ==="
echo "✓ Docker image works correctly"
echo "✓ Web service accessible"
if [ "$QUICK_TEST" = "false" ]; then
  echo "✓ Standalone mode works"
fi
