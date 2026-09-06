#!/usr/bin/env sh

set -u

if [ "$#" -ne 0 ]; then
  printf '%s\n' 'This deployment wrapper does not accept positional arguments.' >&2
  exit 2
fi

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
WRANGLER_PATH="$SCRIPT_DIR/node_modules/.bin/wrangler"

if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' 'Node.js is required and was not found on PATH.' >&2
  exit 127
fi

if ! command -v npm >/dev/null 2>&1; then
  printf '%s\n' 'npm is required and was not found on PATH.' >&2
  exit 127
fi

if [ ! -e "$WRANGLER_PATH" ]; then
  (
    cd "$REPO_ROOT" || exit 1
    npm ci --prefix deploy --no-audit --no-fund
  )
  install_status=$?
  if [ "$install_status" -ne 0 ]; then
    exit "$install_status"
  fi
fi

cd "$REPO_ROOT" || exit 1
node deploy/deploy-core.mjs --env deploy/deploy.env
exit $?
