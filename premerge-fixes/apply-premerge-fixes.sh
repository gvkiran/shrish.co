#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# apply-premerge-fixes.sh
# Applies the pre-merge hardening fixes to the shrish.co dev line.
#
# What it does (nothing is pushed or deployed for you):
#   1. Clears any stale .git/index.lock and prunes abandoned worktrees.
#   2. Creates/updates a branch off the latest origin/developement.
#   3. Applies 3 reviewed code patches (price fix, Maps-key config, refund rule).
#   4. Adds .gitattributes (stops the CRLF phantom-diff noise).
#   5. Bumps data.js / main.js cache-bust ?v= strings site-wide.
#   6. Stages everything and shows the diff to REVIEW before you commit.
#
# Run from the repo root (D:/GitRepo/GitHub/shrish.co):
#     bash ./premerge-fixes/apply-premerge-fixes.sh
#
# Your local 'developement' is checked out in a leftover Codex worktree, so it
# can't be checked out here directly. This uses a clean branch off
# origin/developement instead; you merge it into developement at the end.
# The script STOPS before committing. Nothing is force-pushed.
# ---------------------------------------------------------------------------
set -euo pipefail

BRANCH="${BRANCH:-premerge-hardening}"
CACHE_TAG="${CACHE_TAG:-premerge-20260702}"

[ -d .git ] || { echo "ERROR: run from the repo root (D:/GitRepo/GitHub/shrish.co)"; exit 1; }
[ -d premerge-fixes ] || { echo "ERROR: premerge-fixes/ not found next to this script"; exit 1; }

echo ">> Repo: $(pwd)"

# 1. Clear stale lock + prune abandoned worktrees ----------------------------
if [ -f .git/index.lock ]; then
  echo ">> Removing stale .git/index.lock"
  rm -f .git/index.lock
fi
git worktree prune
git fetch origin

# Stash TRACKED changes only (CRLF noise / WIP). Untracked stays so premerge-fixes/ survives.
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo ">> Stashing tracked changes (recover later with: git stash pop)"
  git stash push -m "pre-premerge-autostash" >/dev/null
fi

# 2. Branch off the latest dev tip -------------------------------------------
echo ">> Creating branch '$BRANCH' from origin/developement"
git checkout -B "$BRANCH" origin/developement

# 3. Apply the code patches (check first, abort on any failure) ---------------
PATCHES=(
  "premerge-fixes/patches/functions_index.js.patch"
  "premerge-fixes/patches/assets_js_order-firebase.js.patch"
  "premerge-fixes/patches/firestore.rules.patch"
)
for p in "${PATCHES[@]}"; do
  echo ">> Checking patch: $p"
  git apply --check -p1 "$p"
done
for p in "${PATCHES[@]}"; do
  git apply -p1 "$p"
  echo ">> Applied: $p"
done

# 4. .gitattributes -----------------------------------------------------------
cp premerge-fixes/dot-gitattributes .gitattributes
echo ">> Wrote .gitattributes"

# 5. Cache-bust data.js / main.js across all HTML ----------------------------
count=0
while IFS= read -r -d '' f; do
  if grep -qE '(data|main)\.js\?v=' "$f"; then
    sed -i -E "s#(data|main)\.js\?v=[^\"']*#\1.js?v=${CACHE_TAG}#g" "$f"
    count=$((count+1))
  fi
done < <(find . -type f -name '*.html' -not -path './node_modules/*' -not -path './archive/*' -print0)
echo ">> Cache-bust updated in $count HTML file(s) -> ?v=$CACHE_TAG"

# 6. Stage + show review ------------------------------------------------------
git add -A
# Keep the premerge-fixes scaffolding out of the commit (it's tooling, not site code).
git reset -q -- premerge-fixes 2>/dev/null || true

echo
echo "================ REVIEW (staged changes) ================"
git --no-pager diff --cached --stat
cat <<EOF

Nothing has been committed yet. Review the diff above (git diff --cached).
When you are happy:

    git commit -m "Harden checkout before prod: server-side Stripe pricing, refund_requests rule, Firebase Maps-key config, cache-bust, .gitattributes"

Then get it onto developement + prod (see premerge-fixes/DEPLOYMENT.md), e.g.:

    git push -u origin $BRANCH
    # merge $BRANCH -> developement (in your dev worktree or via GitHub),
    # deploy functions + rules, TEST in dev, then merge developement -> main.

If you stashed WIP, recover it later with:  git stash list  /  git stash pop
EOF
