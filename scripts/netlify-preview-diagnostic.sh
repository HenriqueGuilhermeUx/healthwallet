#!/usr/bin/env bash
set +e

mkdir -p dist
LOG_FILE="/tmp/netlify-preview-build.log"

{
  echo "=== NETLIFY PREVIEW DIAGNOSTIC ==="
  echo "node=$(node --version 2>&1)"
  echo "pnpm=$(pnpm --version 2>&1)"
  echo "pwd=$(pwd)"
  echo "context=${CONTEXT:-}"
  echo "branch=${BRANCH:-}"
  echo "commit=${COMMIT_REF:-}"
  echo "=== PNPM BUILD ==="
  pnpm build
  BUILD_EXIT=$?
  echo "=== BUILD EXIT: ${BUILD_EXIT} ==="
  exit ${BUILD_EXIT}
} >"${LOG_FILE}" 2>&1

BUILD_EXIT=$?
mkdir -p dist
cp "${LOG_FILE}" dist/netlify-build-diagnostic.txt

if [ ! -f dist/index.html ]; then
  cat > dist/index.html <<'HTML'
<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>HealthWallet Preview Diagnostic</title></head>
<body><h1>HealthWallet Deploy Preview diagnostic</h1><p>See /netlify-build-diagnostic.txt</p></body></html>
HTML
fi

echo "${BUILD_EXIT}" > dist/netlify-build-exit-code.txt

# Diagnostic deploy must publish even when the real build fails.
exit 0
