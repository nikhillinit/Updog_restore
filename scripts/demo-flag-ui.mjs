#!/usr/bin/env node
/**
 * Feature Flag UI Demo
 * Demonstrates flag behavior without requiring full server setup
 */

import { readFile } from 'fs/promises';
import { join } from 'path';

// Simulate flag system behavior
class MockFlagSystem {
  constructor() {
    this.flags = {
      'wizard.v1': { enabled: false, exposeToClient: true },
      'reserves.v1_1': { enabled: false, exposeToClient: false }
    };
    this.killSwitchActive = false;
    this.cache = { age: 0, hash: 'abc123', flagCount: 2 };
  }

  getClientFlags() {
    if (this.killSwitchActive) {
      return {};
    }
    
    const clientFlags = {};
    for (const [key, flag] of Object.entries(this.flags)) {
      if (flag.exposeToClient) {
        clientFlags[key] = flag.enabled;
      }
    }
    return clientFlags;
  }

  updateFlag(key, enabled, actor) {
    if (this.flags[key]) {
      console.log(`🔄 Flag update: ${key} ${this.flags[key].enabled} → ${enabled} (by ${actor})`);
      this.flags[key].enabled = enabled;
      this.cache.age = 0; // Reset cache
      this.cache.hash = Math.random().toString(36).substr(2, 8);
      return true;
    }
    return false;
  }

  activateKillSwitch() {
    console.log('🚨 KILL SWITCH ACTIVATED - All flags disabled');
    this.killSwitchActive = true;
    this.cache.age = 0;
    this.cache.flagCount = 0;
  }

  deactivateKillSwitch() {
    console.log('✅ Kill switch deactivated - Flags restored');
    this.killSwitchActive = false;
    this.cache.flagCount = Object.keys(this.flags).length;
  }

  getStatus() {
    return {
      cache: this.cache,
      killSwitchActive: this.killSwitchActive,
      environment: 'demo',
      timestamp: new Date().toISOString()
    };
  }
}

// Simulate React useFlag hook behavior
function useFlag(flagSystem, key) {
  const flags = flagSystem.getClientFlags();
  return flags[key] ?? false;
}

// UI Component simulation
function renderFundWizard(flagSystem) {
  const wizardEnabled = useFlag(flagSystem, 'wizard.v1');
  
  if (wizardEnabled) {
    return `
    ┌─────────────────────────────────────┐
    │  🧙 Fund Setup Wizard (v1.1)       │
    │                                     │
    │  Step 1: Fund Details               │
    │  Step 2: Investment Strategy        │
    │  Step 3: Fee Structure              │
    │  Step 4: Review & Launch            │
    │                                     │
    │  [Continue] [Save Draft]            │
    └─────────────────────────────────────┘`;
  } else {
    return `
    ┌─────────────────────────────────────┐
    │  📊 Fund Setup (Legacy)             │
    │                                     │
    │  Fund Name: [____________]          │
    │  Fund Size: [____________]          │
    │  Management Fee: [_______]          │
    │                                     │
    │  [Create Fund]                      │
    └─────────────────────────────────────┘`;
  }
}

function renderReservesEngine(flagSystem) {
  const reservesV11 = flagSystem.flags['reserves.v1_1']?.enabled ?? false;
  
  if (reservesV11) {
    return `
    ┌─────────────────────────────────────┐
    │  🔬 Reserves Engine v1.1            │
    │                                     │
    │  ✅ Extra remain pass               │
    │  ✅ Enhanced diagnostics            │
    │  ✅ Performance optimizations       │
    │                                     │
    │  Processing time: 45ms              │
    │  Accuracy: 99.7%                    │
    └─────────────────────────────────────┘`;
  } else {
    return `
    ┌─────────────────────────────────────┐
    │  📈 Reserves Engine v1.0            │
    │                                     │
    │  ✅ Basic reserve calculations       │
    │  ⚠️  Limited diagnostics            │
    │                                     │
    │  Processing time: 120ms             │
    │  Accuracy: 97.2%                    │
    └─────────────────────────────────────┘`;
  }
}

