# Apply the feature/pwa branch from the bundle — SAFE: does not touch your
# working tree or any existing branch. Run from anywhere in PowerShell.
#
# What it does:
#   1. Creates local branch feature/pwa (based on origin/main) from the bundle
#   2. Nothing else. You review, checkout, and push when ready.

$repo = "D:\GitRepo\GitHub\shrish.co"
Set-Location $repo

Write-Host "Current branch: " -NoNewline
git branch --show-current

# Import the branch from the bundle (no checkout, no file changes)
git fetch "$repo\pwa-delivery\feature-pwa.bundle" feature/pwa:feature/pwa
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED - branch may already exist. Delete with: git branch -D feature/pwa" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "Branch feature/pwa created (based on origin/main)." -ForegroundColor Green
Write-Host ""
Write-Host "Review the changes first:"
Write-Host "  git diff origin/main..feature/pwa --stat"
Write-Host "  git show feature/pwa --stat"
Write-Host ""
Write-Host "Then to test on Vercel preview / push:"
Write-Host "  git checkout feature/pwa"
Write-Host "  git push -u origin feature/pwa"
