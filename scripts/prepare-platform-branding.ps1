# Rebuild all platform branding from the user-provided T mark.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path $PSScriptRoot -Parent
$sourcePath = Join-Path $projectRoot 'public/tat-mark.png'
if (-not (Test-Path -LiteralPath $sourcePath)) {
    throw "Missing T mark: $sourcePath"
}

$sourceImage = [System.Drawing.Image]::FromFile($sourcePath)
try {
    if ($sourceImage.Width -ne $sourceImage.Height) {
        throw 'The T mark source must be square.'
    }

    function Save-BrandImage {
        param(
            [string]$RelativePath,
            [int]$Width,
            [int]$Height,
            [bool]$Splash = $false
        )

        $targetPath = Join-Path $projectRoot $RelativePath
        $bitmap = [System.Drawing.Bitmap]::new($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        try {
            $graphics.Clear([System.Drawing.Color]::White)
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

            if ($Splash) {
                $side = [int][Math]::Round([Math]::Min($Width, $Height) * 0.40)
                $left = [int][Math]::Floor(($Width - $side) / 2)
                $top = [int][Math]::Floor(($Height - $side) / 2)
                $destination = [System.Drawing.Rectangle]::new($left, $top, $side, $side)
            } else {
                $destination = [System.Drawing.Rectangle]::new(0, 0, $Width, $Height)
            }

            $graphics.DrawImage($sourceImage, $destination)
            $bitmap.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
        } finally {
            $graphics.Dispose()
            $bitmap.Dispose()
        }
    }

    Save-BrandImage 'public/favicon-48.png' 48 48
    Save-BrandImage 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png' 1024 1024

    $densities = @(
        @{ Name = 'mdpi'; Icon = 48; Foreground = 108 },
        @{ Name = 'hdpi'; Icon = 72; Foreground = 162 },
        @{ Name = 'xhdpi'; Icon = 96; Foreground = 216 },
        @{ Name = 'xxhdpi'; Icon = 144; Foreground = 324 },
        @{ Name = 'xxxhdpi'; Icon = 192; Foreground = 432 }
    )
    foreach ($density in $densities) {
        $directory = "android/app/src/main/res/mipmap-$($density.Name)"
        Save-BrandImage "$directory/ic_launcher.png" $density.Icon $density.Icon
        Save-BrandImage "$directory/ic_launcher_round.png" $density.Icon $density.Icon
        Save-BrandImage "$directory/ic_launcher_foreground.png" $density.Foreground $density.Foreground
    }

    $splashes = @(
        @{ Path = 'drawable'; Width = 480; Height = 320 },
        @{ Path = 'drawable-land-mdpi'; Width = 480; Height = 320 },
        @{ Path = 'drawable-land-hdpi'; Width = 800; Height = 480 },
        @{ Path = 'drawable-land-xhdpi'; Width = 1280; Height = 720 },
        @{ Path = 'drawable-land-xxhdpi'; Width = 1600; Height = 960 },
        @{ Path = 'drawable-land-xxxhdpi'; Width = 1920; Height = 1280 },
        @{ Path = 'drawable-port-mdpi'; Width = 320; Height = 480 },
        @{ Path = 'drawable-port-hdpi'; Width = 480; Height = 800 },
        @{ Path = 'drawable-port-xhdpi'; Width = 720; Height = 1280 },
        @{ Path = 'drawable-port-xxhdpi'; Width = 960; Height = 1600 },
        @{ Path = 'drawable-port-xxxhdpi'; Width = 1280; Height = 1920 }
    )
    foreach ($splash in $splashes) {
        Save-BrandImage "android/app/src/main/res/$($splash.Path)/splash.png" $splash.Width $splash.Height $true
    }
} finally {
    $sourceImage.Dispose()
}
