[CmdletBinding()]
param(
  [switch]$IncludeUntracked
)

$repositoryRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
$gitRoot = (Resolve-Path -LiteralPath ((& git -C $repositoryRoot rev-parse --show-toplevel).Trim())).Path
if ($LASTEXITCODE -ne 0 -or $gitRoot -ne $repositoryRoot) {
  throw 'verify-public-source.ps1 must run inside the ProofClip Community repository root.'
}

$gitArgs = @('ls-files')
if ($IncludeUntracked) {
  $gitArgs += @('--cached', '--others', '--exclude-standard')
}
$trackedFiles = & git -C $repositoryRoot @gitArgs
if ($LASTEXITCODE -ne 0) { throw 'Unable to enumerate repository files.' }

$reachableCommits = & git -C $repositoryRoot rev-list HEAD
if ($LASTEXITCODE -ne 0) { throw 'Unable to enumerate commits reachable from HEAD.' }

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
$privateEmailPattern = '\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b'
$fixedWorkerOriginPattern = 'https://(?!<YOUR_WORKER_SUBDOMAIN>\.workers\.dev)[A-Za-z0-9][A-Za-z0-9.-]*\.workers\.dev(?=[/:?#"''\s]|$)'
$commercialEndpointPattern = ('/v1/' + '(?:lic' + 'ense(?:/[^\s"''`]+)?|usage/report|webhooks/' + 'lemon)')
$commercialModulePattern = ('(?:from\s+["'']\./|import\s*\(?\s*["'']\./|require\s*\(\s*["'']\./)(?:sub' + 'scription|lemon-' + 'license)\.mjs')
$secretAssignmentPattern = '(?im)^\s*(?:NOTION_CLIENT_ID|NOTION_CLIENT_SECRET|TOKEN_VAULT_KEY|PROOFCLIP_EXTENSION_ID)\s*=\s*(?!<[^>]+>\s*$)(?!\s*$).+$'
$sourceLikePattern = '\.(?:[cm]?js|ts|tsx|jsx|html|css|sql|ps1|json)$'
$failures = [System.Collections.Generic.List[string]]::new()

foreach ($relativeFile in $trackedFiles) {
  $normalized = $relativeFile.Replace('\\', '/')
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
  if ($content -match $privateEmailPattern) {
    $failures.Add("private email address in: $normalized")
  }
  if ($content -match $fixedWorkerOriginPattern) {
    $failures.Add("fixed Worker origin in: $normalized")
  }
  if ($content -match $secretAssignmentPattern) {
    $failures.Add("secret assignment in: $normalized")
  }
  if ($normalized -match $sourceLikePattern -and ($content -match $commercialEndpointPattern -or $content -match $commercialModulePattern)) {
    $failures.Add("executable commercial artifact in: $normalized")
  }
}

foreach ($commit in $reachableCommits) {
  $versionedFiles = & git -C $repositoryRoot ls-tree -r --name-only $commit
  if ($LASTEXITCODE -ne 0) { throw "Unable to enumerate files for reachable commit $commit." }
  foreach ($relativeFile in $versionedFiles) {
    $normalized = $relativeFile.Replace('\\', '/')
    if ($forbiddenPathPatterns | Where-Object { $normalized -match $_ }) {
      $failures.Add("forbidden file path in reachable commit ${commit}: $normalized")
      continue
    }
    $content = [string]::Join("`n", (& git -C $repositoryRoot show "${commit}:$relativeFile"))
    if ($LASTEXITCODE -ne 0) { throw "Unable to read $normalized from reachable commit $commit." }
    foreach ($value in $forbiddenValues) {
      if ($content.Contains($value, [System.StringComparison]::OrdinalIgnoreCase)) {
        $failures.Add("forbidden deployment identity in reachable commit ${commit}: $normalized")
      }
    }
    if ($content -match $forbiddenSecretPattern) {
      $failures.Add("private key material in reachable commit ${commit}: $normalized")
    }
    if ($content -match $privateEmailPattern) {
      $failures.Add("private email address in reachable commit ${commit}: $normalized")
    }
    if ($content -match $fixedWorkerOriginPattern) {
      $failures.Add("fixed Worker origin in reachable commit ${commit}: $normalized")
    }
    if ($content -match $secretAssignmentPattern) {
      $failures.Add("secret assignment in reachable commit ${commit}: $normalized")
    }
    if ($normalized -match $sourceLikePattern -and ($content -match $commercialEndpointPattern -or $content -match $commercialModulePattern)) {
      $failures.Add("executable commercial artifact in reachable commit ${commit}: $normalized")
    }
  }
}

if ($failures.Count -gt 0) {
  $failures | ForEach-Object { Write-Error $_ }
  exit 1
}

Write-Output "Public-source verification passed for $($trackedFiles.Count) file(s)."
