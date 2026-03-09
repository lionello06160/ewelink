#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-ben@pi-home}"
REMOTE_DIR="${REMOTE_DIR:-/home/ben/ewelink}"
SYNC_ENV_LOCAL="${SYNC_ENV_LOCAL:-0}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${REPO_ROOT}"

rsync -az \
  --progress \
  --exclude='.DS_Store' \
  --exclude='data/config.json' \
  --exclude='log/' \
  --exclude='node_modules/' \
  src \
  public \
  package.json \
  package-lock.json \
  next.config.ts \
  next-env.d.ts \
  postcss.config.mjs \
  tsconfig.json \
  .gitignore \
  README.md \
  "${REMOTE_HOST}:${REMOTE_DIR}/"

if [[ "${SYNC_ENV_LOCAL}" == "1" ]]; then
  rsync -az --progress "${REPO_ROOT}/.env.local" "${REMOTE_HOST}:${REMOTE_DIR}/.env.local"
fi

ssh "${REMOTE_HOST}" "test -f '${REMOTE_DIR}/.env.local' && echo ENV_OK; test -f '${REMOTE_DIR}/data/config.json' && echo CONFIG_OK; cd '${REMOTE_DIR}' && npm install && npm run build && pm2 restart ewelink --update-env && pm2 status ewelink"
