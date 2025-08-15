#!/usr/bin/env node
/**
 * Development environment setup script
 * Ensures Docker services are running and database is ready
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

function log(message, color = 'cyan') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function checkDocker() {
  try {
    execSync('docker --version', { stdio: 'pipe' });
    log('✅ Docker is installed', 'green');
    return true;
  } catch {
    log('❌ Docker is not installed', 'red');
    log('   Install from: https://docker.com/get-started', 'yellow');
    return false;
  }
}

async function startServices() {
  log('\n🐳 Starting Docker services...', 'cyan');
  
  try {
    // Start services
    execSync('docker-compose up -d', { stdio: 'inherit' });
    
    // Wait for PostgreSQL
    log('\n⏳ Waiting for PostgreSQL...', 'yellow');
    let pgReady = false;
    for (let i = 0; i < 30; i++) {
      try {
        execSync('docker-compose exec -T postgres pg_isready -U postgres', { stdio: 'pipe' });
        pgReady = true;
        break;
      } catch {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    
    if (!pgReady) {
      throw new Error('PostgreSQL failed to start');
    }
    log('✅ PostgreSQL is ready', 'green');
    
    // Wait for Redis
    log('\n⏳ Waiting for Redis...', 'yellow');
    let redisReady = false;
    for (let i = 0; i < 30; i++) {
      try {
        execSync('docker-compose exec -T redis redis-cli ping', { stdio: 'pipe' });
        redisReady = true;
        break;
      } catch {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    
    if (!redisReady) {
      log('⚠️  Redis failed to start (optional)', 'yellow');
    } else {
      log('✅ Redis is ready', 'green');
    }
    
    return true;
  } catch (error) {
    log(`❌ Failed to start services: ${error.message}`, 'red');
    return false;
  }
}

async function runMigrations() {
  log('\n📝 Running database migrations...', 'cyan');
  
  try {
    // Check if migrations directory exists
    if (!existsSync('./migrations')) {
      log('   No migrations directory found, skipping', 'yellow');
      return true;
    }
    
    // Run Drizzle push
    execSync('npm run db:push', { stdio: 'inherit' });
    log('✅ Migrations completed', 'green');
    return true;
  } catch (error) {
    log(`⚠️  Migration failed: ${error.message}`, 'yellow');
    return false;
  }
}

async function main() {
  log('🚀 POVC Development Environment Setup\n', 'cyan');
  log('=====================================\n', 'cyan');
  
  // Check Docker
  if (!await checkDocker()) {
    process.exit(1);
  }
  
  // Start services
  if (!await startServices()) {
    process.exit(1);
  }
  
  // Run migrations
  await runMigrations();
  
  // Success message
  log('\n=====================================', 'cyan');
  log('🎉 Development environment is ready!', 'green');
  log('\nServices available:', 'cyan');
  log('  • PostgreSQL: localhost:5432', 'green');
  log('  • Redis:      localhost:6379', 'green');
  log('  • Adminer:    http://localhost:8080', 'green');
  log('\nDatabase credentials:', 'cyan');
  log('  • User:     postgres', 'yellow');
  log('  • Password: postgres', 'yellow');
  log('  • Database: povc_dev', 'yellow');
  log('\nNext step:', 'cyan');
  log('  npm run dev', 'green');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  log('\n\n⚠️  Shutting down services...', 'yellow');
  try {
    execSync('docker-compose down', { stdio: 'inherit' });
    log('✅ Services stopped', 'green');
  } catch {}
  process.exit(0);
});

main().catch(error => {
  log(`\n❌ Setup failed: ${error.message}`, 'red');
  process.exit(1);
});