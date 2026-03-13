$p = Get-Process -Id 10536 -ErrorAction SilentlyContinue
if ($p) {
    $p.Kill()
    Write-Host "Frontend killed"
}
