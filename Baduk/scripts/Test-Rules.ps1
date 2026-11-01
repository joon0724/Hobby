param([string]$EngineDirectory, [string]$PlayerAssembly)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$sources = Join-Path $root 'BadukUnity/Assets/Scripts'
if ($PlayerAssembly) {
    $assemblyPath = (Resolve-Path -LiteralPath $PlayerAssembly).Path
    [System.Reflection.Assembly]::LoadFrom($assemblyPath) | Out-Null
    $references = @((Get-ChildItem -LiteralPath (Join-Path $PSHOME 'ref') -Filter '*.dll').FullName) + @($assemblyPath)
    Add-Type -Path (Join-Path $PSScriptRoot 'RulesChecks.cs') -ReferencedAssemblies $references
} else {
    Add-Type -Path @((Join-Path $sources 'GoGame.cs'), (Join-Path $sources 'TerritoryEstimate.cs'), (Join-Path $sources 'KataGoClient.cs'), (Join-Path $PSScriptRoot 'RulesChecks.cs'))
}
[RulesChecks]::RulesTests()
if ($EngineDirectory) {
    $enginePath = (Resolve-Path -LiteralPath $EngineDirectory).Path
    $tempPath = Join-Path $root 'BadukUnity/Temp/EngineTests'
    [RulesChecks]::EngineTests($enginePath, $tempPath).GetAwaiter().GetResult()
}
Write-Output 'Checks completed successfully.'
