param([string]$OutputPath)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$framework = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
$csc = Join-Path $framework 'csc.exe'
if (!(Test-Path -LiteralPath $csc)) { throw '64-bit Windows .NET Framework compiler not found.' }
if (!$OutputPath) { $OutputPath = Join-Path $root 'artifacts\build\YellowMemoWidget3.exe' }
$OutputPath = [IO.Path]::GetFullPath($OutputPath)
New-Item -ItemType Directory -Force -Path (Split-Path $OutputPath -Parent) | Out-Null
$references = @(
    '/reference:' + (Join-Path $framework 'WPF\PresentationFramework.dll')
    '/reference:' + (Join-Path $framework 'WPF\PresentationCore.dll')
    '/reference:' + (Join-Path $framework 'WPF\WindowsBase.dll')
    '/reference:' + (Join-Path $framework 'System.Xaml.dll')
    '/reference:' + (Join-Path $framework 'System.Runtime.Serialization.dll')
    '/reference:' + (Join-Path $framework 'System.Windows.Forms.dll')
    '/reference:' + (Join-Path $framework 'System.Drawing.dll')
)
& $csc /nologo /target:winexe "/out:$OutputPath" @references (Join-Path $root 'src\YellowMemo.cs')
if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
Write-Host "Built: $OutputPath"
