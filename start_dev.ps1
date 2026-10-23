# PDF Form Agent - Development Startup Script
# Starts both the FastAPI backend and Vite frontend development server.

$ErrorActionPreference = "Continue"
$ProjectRoot = $PSScriptRoot

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  Starting PDF Form Agent (Dev Server)   " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# 1. Start Backend on Port 8001
Write-Host "`n[1/2] Starting FastAPI Backend on http://localhost:8001..." -ForegroundColor Yellow
if (Get-Command "uv" -ErrorAction SilentlyContinue) {
    $BackendProcess = Start-Process -FilePath "uv" -ArgumentList "run", "python", "-m", "src.main" -WorkingDirectory $ProjectRoot -PassThru
} elseif (Test-Path (Join-Path $ProjectRoot ".venv\Scripts\python.exe")) {
    $PythonExe = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
    $BackendProcess = Start-Process -FilePath $PythonExe -ArgumentList "-m", "src.main" -WorkingDirectory $ProjectRoot -PassThru
} else {
    $BackendProcess = Start-Process -FilePath "python" -ArgumentList "-m", "src.main" -WorkingDirectory $ProjectRoot -PassThru
}

# 2. Start Frontend on Port 5173
Write-Host "[2/2] Starting Vite Frontend on http://localhost:5173..." -ForegroundColor Yellow
$FrontendDir = Join-Path $ProjectRoot "frontend"

if (Get-Command "npm.cmd" -ErrorAction SilentlyContinue) {
    $FrontendProcess = Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev" -WorkingDirectory $FrontendDir -PassThru
} else {
    $FrontendProcess = Start-Process -FilePath "npm" -ArgumentList "run", "dev" -WorkingDirectory $FrontendDir -PassThru
}

# Wait briefly and launch browser
Start-Sleep -Seconds 3
Write-Host "`nOpening browser at http://localhost:5173..." -ForegroundColor Green
Start-Process "http://localhost:5173"

Write-Host "`n[Running] Backend PID: $($BackendProcess.Id) | Frontend PID: $($FrontendProcess.Id)" -ForegroundColor Cyan
Write-Host "[Running] Press Ctrl+C in this terminal to stop both servers.`n" -ForegroundColor Green

try {
    while ($true) {
        Start-Sleep -Seconds 1
        if ($BackendProcess.HasExited -or $FrontendProcess.HasExited) {
            break
        }
    }
}
finally {
    Write-Host "`nStopping servers..." -ForegroundColor Yellow
    if ($BackendProcess -and -not $BackendProcess.HasExited) {
        Stop-Process -Id $BackendProcess.Id -Force -ErrorAction SilentlyContinue
    }
    if ($FrontendProcess -and -not $FrontendProcess.HasExited) {
        # Kill npm and child node processes on Windows
        Stop-Process -Id $FrontendProcess.Id -Force -ErrorAction SilentlyContinue
    }
    # Kill any dangling Vite / Uvicorn processes if necessary
    Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*pdf_form_agent*" } | Stop-Process -Force -ErrorAction SilentlyContinue
    Write-Host "All servers stopped cleanly." -ForegroundColor Gray
}
