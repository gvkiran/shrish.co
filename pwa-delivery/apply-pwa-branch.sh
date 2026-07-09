#!/usr/bin/env bash
# Apply the feature/pwa branch from the bundle — SAFE: does not touch your
# working tree or any existing branch. Run from the repo root in Git Bash.
set -e
cd "$(dirname "$0")/.."

echo "Current branch: $(git branch --show-current)"

# Import the branch from the bundle (no checkout, no file changes)
git fetch pwa-delivery/feature-pwa.bundle feature/pwa:feature/pwa

echo ""
echo "Branch feature/pwa created (based on origin/main)."
echo ""
echo "Review first:"
echo "  git diff origin/main..feature/pwa --stat"
echo "  git show feature/pwa --stat"
echo ""
echo "Then test/push:"
echo "  git checkout feature/pwa"
echo "  git push -u origin feature/pwa"
