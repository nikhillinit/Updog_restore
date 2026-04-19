param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Command
)

$ErrorActionPreference = 'Stop'

function Set-IfMissing {
  param(
    [string]$Name,
    [string]$Value
  )

  if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($Name, 'Process'))) {
    [Environment]::SetEnvironmentVariable($Name, $Value, 'Process')
  }
}

$userProfile = [Environment]::GetFolderPath('UserProfile')
$appData = [Environment]::GetFolderPath('ApplicationData')
$localAppData = [Environment]::GetFolderPath('LocalApplicationData')
$commonAppData = [Environment]::GetFolderPath('CommonApplicationData')
$systemDrive = $env:SystemDrive

if ([string]::IsNullOrWhiteSpace($systemDrive)) {
  $systemDrive = 'C:'
}

$windowsRoot = Join-Path $systemDrive 'Windows'

if ([string]::IsNullOrWhiteSpace($userProfile)) {
  $userProfile = 'C:\Users\CodexSandboxOffline'
}
if ([string]::IsNullOrWhiteSpace($appData)) {
  $appData = Join-Path $userProfile 'AppData\Roaming'
}
if ([string]::IsNullOrWhiteSpace($localAppData)) {
  $localAppData = Join-Path $userProfile 'AppData\Local'
}
if ([string]::IsNullOrWhiteSpace($commonAppData)) {
  $commonAppData = Join-Path $systemDrive 'ProgramData'
}

$tempPath = Join-Path $localAppData 'Temp'
if (-not (Test-Path $tempPath)) {
  New-Item -ItemType Directory -Path $tempPath -Force | Out-Null
}

Set-IfMissing -Name 'COMSPEC' -Value (Join-Path $windowsRoot 'System32\cmd.exe')
Set-IfMissing -Name 'SystemRoot' -Value $windowsRoot
Set-IfMissing -Name 'windir' -Value $windowsRoot
Set-IfMissing -Name 'ProgramData' -Value $commonAppData
Set-IfMissing -Name 'ALLUSERSPROFILE' -Value $commonAppData
Set-IfMissing -Name 'USERPROFILE' -Value $userProfile
Set-IfMissing -Name 'APPDATA' -Value $appData
Set-IfMissing -Name 'LOCALAPPDATA' -Value $localAppData
Set-IfMissing -Name 'TEMP' -Value $tempPath
Set-IfMissing -Name 'TMP' -Value $tempPath

if (-not $Command -or $Command.Count -eq 0) {
  Write-Output "COMSPEC=$env:COMSPEC"
  Write-Output "SystemRoot=$env:SystemRoot"
  Write-Output "windir=$env:windir"
  Write-Output "ProgramData=$env:ProgramData"
  Write-Output "ALLUSERSPROFILE=$env:ALLUSERSPROFILE"
  Write-Output "USERPROFILE=$env:USERPROFILE"
  Write-Output "APPDATA=$env:APPDATA"
  Write-Output "LOCALAPPDATA=$env:LOCALAPPDATA"
  Write-Output "TEMP=$env:TEMP"
  Write-Output "TMP=$env:TMP"
  exit 0
}

$commandArgs = @()
if ($Command.Count -gt 1) {
  $commandArgs = $Command[1..($Command.Count - 1)]
}

& $Command[0] @commandArgs
exit $LASTEXITCODE
