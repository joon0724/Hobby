param([string]$ExePath, [switch]$StorageOnly, [int]$TimeoutSeconds = 90)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
if (!$ExePath) { $ExePath = Join-Path $root 'artifacts\build\YellowMemoWidget3.exe' }
$ExePath = (Resolve-Path -LiteralPath $ExePath).Path
$run = Join-Path $root ('artifacts\tests\' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $run | Out-Null
function Invoke-MemoTest([string]$Mode) {
    # Always isolated. Never launch normal mode against a personal notebook.
    $p = Start-Process -FilePath $ExePath -ArgumentList @($Mode, ('"' + $run + '"')) -PassThru -WindowStyle Hidden
    if (!$p.WaitForExit($TimeoutSeconds * 1000)) {
        $p.Kill()
        throw "Test timeout ($Mode). Only this test process was stopped. Logs: $run"
    }
    $p.Refresh()
    if ($p.ExitCode -ne 0) { throw "Test failed ($Mode), exit $($p.ExitCode). Logs: $run" }
}
Invoke-MemoTest '--self-test'
$reports = @('storage-test.txt', 'relocation-test.txt')
if (!$StorageOnly) {
    Invoke-MemoTest '--smoke-test'
    $reports += @('ui-test.txt', 'input-test.txt')
}
foreach ($name in $reports) {
    $path = Join-Path $run $name
    if (!(Test-Path -LiteralPath $path) -or !(Get-Content -LiteralPath $path -Raw).StartsWith('PASS:')) {
        throw "Missing or failing test report: $path"
    }
    Write-Host (Get-Content -LiteralPath $path -Raw)
}
# Emit a single path for packaging/report consumers.
Write-Output $run
