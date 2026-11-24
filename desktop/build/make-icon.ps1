# Draws the MYMAILMARKET app icon (blue gradient tile with a lightning bolt,
# matching the site logo) as a 512x512 PNG for electron-builder.
Add-Type -AssemblyName System.Drawing

$size = 512
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

# Rounded square
$radius = 120
$rect = New-Object System.Drawing.Rectangle 16, 16, ($size - 32), ($size - 32)
$pathTile = New-Object System.Drawing.Drawing2D.GraphicsPath
$d = $radius * 2
$pathTile.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
$pathTile.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
$pathTile.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
$pathTile.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
$pathTile.CloseFigure()
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.Color]::FromArgb(255, 0x78, 0xa8, 0xff)), ([System.Drawing.Color]::FromArgb(255, 0x40, 0x57, 0xdb)), 45
$g.FillPath($brush, $pathTile)

# Lightning bolt (lucide "zap" shape, scaled from its 24x24 grid)
$s = 15.0; $ox = 76; $oy = 76
$pts = @(@(13,2), @(3,14), @(12,14), @(11,22), @(21,10), @(12,10)) | ForEach-Object {
  New-Object System.Drawing.PointF ([float]($ox + $_[0] * $s)), ([float]($oy + $_[1] * $s))
}
$g.FillPolygon([System.Drawing.Brushes]::White, [System.Drawing.PointF[]]$pts)

$out = Join-Path $PSScriptRoot "icon.png"
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output "Wrote $out"
