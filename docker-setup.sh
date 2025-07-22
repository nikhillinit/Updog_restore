#!/bin/bash

# PostgreSQL setup
echo "Setting up PostgreSQL..."
docker pull postgres:16-alpine
docker run -d --name updog-pg \
  -e POSTGRES_PASSWORD=updogpw \
  -e POSTGRES_USER=updog \
  -e POSTGRES_DB=updog_db \
  -p 5432:5432 \
  postgres:16-alpine

# Redis setup
echo "Setting up Redis..."
docker pull redis:7-alpine
docker run -d --name updog-redis \
  -p 6379:6379 \
  redis:7-alpine

# Wait for containers to be ready
echo "Waiting for services to start..."
sleep 5

# Check status
echo "Checking container status..."
docker ps | grep -E "(updog-pg|updog-redis)"

echo "Setup complete! You can now run:"
echo "  npm run db:migrate"
echo "  npm run dev"