#!/bin/bash

# Railway Deployment Script for Updog Platform
set -e

echo "🚂 Starting Railway deployment..."

# Check if logged in
if ! railway whoami > /dev/null 2>&1; then
    echo "❌ Please run 'railway login' first"
    exit 1
fi

echo "✅ Railway authentication verified"

# Set environment variables to avoid build issues
export HUSKY=0
export NODE_ENV=production

# Commit current changes if any
if [[ -n $(git status --porcelain) ]]; then
    echo "📝 Committing Railway fixes..."
    git add .
    git commit -m "fix: Railway deployment configuration

- Update Dockerfile to Node.js 22
- Add Railway-specific build configuration
- Fix Husky issues in production builds
- Add environment variables for Railway"
fi

# Push to Railway
echo "🚀 Deploying to Railway..."
railway up --detach

# Wait for deployment
echo "⏳ Waiting for deployment to complete..."
sleep 10

# Get deployment URL
echo "🌐 Getting deployment URL..."
railway status

echo "✅ Railway deployment complete!"
echo "🎉 Your app should be live at the Railway URL shown above"