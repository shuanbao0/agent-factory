#!/bin/sh
set -e

# Initialize config volume from defaults on first run
if [ -d /app/config-defaults ]; then
  mkdir -p /app/data/config
  for f in /app/config-defaults/*; do
    basename="$(basename "$f")"
    target="/app/data/config/$basename"
    if [ ! -e "$target" ]; then
      cp -r "$f" "$target"
      echo "Initialized data/config/$basename from defaults"
    fi
  done
fi

# Ensure data directories exist
mkdir -p /app/data/agents /app/data/workspaces /app/data/projects /app/data/departments /app/data/config /app/data/logs /app/data/openclaw-state /app/data/templates/agents/custom /app/data/templates/departments/custom

exec node scripts/runtime/start.mjs
