param(
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

$appDirectory = Split-Path -Parent $PSScriptRoot
$appPort = 3217
$pidFile = Join-Path $appDirectory ".wrangler\job-tracker.pid"
$codexNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$systemNode = Get-Command node -ErrorAction SilentlyContinue

function Test-AppPort {
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $task = $client.ConnectAsync("127.0.0.1", $appPort)
    return $task.Wait(300) -and $client.Connected
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

if (Test-Path -LiteralPath $codexNode) {
  $nodeExecutable = $codexNode
} elseif ($systemNode) {
  $nodeExecutable = $systemNode.Source
} else {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show(
    "Node.js 22 or newer is required.",
    "Offerget could not start",
    "OK",
    "Error"
  ) | Out-Null
  exit 1
}

Set-Location -LiteralPath $appDirectory
$env:WRANGLER_LOG_PATH = ".wrangler\wrangler.log"

if (-not (Test-Path -LiteralPath (Join-Path $appDirectory "dist\server\index.js"))) {
  & $nodeExecutable "node_modules\vinext\dist\cli.js" build
  if ($LASTEXITCODE -ne 0) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show(
      "The local build failed. Please try again.",
      "Offerget could not start",
      "OK",
      "Error"
    ) | Out-Null
    exit 1
  }
}

if (-not (Test-AppPort)) {
  $arguments = "`"node_modules\vinext\dist\cli.js`" start --host 127.0.0.1 --port $appPort"
  $processInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $processInfo.FileName = $nodeExecutable
  $processInfo.Arguments = $arguments
  $processInfo.WorkingDirectory = $appDirectory
  $processInfo.UseShellExecute = $true
  $processInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Minimized
  $process = [System.Diagnostics.Process]::Start($processInfo)
  if (-not $process) { throw "Local server failed to start." }
  Set-Content -LiteralPath $pidFile -Value $process.Id -Encoding ascii

  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    if (Test-AppPort) {
      break
    }
    Start-Sleep -Milliseconds 250
  }
}

if (-not (Test-AppPort)) {
  throw "Local server did not become ready."
}

if (-not $NoBrowser) {
  & explorer.exe "http://localhost:$appPort/"
}
