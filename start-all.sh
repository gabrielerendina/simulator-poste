#!/bin/bash
# Start Full Stack Application - Simulator Poste
# Runs both backend and frontend concurrently

set -e  # Exit on error

echo "🚀 Starting Full Stack Application - Simulator Poste"
echo "=================================================="
echo ""

# Check if we're in the correct directory
if [ ! -f "backend/main.py" ] || [ ! -f "frontend/package.json" ]; then
    echo "❌ Error: Project files not found"
    echo "   Please run this script from the project root directory"
    exit 1
fi

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Shutting down servers..."
    kill $(jobs -p) 2>/dev/null || true
    exit 0
}

# Trap Ctrl+C and call cleanup
trap cleanup INT TERM

# Check if ports are already in use
if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "⚠️  Port 8000 is already in use (Backend)"
    echo "   Kill the process or use a different port"
    exit 1
fi

if lsof -Pi :5173 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "⚠️  Port 5173 is already in use (Frontend)"
    echo "   Kill the process or use a different port"
    exit 1
fi

echo "📦 Checking dependencies..."
echo ""

# Ensure logs directory exists
mkdir -p logs

# Start backend in background
echo "🔧 Starting Backend (http://localhost:8000)..."
./start-backend.sh > logs/backend.log 2>&1 &
BACKEND_PID=$!

# Wait a bit for backend to start
sleep 3

# Start frontend in background
echo "🎨 Starting Frontend (http://localhost:5173)..."
./start-frontend.sh > logs/frontend.log 2>&1 &
FRONTEND_PID=$!

echo ""
echo "✅ Both servers started successfully!"
echo ""
echo "📊 Backend:  http://localhost:8000 (PID: $BACKEND_PID)"
echo "   API Docs: http://localhost:8000/docs"
echo ""
echo "🎨 Frontend: http://localhost:5173 (PID: $FRONTEND_PID)"
echo ""
echo "📝 Logs:"
echo "   Backend:  tail -f logs/backend.log"
echo "   Frontend: tail -f logs/frontend.log"
echo ""
echo "Press Ctrl+C to stop all servers"
echo ""

# Wait for background processes
wait