function printDashboard(flagSystem) {
  console.clear();
  console.log('🚩 POVC Fund Platform - Feature Flag Demo\n');
  
  // Show flag status
  const status = flagSystem.getStatus();
  const clientFlags = flagSystem.getClientFlags();
  
  console.log('📊 Current Flag State:');
  console.log(`   wizard.v1: ${clientFlags['wizard.v1'] ? '🟢 ON' : '🔴 OFF'}`);
  console.log(`   reserves.v1_1: ${flagSystem.flags['reserves.v1_1'].enabled ? '🟢 ON' : '🔴 OFF'} (internal)`);
  console.log(`   Kill Switch: ${status.killSwitchActive ? '🚨 ACTIVE' : '✅ OFF'}`);
  console.log(`   Cache: ${status.cache.flagCount} flags, hash: ${status.cache.hash}\n`);
  
  // Show UI components
  console.log('🎨 User Interface:\n');
  console.log(renderFundWizard(flagSystem));
  console.log('\n');
  console.log(renderReservesEngine(flagSystem));
  console.log('\n');
  
  console.log('📡 API Response /api/flags:');
  console.log(JSON.stringify({
    flags: clientFlags,
    timestamp: status.timestamp,
    _meta: { note: "Only flags marked exposeToClient=true are included" }
  }, null, 2));
  console.log('\n');
}

async function runDemo() {
  const flagSystem = new MockFlagSystem();
  const autoMode = process.argv.includes('--auto');
  
  console.log(`🎬 Starting Feature Flag UI Demo${autoMode ? ' (Auto Mode)' : ''}...\n`);
  
  // Initial state
  printDashboard(flagSystem);
  if (!autoMode) {
    console.log('Press Enter to enable wizard.v1...');
    await new Promise(resolve => process.stdin.once('data', resolve));
  } else {
    console.log('Auto mode: enabling wizard.v1...');
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  
  // Enable wizard
  flagSystem.updateFlag('wizard.v1', true, 'demo-user@povc.fund');
  printDashboard(flagSystem);
  if (!autoMode) {
    console.log('Press Enter to enable reserves.v1_1 (internal)...');
    await new Promise(resolve => process.stdin.once('data', resolve));
  } else {
    console.log('Auto mode: enabling reserves.v1_1...');
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  
  // Enable reserves (internal flag)
  flagSystem.updateFlag('reserves.v1_1', true, 'backend-team@povc.fund');
  printDashboard(flagSystem);
  if (!autoMode) {
    console.log('Press Enter to activate KILL SWITCH...');
    await new Promise(resolve => process.stdin.once('data', resolve));
  } else {
    console.log('Auto mode: activating kill switch...');
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  
  // Kill switch demo
  flagSystem.activateKillSwitch();
  printDashboard(flagSystem);
  console.log('🚨 NOTICE: All client-facing features disabled for safety!');
  if (!autoMode) {
    console.log('Press Enter to restore flags...');
    await new Promise(resolve => process.stdin.once('data', resolve));
  } else {
    console.log('Auto mode: restoring flags...');
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Restore
  flagSystem.deactivateKillSwitch();
  printDashboard(flagSystem);
  console.log('✅ Demo complete! All features restored.');
  process.exit(0);
}

// Show flag metadata
async function showFlagMetadata() {
  console.log('📋 Flag Metadata:\n');
  
  try {
    const wizardYaml = await readFile('flags/wizard.v1.yaml', 'utf8');
    console.log('wizard.v1.yaml:');
    console.log(wizardYaml);
    
    const reservesYaml = await readFile('flags/reserves.v1_1.yaml', 'utf8');
    console.log('reserves.v1_1.yaml:');
    console.log(reservesYaml);
  } catch (error) {
    console.log('⚠️  Flag metadata files not found. Run from project root.');
  }
  
  console.log('\nStarting interactive demo...\n');
}

// Run demo
await showFlagMetadata();
await runDemo();