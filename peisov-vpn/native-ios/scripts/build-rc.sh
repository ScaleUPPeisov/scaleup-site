#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

command -v xcodegen >/dev/null 2>&1 || {
  echo "xcodegen is required"
  exit 1
}

xcodegen generate --spec project.yml

BUILD_DIR="$ROOT/.build"
PACKAGES_DIR="$BUILD_DIR/SourcePackages"
DERIVED_DATA="$BUILD_DIR/DerivedData"
mkdir -p "$BUILD_DIR"

xcodebuild   -resolvePackageDependencies   -project PEISOVVPN.xcodeproj   -scheme PEISOVVPN   -clonedSourcePackagesDirPath "$PACKAGES_DIR"

WG_GO="$PACKAGES_DIR/checkouts/amneziawg-apple/Sources/WireGuardKitGo"
test -d "$WG_GO"

make -C "$WG_GO"   PLATFORM_NAME=iphoneos   ARCHS=arm64   SDKROOT="$(xcrun --sdk iphoneos --show-sdk-path)"   CONFIGURATION_BUILD_DIR="$WG_GO/out"   CONFIGURATION_TEMP_DIR="$WG_GO/.tmp"

xcodebuild   -project PEISOVVPN.xcodeproj   -scheme PEISOVVPN   -configuration Debug   -destination 'generic/platform=iOS'   -clonedSourcePackagesDirPath "$PACKAGES_DIR"   -derivedDataPath "$DERIVED_DATA"   CODE_SIGNING_ALLOWED=NO   CODE_SIGNING_REQUIRED=NO   DEVELOPMENT_TEAM=""   build

echo "PEISOV_NATIVE_IOS_RC_BUILD=PASS"
