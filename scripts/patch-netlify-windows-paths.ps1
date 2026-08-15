# Patches Windows-built Netlify Next handler paths so they work on Linux.
# Root cause: '\var\task\...' is parsed as JS escapes (\v, \t) on Linux.

$handlerRoot = Join-Path $PSScriptRoot "apps\dashboard\.netlify\functions-internal"
if (-not (Test-Path $handlerRoot)) {
  Write-Error "No Netlify functions build found at $handlerRoot. Run netlify build first."
  exit 1
}

$files = Get-ChildItem -Path $handlerRoot -Recurse -Include *.mjs,*.js,*.cjs,*.json
$patched = 0
foreach ($f in $files) {
  $text = [System.IO.File]::ReadAllText($f.FullName)
  $orig = $text
  # Fix the classic broken absolute task paths
  $text = $text -replace "\\\\var\\\\task", "/var/task"
  $text = $text -replace "\\var\\task", "/var/task"
  $text = $text -replace "'\\var\\task", "'/var/task"
  $text = $text -replace '"\\var\\task', '"/var/task'
  # Normalize remaining backslash path segments inside /var/task imports
  $text = [regex]::Replace($text, "(['`"])/var/task([^'`"]*)\1", {
    param($m)
    $q = $m.Groups[1].Value
    $path = $m.Groups[2].Value -replace "\\", "/"
    return "$q/var/task$path$q"
  })
  if ($text -ne $orig) {
    [System.IO.File]::WriteAllText($f.FullName, $text)
    $patched++
    Write-Host "patched $($f.FullName)"
  }
}
Write-Host "Patched $patched files"
