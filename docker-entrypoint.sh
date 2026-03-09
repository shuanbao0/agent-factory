#!/bin/sh
set -e

# Initialize config volume from defaults on first run
if [ -d /app/config-defaults ]; then
  for f in /app/config-defaults/*; do
    basename="$(basename "$f")"
    target="/app/config/$basename"
    if [ ! -e "$target" ]; then
      cp -r "$f" "$target"
      echo "Initialized config/$basename from defaults"
    fi
  done
fi

# Ensure data directories exist
mkdir -p /app/agents /app/workspaces /app/projects /app/templates/custom

exec node scripts/start.mjs
