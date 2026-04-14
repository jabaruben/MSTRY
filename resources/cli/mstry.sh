#!/bin/bash
# Shell script to open MSTRY from the command line.
# Usage: mstry [path]
#   path  Directory to open (defaults to current directory)

APP_NAME="MSTRY"

# Resolve the target directory
if [ -n "$1" ]; then
  TARGET_DIR="$(cd "$1" 2>/dev/null && pwd)"
  if [ -z "$TARGET_DIR" ]; then
    echo "mstry: '$1' is not a valid directory" >&2
    exit 1
  fi
else
  TARGET_DIR="$(pwd)"
fi

# Find the app bundle
if [ -d "/Applications/${APP_NAME}.app" ]; then
  APP_PATH="/Applications/${APP_NAME}.app"
elif [ -d "$HOME/Applications/${APP_NAME}.app" ]; then
  APP_PATH="$HOME/Applications/${APP_NAME}.app"
else
  echo "mstry: ${APP_NAME}.app not found in /Applications or ~/Applications" >&2
  exit 1
fi

open -a "$APP_PATH" --args "--open-path" "$TARGET_DIR"
