$appPort = 3217
$appDirectory = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $appDirectory ".wrangler\job-tracker.pid"

if (Test-Path -LiteralPath $pidFile) {
  $processId = Get-Content -LiteralPath $pidFile -ErrorAction SilentlyContinue
  if ($processId) {
    Stop-Process -Id ([int]$processId) -Force -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}
