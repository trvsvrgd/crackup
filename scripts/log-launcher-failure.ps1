param([ValidateSet('PREREQUISITE','INSTALL','BUILD','RUNTIME')][string]$Stage = 'PREREQUISITE')
# Runs even when Node/npm cannot start. Fixed fields only; never capture raw command output or environment.
try {
  $dataRoot = if ($env:SOLO_DATA_DIR) { [IO.Path]::GetFullPath($env:SOLO_DATA_DIR) } else { Join-Path $env:LOCALAPPDATA 'CRACKUP\solo' }
  $logRoot = Join-Path $dataRoot 'logs'
  [IO.Directory]::CreateDirectory($logRoot) | Out-Null
  if ((Get-Item -LiteralPath $logRoot).Attributes -band [IO.FileAttributes]::ReparsePoint) { exit 0 }
  $drive = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($logRoot))
  if ($drive.AvailableFreeSpace -lt (256MB + 4096)) { exit 0 }
  $target = Join-Path $logRoot 'bootstrap.json'
  $temporary = $target + '.tmp'
  foreach ($candidate in @($target,$temporary)) {
    if ((Test-Path -LiteralPath $candidate) -and ((Get-Item -LiteralPath $candidate).Attributes -band [IO.FileAttributes]::ReparsePoint)) { exit 0 }
  }
  $event = @{schemaVersion=1;sequence=1;at=[DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ');elapsedMs=0;component='launcher';name='launcher.failed';severity='error';context=@{runId=[guid]::NewGuid().ToString()};payload=@{code=('LAUNCHER_' + $Stage)};suppressedBefore=0}
  [IO.File]::WriteAllText($temporary,($event | ConvertTo-Json -Depth 4 -Compress) + "`n",[Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $temporary -Destination $target -Force
  Write-Host "Startup diagnostic: $target"
} catch { Write-Host 'Startup diagnostics could not be written. The game error above remains available in this window.' }
