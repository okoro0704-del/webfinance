# Reliable Windows -> Netlify deploy for the Next.js dashboard.
# Avoids two known failure modes:
# 1) netlify build && netlify deploy drops the plugin's /_next static layout
# 2) Windows-built handler paths ('\var\task\...') break on Linux

$ErrorActionPreference = "Continue"
$repoRoot = Split-Path $PSScriptRoot -Parent
Set-Location $repoRoot

Write-Host "==> netlify build"
npx netlify build
# Plugin often errors on "Failed publishing static content" during local Windows builds.
# Artifacts under apps/dashboard/.netlify are still usable if static/_next exists.

$staticDir = Join-Path $repoRoot "apps\dashboard\.netlify\static"
$cssGlob = Join-Path $staticDir "_next\static\css\*.css"
if (-not (Test-Path $staticDir) -or -not (Get-Item $cssGlob -ErrorAction SilentlyContinue)) {
  Write-Error "Missing .netlify/static/_next/static/css after build. Aborting."
  exit 1
}

Write-Host "==> patch Windows handler paths"
& (Join-Path $PSScriptRoot "patch-netlify-windows-paths.ps1")
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$fn = (Resolve-Path (Join-Path $repoRoot "apps\dashboard\.netlify\functions-internal")).Path
$dir = (Resolve-Path $staticDir).Path

Write-Host "==> deploy (dir=$dir)"
npx netlify deploy --prod --no-build --dir="$dir" --functions="$fn" --skip-functions-cache
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Done. Verify https://webfinance.app/_next/static/css/ loads with 200."
