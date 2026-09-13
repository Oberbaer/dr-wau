Add-Type -AssemblyName System.Drawing

$assetDirectory = Join-Path $PSScriptRoot '..\assets\images'
[System.IO.Directory]::CreateDirectory($assetDirectory) | Out-Null

$bitmap = [System.Drawing.Bitmap]::new(1000, 700)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

$background = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
  [System.Drawing.Rectangle]::new(0, 0, 1000, 700),
  [System.Drawing.Color]::FromArgb(7, 59, 54),
  [System.Drawing.Color]::FromArgb(11, 138, 120),
  35
)
$graphics.FillRectangle($background, 0, 0, 1000, 700)

$ringPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(100, 142, 230, 216), 32)
$graphics.DrawEllipse($ringPen, 310, 110, 380, 380)

$pulsePen = [System.Drawing.Pen]::new([System.Drawing.Color]::White, 40)
$pulsePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pulsePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$pulsePen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$points = [System.Drawing.Point[]]@(
  [System.Drawing.Point]::new(237, 335), [System.Drawing.Point]::new(371, 333),
  [System.Drawing.Point]::new(436, 188), [System.Drawing.Point]::new(541, 482),
  [System.Drawing.Point]::new(611, 333), [System.Drawing.Point]::new(763, 333)
)
$graphics.DrawLines($pulsePen, $points)

$font = [System.Drawing.Font]::new('Arial', 68, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$format = [System.Drawing.StringFormat]::new()
$format.Alignment = [System.Drawing.StringAlignment]::Center
$graphics.DrawString('Homey Watchdog', $font, [System.Drawing.Brushes]::White, [System.Drawing.RectangleF]::new(0, 545, 1000, 100), $format)

$xlargePath = Join-Path $assetDirectory 'xlarge.png'
$bitmap.Save($xlargePath, [System.Drawing.Imaging.ImageFormat]::Png)

foreach ($target in @(
  @{ Name = 'large.png'; Width = 500; Height = 350 },
  @{ Name = 'small.png'; Width = 250; Height = 175 }
)) {
  $resized = [System.Drawing.Bitmap]::new($target.Width, $target.Height)
  $targetGraphics = [System.Drawing.Graphics]::FromImage($resized)
  $targetGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $targetGraphics.DrawImage($bitmap, 0, 0, $target.Width, $target.Height)
  $resized.Save((Join-Path $assetDirectory $target.Name), [System.Drawing.Imaging.ImageFormat]::Png)
  $targetGraphics.Dispose()
  $resized.Dispose()
}

$format.Dispose()
$font.Dispose()
$pulsePen.Dispose()
$ringPen.Dispose()
$background.Dispose()
$graphics.Dispose()
$bitmap.Dispose()
