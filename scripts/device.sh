#!/usr/bin/env bash
# Drive a real Android phone from this laptop. See docs/DEVICE.md.
#
#   ./scripts/device.sh build    first time, or after a native change: compile + install the APK
#   ./scripts/device.sh run      every other time: metro + launch the app on the phone (JS only)
#   ./scripts/device.sh logs     follow the app's logs from the phone
#   ./scripts/device.sh doctor   check the phone is visible and set up
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$ROOT/app"
PKG="com.arthur.flam.sivoov.dev"

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export JAVA_HOME="${JAVA_HOME:-$(/usr/libexec/java_home -v 17 2>/dev/null || true)}"
export PATH="$ANDROID_HOME/platform-tools:$PATH"

# The dev build always talks to preview, never production.
export APP_VARIANT=development
export EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-https://preview.run.sivoov.app}"

need_device() {
  local n
  n="$(adb devices | awk 'NR>1 && $2=="device"' | wc -l | tr -d ' ')"
  if [ "$n" = "0" ]; then
    echo "No phone visible to adb." >&2
    echo "  1. Settings > About phone > tap 'Build number' 7 times" >&2
    echo "  2. Settings > System > Developer options > USB debugging ON" >&2
    echo "  3. Plug the phone in, then accept 'Allow USB debugging' on its screen" >&2
    adb devices -l >&2
    exit 1
  fi
}

case "${1:-run}" in
  build)
    need_device
    cd "$APP"
    npx expo run:android --device
    ;;

  apk)
    # Compile only, no phone needed. Leaves the APK path on stdout.
    cd "$APP"
    [ -d android ] || npx expo prebuild --platform android
    (cd android && ./gradlew assembleDebug --console=plain)
    ls "$APP/android/app/build/outputs/apk/debug/"*.apk
    ;;

  install)
    need_device
    APKS=("$APP"/android/app/build/outputs/apk/debug/*.apk)
    adb install -r "${APKS[0]}"
    ;;

  run)
    need_device
    # Let the phone reach metro and the local Worker over USB.
    adb reverse tcp:8081 tcp:8081 >/dev/null
    adb reverse tcp:8788 tcp:8788 >/dev/null || true
    adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
    cd "$APP"
    npx expo start --dev-client
    ;;

  logs)
    need_device
    adb logcat -v time ReactNativeJS:V ReactNative:V ExpoModulesCore:V "*:S"
    ;;

  doctor)
    echo "ANDROID_HOME=$ANDROID_HOME"
    echo "JAVA_HOME=$JAVA_HOME"
    echo "API=$EXPO_PUBLIC_API_URL"
    adb devices -l
    echo "--- installed?"
    adb shell pm list packages | grep -q "$PKG" && echo "$PKG installed" || echo "$PKG NOT installed (run: ./scripts/device.sh build)"
    echo "--- battery optimisation (must be 'not optimized' for background runs):"
    adb shell dumpsys deviceidle whitelist 2>/dev/null | grep -q "$PKG" && echo "exempt" || echo "NOT exempt — see docs/DEVICE.md"
    ;;

  *)
    sed -n '2,9p' "$0"; exit 1;;
esac
