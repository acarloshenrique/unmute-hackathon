# No installs, uploads or secret values. Compatible with Windows PowerShell 5.1+.
$ErrorActionPreference = 'Stop'
$tools = 'git', 'node', 'npm', 'npx', 'agora', 'pnpm', 'python', 'bun'
foreach ($name in $tools) {
  if (Get-Command $name -ErrorAction SilentlyContinue) {
    Write-Host ("OK      {0}" -f $name)
  } else {
    Write-Host ("ABSENT  {0}" -f $name)
  }
}
Write-Host ''
Write-Host 'Use only the tools required by your chosen starter.'
Push-Location (Join-Path $PSScriptRoot '..')
try {
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) { return }
  git rev-parse --is-inside-work-tree 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'No Git checkout found. Tracked paths were not checked.'
    return
  }
  $tracked = git -c core.quotepath=false ls-files --cached -- .
  if ($LASTEXITCODE -ne 0) { throw 'git ls-files failed.' }
  $risk = @($tracked | Where-Object {
    $_ -match '(^|/)(secrets|recordings)/' -or
    $_ -match '\.(pem|key|p12|pfx)$' -or
    $_ -match '(^|/)credentials[^/]*\.json$' -or
    (($_ -match '(^|/)\.env(\.|$)') -and ($_ -notmatch '(^|/)\.env\.(example|sample)$'))
  })
  if ($risk.Count -gt 0) {
    Write-Warning 'Potentially sensitive tracked paths. Review before pushing:'
    $risk | ForEach-Object { Write-Host $_ }
    exit 2
  }
  Write-Host 'No common secret filenames found in tracked paths.'
  Write-Host 'This is not a content or Git history scan.'
} finally {
  Pop-Location
}
