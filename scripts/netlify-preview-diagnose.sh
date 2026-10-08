#!/usr/bin/env bash
set -u

TMP_LOG="/tmp/healthwallet-netlify-build-diagnostic.txt"
: > "$TMP_LOG"

write_fallback() {
  mkdir -p dist
  cp "$TMP_LOG" dist/__build_diagnostic.txt
  cat > dist/index.html <<'HTML'
<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>HealthWallet Preview Diagnostic</title></head>
<body><h1>HealthWallet Deploy Preview diagnostic</h1><p>See /__build_diagnostic.txt</p></body>
</html>
HTML
}

echo "diagnostic_version=1" >> "$TMP_LOG"
echo "node=$(node --version 2>&1)" >> "$TMP_LOG"
echo "pnpm=$(pnpm --version 2>&1)" >> "$TMP_LOG"

echo "phase=project_install" >> "$TMP_LOG"
pnpm install --prefer-offline >> "$TMP_LOG" 2>&1
INSTALL_EXIT=$?
echo "project_install_exit=$INSTALL_EXIT" >> "$TMP_LOG"
if [ "$INSTALL_EXIT" -ne 0 ]; then
  write_fallback
  exit 0
fi

rm -rf node_modules/.vite-temp

echo "phase=typescript" >> "$TMP_LOG"
pnpm exec tsc -b --pretty false >> "$TMP_LOG" 2>&1
TSC_EXIT=$?
echo "typescript_exit=$TSC_EXIT" >> "$TMP_LOG"
if [ "$TSC_EXIT" -ne 0 ]; then
  write_fallback
  exit 0
fi

echo "phase=vite" >> "$TMP_LOG"
pnpm exec vite build >> "$TMP_LOG" 2>&1
VITE_EXIT=$?
echo "vite_exit=$VITE_EXIT" >> "$TMP_LOG"
if [ "$VITE_EXIT" -ne 0 ]; then
  write_fallback
  exit 0
fi

cp "$TMP_LOG" dist/__build_diagnostic.txt
exit 0
