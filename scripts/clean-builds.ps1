[CmdletBinding()]
param([switch]$Deep)
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
$target = Join-Path $workspace 'target'
$version = (Get-Content -LiteralPath (Join-Path $workspace 'package.json') -Raw | ConvertFrom-Json).version
$release = Join-Path $target 'release'
$latestExe = Join-Path $release 'skilly-desktop.exe'
$latestInstaller = Join-Path $release "bundle\nsis\Skilly_${version}_x64-setup.exe"
$script:removedBytes = 0L
$script:skipped = [Collections.Generic.List[string]]::new()
function Remove-BuildArtifact([string]$Path) {
    $full = [IO.Path]::GetFullPath($Path)
    if (-not $full.StartsWith($target + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "Refusing to remove a path outside target: $full" }
    if (-not (Test-Path -LiteralPath $full)) { return }
    # Reject links at every existing component before traversing/deleting a tree.
    $component = $full
    while ($component.Length -ge $target.Length) {
        $entry = Get-Item -LiteralPath $component -Force
        if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Refusing to traverse a linked build path: $component" }
        if ($component -eq $target) { break }
        $component = [IO.Path]::GetDirectoryName($component)
    }
    $entry = Get-Item -LiteralPath $full -Force
    if ($entry.PSIsContainer) {
        # Enumerate without following junctions. Delete files individually so a
        # running executable can remain while its unused cache is reclaimed.
        foreach ($child in @(Get-ChildItem -LiteralPath $full -Force)) { Remove-BuildArtifact $child.FullName }
        if (-not (Get-ChildItem -LiteralPath $full -Force | Select-Object -First 1)) { Remove-Item -LiteralPath $full -Force -ErrorAction Stop }
    } else {
        $bytes = $entry.Length
        try { Remove-Item -LiteralPath $full -Force -ErrorAction Stop; $script:removedBytes += $bytes }
        catch { $script:skipped.Add($full) }
    }
}
if (-not (Test-Path -LiteralPath $latestExe) -or -not (Test-Path -LiteralPath $latestInstaller)) {
    throw "Latest build $version is incomplete. No files were removed."
}
foreach ($file in @(Get-ChildItem -LiteralPath (Join-Path $release 'bundle\nsis') -Filter 'Skilly_*-setup.exe' -File)) {
    if ($file.FullName -ne $latestInstaller) { Remove-BuildArtifact $file.FullName }
}
foreach ($file in @(Get-ChildItem -LiteralPath $release -File | Where-Object { $_.Name -like 'skilly-desktop-running-*.exe' -or $_.Name -eq 'skilly-desktop.running.exe' })) { Remove-BuildArtifact $file.FullName }
$assets = Join-Path $target 'release-assets'
if (Test-Path -LiteralPath $assets) { Remove-BuildArtifact $assets }
if ($Deep) {
    $debug = Join-Path $target 'debug'
    if (Test-Path -LiteralPath $debug) { Remove-BuildArtifact $debug }
    foreach ($name in @('build','deps','incremental','.fingerprint','examples')) { Remove-BuildArtifact (Join-Path $release $name) }
    foreach ($file in @(Get-ChildItem -LiteralPath $release -File | Where-Object { $_.Name -ne 'skilly-desktop.exe' -and $_.Name -ne '.cargo-lock' })) { Remove-BuildArtifact $file.FullName }
}
Write-Host ('Removed {0:N2} GiB. Kept Skilly {1} executable and installer.' -f ($script:removedBytes / 1GB), $version)
if ($script:skipped.Count) { Write-Host ('Kept {0} locked/in-use files. They can be removed after those applications exit.' -f $script:skipped.Count) }
