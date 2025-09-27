#!/bin/bash

# Updog Platform - Railway Deployment Script
# Run this after: railway login

echo "🚀 Starting Updog Platform deployment..."

# Check if logged in
if ! railway whoami > /dev/null 2>&1; then
    echo "❌ Please run 'railway login' first"
    exit 1
fi

echo "✅ Railway authentication verified"

# Initialize project
echo "📦 Initializing Railway project..."
railway init --name updog-fund-platform

# Add services
echo "🗄️ Adding PostgreSQL..."
railway add postgresql

echo "⚡ Adding Redis..."
railway add redis

# Set environment variables
echo "🔧 Setting environment variables..."
railway variables set NODE_ENV=production
railway variables set CORS_ORIGIN=https://updog-fund-platform.up.railway.app

# Deploy
echo "🚀 Deploying application..."
railway up --detach

# Get URL
echo "🌐 Getting deployment URL..."
railway open

echo "✅ Deployment complete! Check the browser for your live URL."