# Starts a Cloudflare quick tunnel to the menu app and copies the public link to the clipboard.
$cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
if ($cmd) { $exe = $cmd.Source } else { $exe = "C:\Program Files (x86)\cloudflared\cloudflared.exe" }
if (-not (Test-Path $exe)) {
    Write-Host "cloudflared not found. Install it with: winget install --id Cloudflare.cloudflared" -ForegroundColor Red
    exit 1
}

$log = "$env:TEMP\cloudflared.log"
Remove-Item $log -ErrorAction SilentlyContinue

Write-Host "Starting tunnel, please wait..." -ForegroundColor Yellow
$p = Start-Process $exe -ArgumentList "tunnel --url http://localhost:3000 --protocol http2" `
     -RedirectStandardError $log -NoNewWindow -PassThru

$link = $null
for ($i = 0; $i -lt 60 -and -not $link; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path $log) {
        $m = Select-String -Path $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1
        if ($m) { $link = $m.Matches[0].Value }
    }
}

if ($link) {
    Set-Clipboard $link
    # Let the app's QR code page know the public link (the app reads this file)
    Set-Content -Path (Join-Path $env:TEMP "cupview-public-url.txt") -Value $link -NoNewline
    Write-Host ""
    Write-Host "YOUR LINK (already copied to clipboard):" -ForegroundColor Green
    Write-Host $link -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Paste it into a chat to yourself and open it on your phone."
    Write-Host "The QR code tab on the admin page now uses this link automatically."
    Write-Host "Keep this window open. Close it to stop the tunnel."
} else {
    Write-Host "Could not find the link. Check your internet and try again." -ForegroundColor Red
}

Wait-Process -Id $p.Id
# Tunnel closed: forget the link so the QR code never points at a dead address
Remove-Item (Join-Path $env:TEMP "cupview-public-url.txt") -ErrorAction SilentlyContinue
