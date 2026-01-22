#!/bin/bash
# Start Frontend Development Server - Simulator Poste
# React + Vite with HMR (Hot Module Replacement)

set -e  # Exit on error

echo "🎨 Starting Frontend Development Server..."
echo ""

# Check if we're in the correct directory
if [ ! -f "frontend/package.json" ]; then
    echo "❌ Error: frontend/package.json not found"
    echo "   Please run this script from the project root directory"
    exit 1
fi

# Navigate to frontend directory
cd frontend

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing Node.js dependencies..."
    npm install
    echo "✅ Dependencies installed"
else
    echo "✅ Dependencies already installed"
fi

echo ""
echo "🎯 Frontend server starting on http://localhost:5173"
echo "🔥 Hot Module Replacement (HMR) enabled"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Start Vite dev server
npm run dev
