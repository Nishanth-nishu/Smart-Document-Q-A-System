# Docker Push Script for DocKnowledge
# Uses username: nishanthr23

Write-Host "🚀 Starting Docker Build and Push process for nishanthr23..." -ForegroundColor Cyan

# 1. Backend
Write-Host "`n📦 Building Backend image..." -ForegroundColor Yellow
docker build -t nishanthr23/docknowledge-backend:latest -f docker/backend.Dockerfile .
if ($LASTEXITCODE -ne 0) { Write-Host "❌ Backend build failed"; exit }

Write-Host "⬆️ Pushing Backend image..." -ForegroundColor Yellow
docker push nishanthr23/docknowledge-backend:latest

# 2. Frontend
Write-Host "`n📦 Building Frontend image..." -ForegroundColor Yellow
cd frontend-app
docker build -t nishanthr23/docknowledge-frontend:latest .
if ($LASTEXITCODE -ne 0) { Write-Host "❌ Frontend build failed"; exit }

Write-Host "⬆️ Pushing Frontend image..." -ForegroundColor Yellow
docker push nishanthr23/docknowledge-frontend:latest
cd ..

Write-Host "`n✅ All images pushed successfully to Docker Hub!" -ForegroundColor Green
Write-Host "Backend: nishanthr23/docknowledge-backend:latest"
Write-Host "Frontend: nishanthr23/docknowledge-frontend:latest"
