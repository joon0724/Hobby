param([string]$ProjectPath = (Join-Path (Split-Path $PSScriptRoot -Parent) 'BadukUnity'))
$ErrorActionPreference = 'Stop'
$lock = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'engine-lock.json') -Raw | ConvertFrom-Json
$project = [System.IO.Path]::GetFullPath($ProjectPath)
$tempPath = Join-Path $project 'Temp/EngineDownload'
$target = Join-Path $project 'Assets/StreamingAssets/KataGo'
New-Item -ItemType Directory -Force -Path $tempPath,$target | Out-Null
function Get-VerifiedFile([string]$Url, [string]$Path, [string]$Sha256) {
    if ((Test-Path -LiteralPath $Path) -and (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash -eq $Sha256) { return }
    $part = $Path + '.download'
    Invoke-WebRequest -Uri $Url -OutFile $part
    if ((Get-FileHash -LiteralPath $part -Algorithm SHA256).Hash -ne $Sha256) { throw 'Downloaded file does not match the pinned SHA-256.' }
    Move-Item -LiteralPath $part -Destination $Path -Force
}
$archivePath = Join-Path $tempPath 'katago.zip'
Get-VerifiedFile $lock.engine_archive.url $archivePath $lock.engine_archive.sha256
$extractPath = Join-Path $tempPath 'engine'
Expand-Archive -LiteralPath $archivePath -DestinationPath $extractPath -Force
foreach ($entry in $lock.runtime_files.PSObject.Properties) {
    $file = Join-Path $extractPath $entry.Name
    if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $entry.Value) { throw ('Engine file mismatch: ' + $entry.Name) }
    Copy-Item -LiteralPath $file -Destination (Join-Path $target $entry.Name) -Force
}
foreach ($model in $lock.models) { Get-VerifiedFile $model.url (Join-Path $target $model.name) $model.sha256 }
Copy-Item -LiteralPath (Join-Path (Split-Path $PSScriptRoot -Parent) 'licenses') -Destination $target -Recurse -Force
Write-Output 'Pinned KataGo engine, models and license notices are ready.'
