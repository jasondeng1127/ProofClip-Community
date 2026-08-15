[CmdletBinding()]
param(
  [switch]$IncludeUntracked
)

$repositoryRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
$gitRoot = (Resolve-Path -LiteralPath ((& git -C $repositoryRoot rev-parse --show-toplevel).Trim())).Path
if ($LASTEXITCODE -ne 0 -or $gitRoot -ne $repositoryRoot) {
  throw 'verify-public-source.ps1 must run inside the ProofClip Community repository root.'
}

$gitArgs = @('-c', 'core.quotePath=false', 'ls-files')
if ($IncludeUntracked) {
  $gitArgs += @('--cached', '--others', '--exclude-standard')
}
$trackedFiles = & git -C $repositoryRoot @gitArgs
if ($LASTEXITCODE -ne 0) { throw 'Unable to enumerate repository files.' }

$forbiddenPathPatterns = @(
  '(^|/)wrangler\.jsonc$',
  '(^|/)\.dev\.vars(?:\.(?!example$).+)?$',
  '(^|/)\.env(?:\.(?!example$).+)?$',
  '(^|/)\.wrangler/',
  '\.(pem|key|zip|sha256)$',
  '(^|/)(secrets|runtime-evidence|profiles|browser-profile)/'
)
$forbiddenValues = @(
  ('jasondeng1127' + '.workers.dev'),
  ('njofficpnkclkk' + 'gjehomcndibkibomid'),
  ('480e0bcb-817a-' + '47fe-8515-06eb10ceccc6'),
  ('bbf487f7c83efe' + '64a8c967e446902082'),
  ('MIIBIjANBgkqhki' + 'G9w0BAQEFAAOCAQ8A'),
  ('jasondeng1127' + '@gmail.com')
)
$forbiddenSecretPattern = '-----BEGIN (?:RSA |EC )?PRIVATE KEY-----'
$failures = [System.Collections.Generic.List[string]]::new()

foreach ($relativeFile in $trackedFiles) {
  $normalized = $relativeFile.Replace('\\', '/')
  if ($normalized -match '(^|/)audit/') {
    continue
  }
  if ($forbiddenPathPatterns | Where-Object { $normalized -match $_ }) {
    $failures.Add("forbidden file path: $normalized")
    continue
  }
  $absoluteFile = Join-Path $repositoryRoot $relativeFile
  if (-not (Test-Path -LiteralPath $absoluteFile -PathType Leaf)) {
    $failures.Add("tracked file missing: $normalized")
    continue
  }
  $content = [System.IO.File]::ReadAllText($absoluteFile)
  foreach ($value in $forbiddenValues) {
    if ($content.Contains($value, [System.StringComparison]::OrdinalIgnoreCase)) {
      $failures.Add("forbidden deployment identity in: $normalized")
    }
  }
  if ($content -match $forbiddenSecretPattern) {
    $failures.Add("private key material in: $normalized")
  }
}

# Community commercial-boundary scan (A5): product source must be free of
# commercial facilities, official identities and quota UI. Runs on the
# extension/ and worker/ roots of this repository.
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  $failures.Add('node is required for the Community commercial-boundary scan but was not found on PATH')
} else {
  $scanner = Join-Path $repositoryRoot 'release\verify-generated-tree.mjs'
  $scanOutput = & node $scanner --tree $repositoryRoot --repo 2>&1
  if ($LASTEXITCODE -ne 0) {
    $failures.Add('commercial-boundary scan failed: ' + (($scanOutput | Out-String).Trim()))
  }
}

if ($failures.Count -gt 0) {
  $failures | ForEach-Object { Write-Error $_ }
  exit 1
}

Write-Output "Public-source verification passed for $($trackedFiles.Count) file(s) (commercial-boundary scan included)."
