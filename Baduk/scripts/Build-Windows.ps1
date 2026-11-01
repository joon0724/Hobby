param([Parameter(Mandatory=$true)][string]$UnityPath)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$project = Join-Path $root 'BadukUnity'
if (-not (Test-Path -LiteralPath $UnityPath)) { throw 'Unity editor executable not found.' }
& (Join-Path $PSScriptRoot 'Prepare-Engine.ps1') -ProjectPath $project
New-Item -ItemType Directory -Force -Path (Join-Path $project 'Temp') | Out-Null
$log = Join-Path $project 'Temp/build.log'
$arguments = '-batchmode -nographics -projectPath "' + $project + '" -buildTarget StandaloneWindows64 -executeMethod BuildGame.Build -logFile "' + $log + '"'
$process = Start-Process -FilePath $UnityPath -ArgumentList $arguments -WindowStyle Hidden -PassThru -Wait
if ($process.ExitCode -ne 0) { throw ('Unity build failed; see ' + $log) }
$player = Join-Path $root 'release-assets/BadukWindows'
Copy-Item -LiteralPath (Join-Path $root 'licenses') -Destination $player -Recurse -Force
Copy-Item -LiteralPath (Join-Path $root 'THIRD_PARTY_NOTICES.md') -Destination $player -Force
Write-Output 'Windows build and checks succeeded. Run the privacy review before packaging a new release.'
