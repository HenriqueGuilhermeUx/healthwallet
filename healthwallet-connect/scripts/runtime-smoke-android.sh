#!/usr/bin/env bash
set -euo pipefail

PACKAGE="br.com.healthwallet.connect"
ACTIVITY="${PACKAGE}/.MainActivity"
APK="android/app/build/outputs/apk/debug/app-debug.apk"
DIAG_DIR="android/runtime-smoke"

mkdir -p "$DIAG_DIR"

echo "== HealthWallet Connect Android runtime smoke =="
echo "APK: $APK"
echo "Package: $PACKAGE"

test -f "$APK" || { echo "APK not found: $APK"; exit 1; }

adb wait-for-device
adb shell getprop sys.boot_completed | tr -d '\r' | grep -q '^1$' || {
  echo "Android emulator is not fully booted"
  exit 1
}

adb install -r "$APK"
adb logcat -c || true
adb shell am force-stop "$PACKAGE" || true

START_OUTPUT="$(adb shell am start -W -n "$ACTIVITY" 2>&1 | tr -d '\r')"
printf '%s\n' "$START_OUTPUT" | tee "$DIAG_DIR/am-start.txt"

if printf '%s\n' "$START_OUTPUT" | grep -Eqi 'Error:|Exception|does not exist|unable to resolve'; then
  echo "MainActivity failed to start"
  exit 1
fi

sleep 8

PID="$(adb shell pidof -s "$PACKAGE" 2>/dev/null | tr -d '\r' || true)"
echo "PID=$PID" | tee "$DIAG_DIR/process.txt"
if [ -z "$PID" ]; then
  adb logcat -d -v threadtime > "$DIAG_DIR/logcat.txt" || true
  echo "HealthWallet Connect process is not alive after startup"
  exit 1
fi

adb shell uiautomator dump /sdcard/healthwallet-connect-window.xml >/dev/null 2>&1 || true
adb pull /sdcard/healthwallet-connect-window.xml "$DIAG_DIR/window.xml" >/dev/null 2>&1 || true
adb exec-out screencap -p > "$DIAG_DIR/startup.png" || true
adb logcat -d -v threadtime > "$DIAG_DIR/logcat.txt" || true
adb shell dumpsys activity activities > "$DIAG_DIR/activities.txt" || true

if [ -f "$DIAG_DIR/window.xml" ] && grep -Eqi 'requires a webview|webview to work' "$DIAG_DIR/window.xml"; then
  echo "Capacitor WebView fallback screen detected"
  exit 1
fi

if grep -Eqi 'this app requires a webview to work|failed to create.*webview|unable to start activity.*br\.com\.healthwallet\.connect' "$DIAG_DIR/logcat.txt"; then
  echo "WebView/startup failure detected in logcat"
  exit 1
fi

if ! grep -q "$PACKAGE" "$DIAG_DIR/activities.txt"; then
  echo "HealthWallet Connect is not present in the active Android activity stack"
  exit 1
fi

echo "HealthWallet Connect started successfully without the Capacitor no-WebView fallback."
