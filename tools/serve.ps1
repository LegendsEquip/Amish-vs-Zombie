# Tiny static file server for local play-testing (no Node/Python needed).
# Usage: powershell -ExecutionPolicy Bypass -File tools\serve.ps1 [-Port 8777]
param([int]$Port = 8777)
$root = Split-Path -Parent $PSScriptRoot
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root at http://localhost:$Port/"
$mime = @{
  ".html"="text/html; charset=utf-8"; ".js"="application/javascript; charset=utf-8"; ".css"="text/css; charset=utf-8";
  ".json"="application/json"; ".png"="image/png"; ".jpg"="image/jpeg"; ".jpeg"="image/jpeg"; ".webp"="image/webp";
  ".mp4"="video/mp4"; ".webm"="video/webm"; ".mp3"="audio/mpeg"; ".ogg"="audio/ogg"; ".wav"="audio/wav"; ".svg"="image/svg+xml"; ".ico"="image/x-icon"
}
while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $req = $ctx.Request; $res = $ctx.Response
    $rel = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart('/')
    if ($rel -eq '') { $rel = 'index.html' }
    $path = [System.IO.Path]::GetFullPath((Join-Path $root $rel))
    if (-not $path.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path $path -PathType Leaf)) {
      $res.StatusCode = 404; $res.Close(); continue
    }
    $ext = [System.IO.Path]::GetExtension($path).ToLower()
    $ct = $mime[$ext]; if (-not $ct) { $ct = "application/octet-stream" }
    $res.ContentType = $ct
    $res.Headers.Add("Cache-Control", "no-store")
    $res.Headers.Add("Accept-Ranges", "bytes")
    $fs = [System.IO.File]::OpenRead($path)
    try {
      $len = $fs.Length; $start = 0; $end = $len - 1
      $range = $req.Headers["Range"]
      if ($range -and $range -match 'bytes=(\d*)-(\d*)') {
        if ($matches[1] -ne '') { $start = [int64]$matches[1] }
        if ($matches[2] -ne '') { $end = [int64]$matches[2] }
        if ($end -ge $len) { $end = $len - 1 }
        $res.StatusCode = 206
        $res.Headers.Add("Content-Range", "bytes $start-$end/$len")
      }
      $count = $end - $start + 1
      $res.ContentLength64 = $count
      $fs.Position = $start
      $buf = New-Object byte[] 65536
      while ($count -gt 0) {
        $n = $fs.Read($buf, 0, [Math]::Min($buf.Length, $count))
        if ($n -le 0) { break }
        $res.OutputStream.Write($buf, 0, $n)
        $count -= $n
      }
    } finally { $fs.Close() }
    $res.Close()
  } catch {
    try { $ctx.Response.Abort() } catch {}
  }
}
