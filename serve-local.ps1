param(
  [string]$Root = $PSScriptRoot,
  [int]$Port = 8080
)

$ErrorActionPreference = "Stop"
$rootPath = (Resolve-Path -LiteralPath $Root).Path
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
$mimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".htm" = "text/html; charset=utf-8"
  ".css" = "text/css; charset=utf-8"
  ".js" = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".png" = "image/png"
  ".jpg" = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".svg" = "image/svg+xml"
  ".ico" = "image/x-icon"
  ".webp" = "image/webp"
}

function Write-Response {
  param(
    [System.Net.Sockets.NetworkStream]$Stream,
    [int]$StatusCode,
    [string]$StatusText,
    [byte[]]$Body,
    [string]$ContentType = "text/plain; charset=utf-8",
    [bool]$HeadOnly = $false
  )

  $headers = @(
    "HTTP/1.1 $StatusCode $StatusText",
    "Content-Type: $ContentType",
    "Content-Length: $($Body.Length)",
    "Cache-Control: no-store",
    "Connection: close",
    "",
    ""
  ) -join "`r`n"

  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers)
  $Stream.Write($headerBytes, 0, $headerBytes.Length)
  if (-not $HeadOnly -and $Body.Length -gt 0) {
    $Stream.Write($Body, 0, $Body.Length)
  }
}

function Get-SafePath {
  param([string]$RequestPath)

  $cleanPath = $RequestPath.Split("?")[0]
  $cleanPath = [System.Uri]::UnescapeDataString($cleanPath)
  if ([string]::IsNullOrWhiteSpace($cleanPath) -or $cleanPath -eq "/") {
    $cleanPath = "/index.html"
  }
  $relative = $cleanPath.TrimStart("/") -replace "/", [System.IO.Path]::DirectorySeparatorChar
  $candidate = Join-Path $rootPath $relative
  $fullPath = [System.IO.Path]::GetFullPath($candidate)
  if (-not $fullPath.StartsWith($rootPath, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $null
  }
  return $fullPath
}

$listener.Start()
Write-Host "Serving $rootPath on http://0.0.0.0:$Port/"

while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $stream = $client.GetStream()
    $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
    $requestLine = $reader.ReadLine()
    if ([string]::IsNullOrWhiteSpace($requestLine)) {
      $client.Close()
      continue
    }

    $parts = $requestLine.Split(" ")
    $method = $parts[0]
    $requestPath = if ($parts.Length -gt 1) { $parts[1] } else { "/" }

    while ($reader.Peek() -ge 0) {
      $line = $reader.ReadLine()
      if ([string]::IsNullOrEmpty($line)) { break }
    }

    if ($method -ne "GET" -and $method -ne "HEAD") {
      $body = [System.Text.Encoding]::UTF8.GetBytes("Method not allowed")
      Write-Response -Stream $stream -StatusCode 405 -StatusText "Method Not Allowed" -Body $body -HeadOnly ($method -eq "HEAD")
      $client.Close()
      continue
    }

    $filePath = Get-SafePath -RequestPath $requestPath
    if (-not $filePath -or -not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
      $body = [System.Text.Encoding]::UTF8.GetBytes("Not found")
      Write-Response -Stream $stream -StatusCode 404 -StatusText "Not Found" -Body $body -HeadOnly ($method -eq "HEAD")
      $client.Close()
      continue
    }

    $extension = [System.IO.Path]::GetExtension($filePath).ToLowerInvariant()
    $contentType = if ($mimeTypes.ContainsKey($extension)) { $mimeTypes[$extension] } else { "application/octet-stream" }
    $bytes = [System.IO.File]::ReadAllBytes($filePath)
    Write-Response -Stream $stream -StatusCode 200 -StatusText "OK" -Body $bytes -ContentType $contentType -HeadOnly ($method -eq "HEAD")
  } catch {
    try {
      $body = [System.Text.Encoding]::UTF8.GetBytes("Server error")
      Write-Response -Stream $stream -StatusCode 500 -StatusText "Server Error" -Body $body
    } catch {
      # Ignore connection cleanup failures.
    }
  } finally {
    $client.Close()
  }
}
