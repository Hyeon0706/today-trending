#!/usr/bin/env bash
# Commits the built report and pushes it to GitHub Pages. Usage: scripts/publish.sh YYYY-MM-DD
set -euo pipefail
cd "$(dirname "$0")/.."
git add index.html reports data assets scripts README.md .gitignore .nojekyll
if git diff --cached --quiet; then
  echo "Nothing to publish"
  exit 0
fi
git commit -m "Add trending report for $1" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
GIT_TERMINAL_PROMPT=0 git push origin main
