param([string]$SourceApk = 'C:\Users\lxuan\AppData\Local\Temp\ntou-tat-v3-native-build\app\outputs\apk\debug\app-debug.apk')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot'
$signer = 'C:\Users\lxuan\AppData\Local\Android\Sdk\build-tools\36.0.0\apksigner.bat'
$aapt = 'C:\Users\lxuan\AppData\Local\Android\Sdk\build-tools\36.0.0\aapt.exe'
$expectedCert = '7be30487bc3a629275c88396aaa71b31aa3d919be14cd780329d014a250de7b1'
$signature = (& $signer verify --verbose --print-certs $SourceApk) -join "`n"
if ($LASTEXITCODE -ne 0 -or $signature -notmatch $expectedCert -or $signature -notmatch 'Verified using v2 scheme.*true') { throw 'APK signature check failed' }
$previous = Join-Path $projectRoot 'releases\NTOUTAT-3.0.0-test.4.apk'
$previousSignature = (& $signer verify --print-certs $previous) -join "`n"
if ($LASTEXITCODE -ne 0 -or $previousSignature -notmatch $expectedCert) { throw 'Previous APK does not have matching signature' }
$badging = (& $aapt dump badging $SourceApk) -join "`n"
if ($LASTEXITCODE -ne 0 -or $badging -notmatch "name='com.lxuan.ntou_tat.v3test' versionCode='300005' versionName='3.0.0-test.5'") { throw 'Unexpected package/version' }
$widget = (& $aapt dump xmltree $SourceApk res/xml/tat_timetable_widget.xml) -join "`n"
if ($LASTEXITCODE -ne 0 -or $widget -notmatch 'widgetCategory.*0x3') { throw 'Widget categories changed unexpectedly' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($SourceApk)
try {
  $configEntry = $archive.GetEntry('assets/capacitor.config.json')
  $reader = [IO.StreamReader]::new($configEntry.Open())
  try { $config = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
  if ($config.appId -ne 'com.lxuan.ntou_tat.v3test' -or $config.server.url) { throw 'APK has unexpected server config' }
  $assets = [regex]::Matches((Get-Content -Raw (Join-Path $projectRoot 'dist\index.html')), '/assets/([^" ]+\.(?:js|css))')
  if ($assets.Count -lt 2) { throw 'Production assets not found' }
  $verifiedAssets = @()
  foreach ($asset in $assets) {
    $name = $asset.Groups[1].Value
    $entry = $archive.GetEntry('assets/public/assets/' + $name)
    if (!$entry) { throw "APK lacks current production asset $name" }
    $hash = [Security.Cryptography.SHA256]::Create()
    $stream = $entry.Open()
    try { $packedHash = [Convert]::ToHexString($hash.ComputeHash($stream)) } finally { $stream.Dispose(); $hash.Dispose() }
    if ($packedHash -ne (Get-FileHash (Join-Path $projectRoot ('dist\assets\' + $name)) -Algorithm SHA256).Hash) { throw "Packed asset differs from production build: $name" }
    $reader = [IO.StreamReader]::new($entry.Open())
    try { $content = $reader.ReadToEnd() } finally { $reader.Dispose() }
    if ($content -match 'QA_ONLY|NOT_A_REAL_PASSWORD|林海晴|127\.0\.0\.1:5317|qa-campus-') { throw 'Mock-only data leaked into APK' }
    if ($name.EndsWith('.css') -and $content -notmatch 'campus-bulletin-enter') { throw 'Bulletin animation styles missing' }
    if ($name.EndsWith('.js') -and ($content -notmatch 'ntou-campus-api.ntou-campus.workers.dev' -or $content -notmatch 'data-mail-uid' -or $content -notmatch '已修畢')) { throw 'Current bulletin / scroll fix / English option missing' }
    $verifiedAssets += @{ name = $name; sha256 = $packedHash }
  }
} finally { $archive.Dispose() }
$destination = Join-Path $projectRoot 'releases\NTOUTAT-3.0.0-test.5.apk'
if (Test-Path -LiteralPath $destination) { throw 'Destination already exists; preserve the existing artifact' }
Copy-Item -LiteralPath $SourceApk -Destination $destination
$record = [ordered]@{
  apk = $destination; package = 'com.lxuan.ntou_tat.v3test'; versionName = '3.0.0-test.5'; versionCode = 300005
  sha256 = (Get-FileHash -Algorithm SHA256 $destination).Hash; bytes = (Get-Item $destination).Length
  certificateSha256 = $expectedCert; signatureV2Verified = $true; matchesTest4Signature = $true
  currentProductionAssets = $verifiedAssets; mockDataAbsent = $true; homeAndKeyguardCategories = $true
}
$record | ConvertTo-Json -Depth 6 | Set-Content -Encoding utf8 (Join-Path $projectRoot 'qa\test5-artifact-verification.json')
$record | ConvertTo-Json -Depth 6
