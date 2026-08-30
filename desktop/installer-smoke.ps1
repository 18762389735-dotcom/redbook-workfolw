param(
  [string]$InstallerPath
)

if ([string]::IsNullOrWhiteSpace($InstallerPath)) {
  $releaseDirectory = Join-Path $PSScriptRoot '..\release'
  $candidate = Get-ChildItem -LiteralPath $releaseDirectory -Filter 'Redbook-Workflow-Setup-*-x64.exe' -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if (-not $candidate) { throw "No x64 installer found in $releaseDirectory" }
  $InstallerPath = $candidate.FullName
}

$installRoot = Join-Path ([System.IO.Path]::GetTempPath()) 'redbook-installer-smoke-install'
$runtimeRoot = Join-Path ([System.IO.Path]::GetTempPath()) 'redbook-installer-smoke-runtime'
foreach ($target in @($installRoot, $runtimeRoot)) {
  if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
}
try {
  $installer = (Resolve-Path -LiteralPath $InstallerPath).Path
  $installerRun = Start-Process -FilePath $installer -ArgumentList @('/S', "/D=$installRoot") -Wait -PassThru -WindowStyle Hidden
  $installedExe = Join-Path $installRoot 'Redbook Workflow.exe'
  $payload = Join-Path $installRoot 'chrome_100_percent.pak'
  $deadline = (Get-Date).AddSeconds(60)
  while (-not (Test-Path -LiteralPath $payload) -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 1 }
  if (-not (Test-Path -LiteralPath $installedExe)) { throw "Installed executable not found: $installedExe (installer exit $($installerRun.ExitCode))" }
  if (-not (Test-Path -LiteralPath $payload)) { throw "Installer payload did not finish extracting (installer exit $($installerRun.ExitCode))" }
  New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
  $env:REDBOOK_DESKTOP_RUNTIME_DIR = $runtimeRoot
  & $installedExe --smoke-test
  $marker = Join-Path $runtimeRoot 'desktop-smoke-result.txt'
  $smokeDeadline = (Get-Date).AddSeconds(30)
  while (-not (Test-Path -LiteralPath $marker) -and (Get-Date) -lt $smokeDeadline) { Start-Sleep -Seconds 1 }
  if (-not (Test-Path -LiteralPath $marker)) {
    $debugLog = Join-Path $installRoot 'debug.log'
    $details = if (Test-Path -LiteralPath $debugLog) { Get-Content -LiteralPath $debugLog -Raw } else { 'no Electron debug.log' }
    throw "Installed executable did not write smoke marker. $details"
  }
  $uninstaller = Join-Path $installRoot 'Uninstall Redbook Workflow.exe'
  if (-not (Test-Path -LiteralPath $uninstaller)) { throw "Uninstaller not found: $uninstaller" }
  $uninstallRun = Start-Process -FilePath $uninstaller -ArgumentList @('/S') -Wait -PassThru -WindowStyle Hidden
  $result = [ordered]@{
    installerExit = $installerRun.ExitCode
    installedExecutable = $installedExe
    smokeMarker = (Get-Content -LiteralPath $marker -Raw).Trim()
    uninstallExit = $uninstallRun.ExitCode
    installDirectoryRemoved = -not (Test-Path -LiteralPath $installRoot)
  }
  $result | ConvertTo-Json -Compress
  if (-not $result.installDirectoryRemoved) { throw 'Install directory was not removed after uninstall' }
} finally {
  Remove-Item Env:REDBOOK_DESKTOP_RUNTIME_DIR -ErrorAction SilentlyContinue
  foreach ($target in @($installRoot, $runtimeRoot)) {
    if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction SilentlyContinue }
  }
}
