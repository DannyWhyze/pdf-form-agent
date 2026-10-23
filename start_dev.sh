#!/usr/bin/env bash
# PDF Form Agent - Development Startup Script for Linux & macOS
# Starts both the FastAPI backend and Vite frontend development servers.

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

echo "========================================="
echo "  Starting PDF Form Agent (Dev Server)   "
echo "========================================="

# 1. Start Backend on Port 8001
echo -e "\n[1/2] Starting FastAPI Backend on http://localhost:8001..."
if command -v uv >/dev/null 2>&1; then
    uv run python -m src.main &
    BACKEND_PID=$!
elif [ -f "$PROJECT_ROOT/.venv/bin/python" ]; then
    "$PROJECT_ROOT/.venv/bin/python" -m src.main &
    BACKEND_PID=$!
elif command -v python3 >/dev/null 2>&1; then
    python3 -m src.main &
    BACKEND_PID=$!
else
    python -m src.main &
    BACKEND_PID=$!
fi

# 2. Start Frontend on Port 5173
echo "[2/2] Starting Vite Frontend on http://localhost:5173..."
cd "$PROJECT_ROOT/frontend"
npm run dev &
FRONTEND_PID=$!
cd "$PROJECT_ROOT"

# Cleanup handler on exit or interrupt
cleanup() {
    echo -e "\nStopping servers..."
    if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
        kill "$BACKEND_PID" 2>/dev/null || true
    fi
    if [ -n "$FRONTEND_PID" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
        kill "$FRONTEND_PID" 2>/dev/null || true
    fi
    echo "All servers stopped cleanly."
}

trap cleanup EXIT INT TERM

# Wait briefly and attempt to open browser
sleep 3
echo -e "\nOpening browser at http://localhost:5173..."
if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://localhost:5173" >/dev/null 2>&1 || true
elif command -v open >/dev/null 2>&1; then
    open "http://localhost:5173" >/dev/null 2>&1 || true
fi

echo -e "\n[Running] Backend PID: $BACKEND_PID | Frontend PID: $FRONTEND_PID"
echo -e "[Running] Press Ctrl+C to stop both servers.\n"

wait
