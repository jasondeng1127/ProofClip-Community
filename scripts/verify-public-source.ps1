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
$manifestPath = Join-Path $repositoryRoot 'extension/src/manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  throw 'Community manifest is required for public-source identity verification.'
}
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$stablePublicKey = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAoE6clBamwq6eJy+8TWYYbrDkUwCOB8b0X3sN7y67BY/qfHsNEgSNgLRsdE7EK+kaQRI1hr0cCRizkmDypEpEuL3YqNsgXI2nZMJjO9uRKirPLhi78vWybVc1EDVhl6gGqftg6rbWPHvlhx2SCMoUknpZ7q+d5eM0TPqF6F3SEFURA7SHyKTuSbTURrQbGfqkVwNukH5vWyojDKQW5Sk3r5ixI//5nxQOC+d5+rkutrd0hkZFEEus+Ty54Y/7u1CrVT7zjLH0Qw8xZ7ajnwHaZe2RFpVZMCPn+9y4EZvieXAmN/j048HPCEg0HFcTFTIfrGLRHGASorE8nPWcFb/AkQIDAQAB'
if ([string]$manifest.key -cne $stablePublicKey) {
  throw 'Community manifest public key does not match the committed stable public key.'
}
$forbiddenValues = @(
  ('jasondeng1127' + '.workers.dev'),
  ('njofficpnkclkk' + 'gjehomcndibkibomid'),
  ('480e0bcb-817a-' + '47fe-8515-06eb10ceccc6'),
  ('bbf487f7c83efe' + '64a8c967e446902082'),
  (('MIIBIjANBgkqh' + 'kiG9w0BAQEFAAOCAQ8AMIIBCgKCAQE') + ('Ap38/ucQBpWAS7SrcsZgu1auCseL2judE5wOuc+ezPZ61B0FsMP6G25jJuFfa6thfRkIW+dSEIwkxlq8zbu4ugz1trZQgqiyXMnGiJQV9Ohhz+m3okICFoKzL3xEnIsCAUWl7bZdoAK0jL6yl26MNCk57SCGOLlz+E48Sz3qy2otD03VxwYCZfo1b+/+YAFLJNEFJ7as4sdKkGPptOsqHpDu6+PcCe7fgB5IN5Wp1ponofnwAf6fFwjvuRlFdLSaprBqXo5WmJCe+76IkECO7f1CJVVlur8GXspgk2ZZZfk4cbqn9mtpZEiDJUp9PZFJ3Bt+U1VYyGbcfujdeavLbkwIDAQAB')),
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
  $scanContent = $content.Replace($stablePublicKey, '')
  foreach ($value in $forbiddenValues) {
    if ($scanContent.Contains($value, [System.StringComparison]::OrdinalIgnoreCase)) {
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
  $scanRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('proofclip-community-boundary-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $scanRoot -Force | Out-Null
  try {
    Copy-Item -LiteralPath (Join-Path $repositoryRoot 'extension') -Destination $scanRoot -Recurse
    Copy-Item -LiteralPath (Join-Path $repositoryRoot 'worker') -Destination $scanRoot -Recurse
    $scanManifest = Join-Path $scanRoot 'extension\src\manifest.json'
    $sanitizedManifest = [System.IO.File]::ReadAllText($scanManifest).Replace($stablePublicKey, '')
    [System.IO.File]::WriteAllText($scanManifest, $sanitizedManifest)
    $scanOutput = & node $scanner --tree $scanRoot --repo 2>&1
    if ($LASTEXITCODE -ne 0) {
      $failures.Add('commercial-boundary scan failed: ' + (($scanOutput | Out-String).Trim()))
    }
  } finally {
    Remove-Item -LiteralPath $scanRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}

if ($failures.Count -gt 0) {
  $failures | ForEach-Object { Write-Error $_ }
  exit 1
}

Write-Output "Public-source verification passed for $($trackedFiles.Count) file(s) (commercial-boundary scan included)."
