<#
  apply-premerge-fixes.ps1
  ------------------------------------------------------------------
  Applies the pre-merge hardening fixes to the shrish.co dev line.

  What it does (nothing is pushed or deployed for you):
    1. Clears any stale .git\index.lock and prunes abandoned worktrees.
    2. Creates/updates a branch off the latest origin/developement.
    3. Applies 3 reviewed code patches (price fix, Maps-key config, refund rule).
    4. Adds .gitattributes (stops the CRLF phantom-diff noise).
    5. Bumps data.js / main.js cache-bust ?v= strings site-wide.
    6. Stages everything and shows you the diff to review BEFORE committing.

  Run from the repo root:  D:\GitRepo\GitHub\shrish.co
      powershell -ExecutionPolicy Bypass -File .\premerge-fixes\apply-premerge-fixes.ps1

  Notes:
    - Your local 'developement' is checked out in a leftover Codex worktree, so
      it can't be checked out directly here. This script uses a clean branch off
      origin/developement instead; you merge it into developement at the end.
    - The script STOPS before committing so you can review. Nothing is force-pushed.
#>

[CmdletBinding()]
param(
    [string]$Branch    = "premerge-hardening",
    [string]$CacheTag  = "premerge-20260702"
)

$ErrorActionPreference = "Stop"
$repo = (Get-Location).Path
Write-Host "Repo: $repo" -ForegroundColor Cyan

if (-not (Test-Path ".git")) { throw "Run this from the repo root (D:\GitRepo\GitHub\shrish.co)." }
$fixes = Join-Path $repo "premerge-fixes"
if (-not (Test-Path $fixes)) { throw "premerge-fixes folder not found next to this script." }

# 1. Clear stale lock + prune abandoned worktrees ------------------------------
if (Test-Path ".git\index.lock") {
    Write-Host "Removing stale .git\index.lock" -ForegroundColor Yellow
    Remove-Item ".git\index.lock" -Force
}
git worktree prune
git fetch origin

# Stash TRACKED changes only (the CRLF noise, or real WIP) so the checkout is clean.
# We deliberately do NOT stash untracked files, so the premerge-fixes/ folder
# (patches this script needs) stays in place.
$dirty = git status --porcelain --untracked-files=no
if ($dirty) {
    Write-Host "Stashing tracked working-tree changes (recover later with: git stash pop)" -ForegroundColor Yellow
    git stash push -m "pre-premerge-autostash" | Out-Null
}

# 2. Branch off the latest dev tip ---------------------------------------------
Write-Host "Creating branch '$Branch' from origin/developement" -ForegroundColor Cyan
git checkout -B $Branch origin/developement

# 3. Apply the code patches (check first, abort on any failure) -----------------
$patches = @(
    "premerge-fixes\patches\functions_index.js.patch",
    "premerge-fixes\patches\assets_js_order-firebase.js.patch",
    "premerge-fixes\patches\firestore.rules.patch"
)
foreach ($p in $patches) {
    Write-Host "Checking patch: $p" -ForegroundColor DarkCyan
    git apply --check -p1 $p
}
foreach ($p in $patches) {
    git apply -p1 $p
    Write-Host "Applied: $p" -ForegroundColor Green
}

# 4. .gitattributes -------------------------------------------------------------
Copy-Item (Join-Path $fixes "dot-gitattributes") (Join-Path $repo ".gitattributes") -Force
Write-Host "Wrote .gitattributes" -ForegroundColor Green

# 5. Cache-bust data.js / main.js across all HTML ------------------------------
$pattern = '(data|main)\.js\?v=[^"'']*'
$replace = "`$1.js?v=$CacheTag"
$changed = 0
Get-ChildItem -Path $repo -Recurse -Filter *.html |
    Where-Object { $_.FullName -notmatch '\\node_modules\\' -and $_.FullName -notmatch '\\archive\\' } |
    ForEach-Object {
        $c = Get-Content $_.FullName -Raw
        $n = [regex]::Replace($c, $pattern, $replace)
        if ($n -ne $c) { Set-Content -Path $_.FullName -Value $n -NoNewline; $changed++ }
    }
Write-Host "Cache-bust updated in $changed HTML file(s) -> ?v=$CacheTag" -ForegroundColor Green

# 6. Stage + show review --------------------------------------------------------
git add -A
# Keep the premerge-fixes scaffolding (patches, runbook, reference copies) OUT of
# the commit — it's tooling, not site code.
git reset -q -- premerge-fixes 2>$null
Write-Host "`n================ REVIEW (staged changes) ================" -ForegroundColor Cyan
git diff --cached --stat
Write-Host @"

Nothing has been committed yet. Review the diff above (and 'git diff --cached').
When you are happy:

    git commit -m "Harden checkout before prod: server-side Stripe pricing, refund_requests rule, Firebase Maps-key config, cache-bust, .gitattributes"

Then get it onto developement and prod (see premerge-fixes\DEPLOYMENT.md), e.g.:

    git push -u origin $Branch
    # merge $Branch -> developement (locally in your dev worktree, or via GitHub),
    # deploy functions + rules, TEST in dev, then merge developement -> main.

If you stashed WIP, recover it later with:  git stash list  /  git stash pop
"@ -ForegroundColor Yellow
