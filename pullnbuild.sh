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
# 1. Backend - Pull and Build Docker
# ==========================================
echo ""
echo "[1/2] Processing backend-spotifydownloader..."
cd "$CURRENT_DIR"

echo "- Pulling latest changes from git..."
git pull origin main

echo "- Stopping existing containers..."
docker compose down

echo "- Building Docker image..."
docker compose build

echo "- Starting containers..."
docker compose up -d

echo "- Waiting for services to be healthy..."
sleep 5

echo "- Checking container status..."
docker compose ps

echo "  ✅ Backend updated and running!"

# ==========================================
# 2. Frontend - Pull and Build Docker
# ==========================================
echo ""
echo "[2/2] Processing frontend-spotifydownloader..."
cd "$PARENT_DIR/frontend-spotifydownloader"

echo "- Pulling latest changes from git..."
git pull origin main

echo "- Stopping existing containers..."
docker compose down

echo "- Building Docker image..."
docker compose build

echo "- Starting containers..."
docker compose up -d

echo "- Checking container status..."
docker compose ps

echo "  ✅ Frontend updated and running!"

# ==========================================
# Summary
# ==========================================
echo ""
echo "=========================================="
echo "Pull & Build Completed Successfully!"
echo "=========================================="
echo "✅ Backend: Docker containers running"
echo "✅ Frontend: Docker containers running"
echo ""
echo "Container Status:"
docker ps --filter "name=spotifydownloader" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo "Access your applications:"
echo "  Backend API: http://localhost:3081"
echo "  Frontend: http://localhost:3080"
echo ""
echo "Useful commands:"
echo "  docker compose logs -f           - View logs"
echo "  docker compose restart           - Restart containers"
echo "  docker compose down              - Stop containers"
echo "  docker exec -it <container> sh   - Enter container shell"
echo "=========================================="
