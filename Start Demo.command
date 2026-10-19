#!/bin/zsh
cd "$(dirname "$0")" || exit 1
if ! command -v python3 >/dev/null 2>&1; then
  echo 'Python 3 is required. Install Python 3, then open this launcher again.'
  read -r '?Press Return to close.'
  exit 1
fi
exec python3 launch.py "$@"
