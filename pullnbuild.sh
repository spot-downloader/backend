#!/bin/bash

# Script untuk pull dan build Spotify Downloader
# Usage: ./pullnbuild.sh

echo "=========================================="
echo "Starting Pull & Build Process..."
echo "=========================================="

# Get the parent directory
PARENT_DIR="$(dirname "$(pwd)")"
CURRENT_DIR="$(pwd)"

# ==========================================
# 1. Backend - Pull and PM2
# ==========================================
echo ""
echo "[1/2] Processing backend-spotifydownloader..."
cd "$CURRENT_DIR"

echo "- Pulling latest changes from git..."
git pull origin main

echo "- Installing dependencies..."
npm install --omit=dev

# PM2 Process Management
if command -v pm2 &> /dev/null; then
    BACKEND_NAME="spotifydownloader-backend"
    WORKER_NAME="spotifydownloader-worker"
    
    # Backend API
    echo "- Checking PM2 process: $BACKEND_NAME..."
    if pm2 describe "$BACKEND_NAME" &> /dev/null; then
        echo "- PM2 process found, restarting..."
        pm2 restart "$BACKEND_NAME"
        echo "  ✅ PM2 process '$BACKEND_NAME' restarted!"
    else
        echo "- PM2 process not found, starting new process..."
        pm2 start index.js --name "$BACKEND_NAME"
        echo "  ✅ PM2 process '$BACKEND_NAME' started!"
    fi
    
    # Worker
    echo "- Checking PM2 process: $WORKER_NAME..."
    if pm2 describe "$WORKER_NAME" &> /dev/null; then
        echo "- PM2 process found, restarting..."
        pm2 restart "$WORKER_NAME"
        echo "  ✅ PM2 process '$WORKER_NAME' restarted!"
    else
        echo "- PM2 process not found, starting new process..."
        pm2 start worker.js --name "$WORKER_NAME"
        echo "  ✅ PM2 process '$WORKER_NAME' started!"
    fi
    
    pm2 save
else
    echo "  ⚠️  PM2 not installed (manual restart needed)"
fi

echo "  ✅ Backend updated!"

# ==========================================
# 2. Frontend - Pull and Build
# ==========================================
echo ""
echo "[2/2] Processing frontend-spotifydownloader..."
cd "$PARENT_DIR/frontend-spotifydownloader"

echo "- Pulling latest changes from git..."
git pull origin main

echo "- Installing dependencies..."
npm install

echo "- Removing old build..."
rm -rf dist

echo "- Building frontend..."
npm run build

# PM2 for Frontend (jika pakai SSR/server, skip jika static)
if command -v pm2 &> /dev/null; then
    FRONTEND_NAME="spotifydownloader-frontend"
    
    # Cek apakah ada server.js untuk frontend
    if [ -f "server.js" ]; then
        echo "- Checking PM2 process: $FRONTEND_NAME..."
        if pm2 describe "$FRONTEND_NAME" &> /dev/null; then
            echo "- PM2 process found, restarting..."
            pm2 restart "$FRONTEND_NAME"
            echo "  ✅ PM2 process '$FRONTEND_NAME' restarted!"
        else
            echo "- PM2 process not found, starting new process..."
            pm2 start server.js --name "$FRONTEND_NAME"
            echo "  ✅ PM2 process '$FRONTEND_NAME' started!"
        fi
        pm2 save
    else
        echo "  ℹ️  Frontend is static (served by nginx/other web server)"
    fi
else
    echo "  ⚠️  PM2 not installed"
fi

echo "  ✅ Frontend build completed!"

# ==========================================
# Summary
# ==========================================
echo ""
echo "=========================================="
echo "Pull & Build Completed Successfully!"
echo "=========================================="
echo "✅ Backend API: PM2 managed"
echo "✅ Worker: PM2 managed"
echo "✅ Frontend: Built"
echo ""
echo "PM2 Status:"
pm2 ls
echo ""
echo "Useful commands:"
echo "  pm2 logs [name]     - View logs"
echo "  pm2 restart [name]  - Restart process"
echo "  pm2 stop [name]     - Stop process"
echo "  pm2 monit           - Monitor all processes"
echo "=========================================="
