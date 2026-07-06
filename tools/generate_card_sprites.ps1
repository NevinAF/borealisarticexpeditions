Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'

function New-SpriteSheet {
    param(
        [Parameter(Mandatory = $true)][string]$InputDir,
        [Parameter(Mandatory = $true)][string]$OutputPrefix,
        [Parameter(Mandatory = $true)][int]$CardWidth,
        [Parameter(Mandatory = $true)][int]$CardHeight,
        [Parameter(Mandatory = $true)][int]$Columns
    )

    $files = Get-ChildItem -Path $InputDir -Filter '*.png' | Sort-Object { [int]$_.BaseName }
    if ($files.Count -eq 0) {
        throw "No PNG files found in $InputDir"
    }

    $count = $files.Count
    $rows = [int][Math]::Ceiling($count / [double]$Columns)
    $sheetWidth = $CardWidth * $Columns
    $sheetHeight = $CardHeight * $rows

    $sheet = New-Object System.Drawing.Bitmap($sheetWidth, $sheetHeight, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($sheet)
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

    for ($i = 0; $i -lt $files.Count; $i++) {
        $col = $i % $Columns
        $row = [int][Math]::Floor($i / $Columns)
        $x = $col * $CardWidth
        $y = $row * $CardHeight

        $img = [System.Drawing.Image]::FromFile($files[$i].FullName)
        $g.DrawImage($img, $x, $y, $CardWidth, $CardHeight)
        $img.Dispose()
    }

    $fullPath = "${OutputPrefix}_full.png"
    $sheet.Save($fullPath, [System.Drawing.Imaging.ImageFormat]::Png)

    foreach ($tier in @(@('half', 0.5), @('quarter', 0.25))) {
        $name = [string]$tier[0]
        $scale = [double]$tier[1]

        $scaledWidth = [int][Math]::Round($sheetWidth * $scale)
        $scaledHeight = [int][Math]::Round($sheetHeight * $scale)

        $scaledBmp = New-Object System.Drawing.Bitmap($scaledWidth, $scaledHeight, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $sg = [System.Drawing.Graphics]::FromImage($scaledBmp)
        $sg.Clear([System.Drawing.Color]::Transparent)
        $sg.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $sg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $sg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $sg.DrawImage($sheet, 0, 0, $scaledWidth, $scaledHeight)

        $scaledPath = "${OutputPrefix}_${name}.png"
        $scaledBmp.Save($scaledPath, [System.Drawing.Imaging.ImageFormat]::Png)

        $sg.Dispose()
        $scaledBmp.Dispose()
    }

    $g.Dispose()
    $sheet.Dispose()

    [PSCustomObject]@{
        InputDir = $InputDir
        Count = $count
        Columns = $Columns
        Rows = $rows
        CardWidth = $CardWidth
        CardHeight = $CardHeight
        Full = $fullPath
        Half = "${OutputPrefix}_half.png"
        Quarter = "${OutputPrefix}_quarter.png"
    }
}

$root = Split-Path -Parent $PSScriptRoot
$spriteDir = Join-Path $root 'img\Sprites'
New-Item -ItemType Directory -Path $spriteDir -Force | Out-Null

$results = @()
$results += New-SpriteSheet -InputDir (Join-Path $root 'resources\AnimalCards') -OutputPrefix (Join-Path $spriteDir 'AnimalCards_sheet') -CardWidth 528 -CardHeight 745 -Columns 11
$results += New-SpriteSheet -InputDir (Join-Path $root 'resources\ObjectiveCards') -OutputPrefix (Join-Path $spriteDir 'ObjectiveCards_sheet') -CardWidth 745 -CardHeight 528 -Columns 4
$results += New-SpriteSheet -InputDir (Join-Path $root 'resources\ScoringCards') -OutputPrefix (Join-Path $spriteDir 'ScoringCards_sheet') -CardWidth 528 -CardHeight 745 -Columns 4

$results | Format-Table -AutoSize
