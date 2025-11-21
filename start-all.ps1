# Starts all services in separate PowerShell windows
# - Server (Node API) on port 4000
# - Backend (FastAPI) on port 8000
# - Client (Vite) on port 5173

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Start-Server {
  $Path = Join-Path $Root 'server'
  Start-Process powershell -ArgumentList @(
    '-NoExit',
    '-Command',
    "Set-Location '$Path'; npm run dev"
  ) -WindowStyle Normal -WorkingDirectory $Path
}

function Start-Backend {
  $Path = Join-Path $Root 'backend'
  $VenvPython = Join-Path $Path '.venv/Scripts/python.exe'
  $Activate = Join-Path $Path '.venv/Scripts/Activate.ps1'

  $backendCmd = @()
  $backendCmd += "Set-Location '$Path'"
  $backendCmd += "if (!(Test-Path '$VenvPython')) { py -m venv .venv }"
  $backendCmd += ".\\.venv\\Scripts\\python -m pip install --upgrade pip"
  $backendCmd += ".\\.venv\\Scripts\\python -m pip install -r requirements.txt"
  $backendCmd += ". '$Activate'"
  $backendCmd += "uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

  Start-Process powershell -ArgumentList @(
    '-NoExit',
    '-ExecutionPolicy','Bypass',
    '-Command',
    ($backendCmd -join '; ')
  ) -WindowStyle Normal -WorkingDirectory $Path
}

function Start-Client {
  $Path = Join-Path $Root 'client'
  Start-Process powershell -ArgumentList @(
    '-NoExit',
    '-Command',
    "Set-Location '$Path'; npm run dev"
  ) -WindowStyle Normal -WorkingDirectory $Path
}

Write-Host 'Starting Server (Node API)...'
Start-Server

Write-Host 'Starting Backend (FastAPI)...'
Start-Backend

Write-Host 'Starting Client (Vite)...'
Start-Client

Write-Host "All start commands dispatched. Access the app at http://localhost:5173"
