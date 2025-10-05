#!/usr/bin/env node

/**
 * Lighthouse CI Runner with Automated Server Management
 *
 * This script:
 * 1. Starts Vite preview server on port 4173
 * 2. Runs Lighthouse CI performance tests
 * 3. Cleans up server process on completion or error
 */

const { spawn } = require('child_process');
const { execSync } = require('child_process');

let previewServer = null;

// Cleanup function to ensure server is always stopped
function cleanup() {
  if (previewServer) {
    console.log('\n🧹 Stopping preview server...');
    previewServer.kill();
    previewServer = null;
  }
}

// Handle process termination
process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});

process.on('exit', cleanup);

async function runLighthouseCI() {
  try {
    // Step 1: Build the project
    console.log('📦 Building project...');
    execSync('npm run build', { stdio: 'inherit' });

    // Step 2: Start preview server
    console.log('\n🚀 Starting Vite preview server on port 4173...');
    previewServer = spawn('npm', ['run', 'preview'], {
      stdio: 'pipe',
      shell: true
    });

    // Wait for server to be ready
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Preview server failed to start within 10 seconds'));
      }, 10000);

      previewServer.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(output);

        // Look for server ready indicator
        if (output.includes('4173') || output.includes('ready')) {
          clearTimeout(timeout);
          resolve();
        }
      });

      previewServer.stderr.on('data', (data) => {
        console.error(data.toString());
      });

      previewServer.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    // Give server a moment to fully initialize
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 3: Run Lighthouse CI
    console.log('\n🔍 Running Lighthouse CI tests...');
    execSync('npx lhci autorun', { stdio: 'inherit' });

    console.log('\n✅ Lighthouse CI completed successfully!');
    cleanup();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Lighthouse CI failed:', error.message);
    cleanup();
    process.exit(1);
  }
}

// Run the tests
runLighthouseCI();
