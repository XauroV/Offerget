param(
  [string]$DestinationRoot
)

$ErrorActionPreference = "Stop"

$repository = Split-Path -Parent $PSScriptRoot
$source = Join-Path $repository "skills\offerget"

if (-not $DestinationRoot) {
  $codexRoot = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE ".codex" }
  $DestinationRoot = Join-Path $codexRoot "skills"
}

$destination = Join-Path $DestinationRoot "offerget"
New-Item -ItemType Directory -Path $DestinationRoot -Force | Out-Null
New-Item -ItemType Directory -Path $destination -Force | Out-Null
Copy-Item -Path (Join-Path $source "*") -Destination $destination -Recurse -Force

$referenceDirectory = Join-Path $destination "references"
New-Item -ItemType Directory -Path $referenceDirectory -Force | Out-Null
Set-Content -LiteralPath (Join-Path $referenceDirectory "repo-path.txt") -Value $repository -Encoding utf8

Write-Host "Offerget Skill installed at: $destination"
Write-Host "Repository linked at: $repository"
Write-Host "Open a new Codex task, then invoke `$offerget."
