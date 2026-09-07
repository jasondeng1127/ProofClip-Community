#!/usr/bin/env sh

set -u

if [ "$#" -ne 0 ]; then
  printf '%s\n' 'This deployment wrapper does not accept positional arguments.' >&2
  exit 2
fi

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
CANDIDATE_NAME=$(basename -- "$REPO_ROOT")
RUNTIME_ROOT="$(dirname -- "$REPO_ROOT")/.${CANDIDATE_NAME}-deploy-runtime"
WRANGLER_PATH="$RUNTIME_ROOT/node_modules/.bin/wrangler"
NPM_CACHE_PATH="$RUNTIME_ROOT/npm-cache"

if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' 'Node.js is required and was not found on PATH.' >&2
  exit 127
fi

if ! command -v npm >/dev/null 2>&1; then
  printf '%s\n' 'npm is required and was not found on PATH.' >&2
  exit 127
fi

mkdir -p "$RUNTIME_ROOT" || exit 1
cp "$REPO_ROOT/deploy/package.json" "$RUNTIME_ROOT/package.json" || exit 1
cp "$REPO_ROOT/deploy/package-lock.json" "$RUNTIME_ROOT/package-lock.json" || exit 1
(
  cd "$RUNTIME_ROOT" || exit 1
  npm ci --prefix "$RUNTIME_ROOT" --cache "$NPM_CACHE_PATH" --no-audit --no-fund
)
install_status=$?
if [ "$install_status" -ne 0 ]; then
  exit "$install_status"
fi

cd "$REPO_ROOT" || exit 1
node deploy/deploy-core.mjs --env deploy/deploy.env
exit $?
