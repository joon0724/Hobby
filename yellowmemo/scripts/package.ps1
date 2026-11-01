param()
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$version = (Get-Content -LiteralPath (Join-Path $root 'VERSION') -Raw).Trim()
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'VERSION must contain x.y.z.' }
& (Join-Path $PSScriptRoot 'build.ps1')
$testRun = & (Join-Path $PSScriptRoot 'test.ps1')
$exe = Join-Path $root 'artifacts\build\YellowMemoWidget3.exe'
$guide = Join-Path $root 'docs\USER_GUIDE.md'
$release = Join-Path $root 'releases'
New-Item -ItemType Directory -Force -Path $release | Out-Null
$zipPath = Join-Path $release "YellowMemo-v$version-windows.zip"
# Explicit allowlist: do NOT zip the installation folder or recurse over user data.
Compress-Archive -LiteralPath $exe, $guide -DestinationPath $zipPath -Force
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    $actual = @($archive.Entries.FullName | Sort-Object)
    $expected = @('USER_GUIDE.md', 'YellowMemoWidget3.exe') | Sort-Object
    if (@(Compare-Object $expected $actual).Count -ne 0) { throw 'Unexpected release contents.' }
    $entry = $archive.GetEntry('YellowMemoWidget3.exe')
    $stream = $entry.Open()
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $entryHash = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','') }
    finally { $stream.Dispose(); $sha.Dispose() }
    if ($entryHash -ne (Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash) { throw 'Packaged binary mismatch.' }
} finally { $archive.Dispose() }
$hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
"$hash  $([IO.Path]::GetFileName($zipPath))" | Set-Content -LiteralPath (Join-Path $release 'SHA256SUMS.txt') -Encoding ascii
Write-Host "Tests: $testRun"
Write-Host "Release: $zipPath"
