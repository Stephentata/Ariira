param(
    [ValidateSet("cpu", "cuda")]
    [string]$Device = "cpu"
)

$ErrorActionPreference = "Stop"
$labRoot = Join-Path $env:LOCALAPPDATA "AriVoiceLab"
$provider = if ($env:ARI_TTS_PROVIDER) { $env:ARI_TTS_PROVIDER.Trim().ToLowerInvariant() } else { "auto" }
$region = if ($env:ARI_DEPLOYMENT_REGION) { $env:ARI_DEPLOYMENT_REGION.Trim().ToLowerInvariant() } else { "global" }
$needsLocalRuntime = $provider -eq "local" -or ($provider -eq "auto" -and $region -eq "global")
$usesHostedProvider = -not $needsLocalRuntime
$python = Join-Path $labRoot "venv\Scripts\python.exe"
$server = Join-Path $PSScriptRoot "ari-tts-server.py"

if ($usesHostedProvider) {
    if ($env:ARI_TTS_PYTHON) {
        $python = $env:ARI_TTS_PYTHON
    } else {
        $labPython = Join-Path $labRoot "venv\Scripts\python.exe"
        $pythonCommand = if (Test-Path -LiteralPath $labPython) {
            Get-Item -LiteralPath $labPython
        } else {
            Get-Command python.exe -ErrorAction SilentlyContinue
        }
        if ($null -eq $pythonCommand) {
            throw "Python was not found on PATH. Set ARI_TTS_PYTHON to a Python 3 executable."
        }
        if ($pythonCommand -is [System.IO.FileInfo]) {
            $python = $pythonCommand.FullName
        } else {
            $python = $pythonCommand.Source
        }
    }
}

if (-not (Test-Path -LiteralPath $python)) {
    if ($usesHostedProvider) {
        throw "Python environment not found at '$python'. Set ARI_TTS_PYTHON to a Python 3 executable."
    }
    throw "AriVoiceLab Python environment not found at '$python'. See the local voice runtime setup notes in README.md."
}
if (-not (Test-Path -LiteralPath $server)) {
    throw "Ari speech service script not found at '$server'."
}

if (Test-Path -LiteralPath (Join-Path $labRoot "venv\Scripts\python.exe")) {
    $env:ARI_VOICE_LAB = $labRoot
    $env:ARI_TTS_DEVICE = $Device
    $env:HF_HUB_OFFLINE = "1"
    $env:NLTK_DATA = Join-Path $labRoot "nltk_data"
}
& $python $server
exit $LASTEXITCODE
