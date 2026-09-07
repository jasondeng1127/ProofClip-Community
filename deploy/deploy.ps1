[CmdletBinding(PositionalBinding = $false)]
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $RemainingArguments
)

if ($null -ne $RemainingArguments -and $RemainingArguments.Count -gt 0) {
  [Console]::Error.WriteLine('This deployment wrapper does not accept positional arguments.')
  exit 2
}

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).ProviderPath
$candidateName = Split-Path -Leaf $repoRoot
$runtimeRoot = Join-Path (Split-Path -Parent $repoRoot) ".$candidateName-deploy-runtime"
$wranglerExecutable = if ($IsWindows) { 'wrangler.cmd' } else { 'wrangler' }
$wranglerPath = Join-Path $runtimeRoot "node_modules/.bin/$wranglerExecutable"
$npmCachePath = Join-Path $runtimeRoot 'npm-cache'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$npmCommand = Get-Command npm -ErrorAction SilentlyContinue

if ($null -eq $nodeCommand) {
  Write-Error 'Node.js is required and was not found on PATH.'
  exit 127
}

if ($null -eq $npmCommand) {
  Write-Error 'npm is required and was not found on PATH.'
  exit 127
}

$exitCode = 0
Push-Location -LiteralPath $repoRoot
try {
  if (-not (Test-Path -LiteralPath $wranglerPath -PathType Leaf)) {
    New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $repoRoot 'deploy/package.json') -Destination (Join-Path $runtimeRoot 'package.json') -Force
    Copy-Item -LiteralPath (Join-Path $repoRoot 'deploy/package-lock.json') -Destination (Join-Path $runtimeRoot 'package-lock.json') -Force
    Push-Location -LiteralPath $runtimeRoot
    try {
      npm ci --prefix $runtimeRoot --cache $npmCachePath --no-audit --no-fund
      $exitCode = $LASTEXITCODE
    } finally {
      Pop-Location
    }
  }

  if ($exitCode -eq 0) {
    node deploy/deploy-core.mjs --env deploy/deploy.env
    $exitCode = $LASTEXITCODE
  }
} finally {
  Pop-Location
}

exit $exitCode
