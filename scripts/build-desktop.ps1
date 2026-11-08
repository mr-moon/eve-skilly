[CmdletBinding()]
param([switch]$KeepCompilerCache)
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Push-Location $workspace
try {
    $exe = Join-Path $workspace 'target\release\skilly-desktop.exe'
    if (Test-Path -LiteralPath $exe) {
        $locked = $false
        try { $handle = [IO.File]::Open($exe, 'Open', 'ReadWrite', 'None'); $handle.Dispose() } catch { $locked = $true }
        if ($locked) {
            $backup = Join-Path $workspace 'target\release\skilly-desktop.running.exe'
            if (Test-Path -LiteralPath $backup) {
                try { Remove-Item -LiteralPath $backup -Force -ErrorAction Stop }
                catch { throw 'Multiple previous Skilly builds are running. Close them before rebuilding.' }
            }
            Rename-Item -LiteralPath $exe -NewName 'skilly-desktop.running.exe'
        }
    }
    & (Join-Path $workspace 'node_modules\.bin\tauri.cmd') build --bundles nsis
    if ($LASTEXITCODE -ne 0) { throw "Desktop build failed (exit $LASTEXITCODE). Build cache was preserved." }
    & (Join-Path $PSScriptRoot 'clean-builds.ps1') -Deep:(-not $KeepCompilerCache)
} finally { Pop-Location }
