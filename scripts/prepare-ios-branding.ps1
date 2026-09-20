# Deterministic platform-asset conversion of the existing App emblem.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path $PSScriptRoot -Parent
$sourcePath = Join-Path $projectRoot 'public/ntou-emblem.png'
$targetPath = Join-Path $projectRoot 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'
$sourceImage = [System.Drawing.Image]::FromFile($sourcePath)
$iconBitmap = [System.Drawing.Bitmap]::new(1024, 1024, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$iconGraphics = [System.Drawing.Graphics]::FromImage($iconBitmap)
try {
    $iconGraphics.Clear([System.Drawing.Color]::White)
    $iconGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $iconGraphics.DrawImage($sourceImage, 52, 52, 920, 920)
    $iconBitmap.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
    $iconGraphics.Dispose()
    $iconBitmap.Dispose()
    $sourceImage.Dispose()
}
