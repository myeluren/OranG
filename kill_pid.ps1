$p = Get-Process -Id 40196 -ErrorAction SilentlyContinue
if ($p) {
    Write-Host "Killing process 40196"
    $p.Kill()
    Start-Sleep -Seconds 2
    Write-Host "Process killed"
} else {
    Write-Host "Process not found"
}
