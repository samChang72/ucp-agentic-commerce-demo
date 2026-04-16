#!/usr/bin/env bash
# Usage: free-port.sh <port> [label]
#
# Kills any process LISTENing on <port> so a dev server / test runner can
# claim it cleanly. Prints a short note about what was killed (or that the
# port was already free). Safe to call with nothing listening — exits 0.
#
# Intended to be wired into npm `predev` / `pretest:e2e` hooks so repeated
# starts/restarts never fight over a stale dev server or an IDE preview.

set -euo pipefail

port="${1:?usage: free-port.sh <port> [label]}"
label="${2:-port ${port}}"

if ! command -v lsof >/dev/null 2>&1; then
  echo "[free-port] lsof not found; skipping cleanup for ${label}" >&2
  exit 0
fi

pids="$(lsof -ti tcp:"${port}" -sTCP:LISTEN 2>/dev/null || true)"

if [ -z "${pids}" ]; then
  echo "[free-port] ${label}: already free"
  exit 0
fi

echo "[free-port] ${label}: killing PID(s) ${pids}"
# TERM first, then KILL if they linger
for pid in ${pids}; do
  kill -TERM "${pid}" 2>/dev/null || true
done

# Give processes a moment to exit gracefully
for _ in 1 2 3 4 5; do
  sleep 0.2
  remain="$(lsof -ti tcp:"${port}" -sTCP:LISTEN 2>/dev/null || true)"
  [ -z "${remain}" ] && break
done

remain="$(lsof -ti tcp:"${port}" -sTCP:LISTEN 2>/dev/null || true)"
if [ -n "${remain}" ]; then
  echo "[free-port] ${label}: SIGTERM ignored, sending SIGKILL to ${remain}"
  for pid in ${remain}; do
    kill -KILL "${pid}" 2>/dev/null || true
  done
fi

echo "[free-port] ${label}: cleared"
