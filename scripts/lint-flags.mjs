#!/usr/bin/env node
/**
 * Feature Flag Linter
 * Validates flag metadata files and detects common issues
 */

import { readdir, readFile } from 'fs/promises';
import { join, basename } from 'path';
import { parse } from 'yaml';

const FLAGS_DIR = 'flags';
const MAX_RISK_PROD = 'medium'; // High-risk flags not allowed in production
const EXPIRES_WARN_DAYS = 30; // Warn if flag expires within 30 days

class FlagLinter {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  error(file, message) {
    this.errors.push(`❌ ${file}: ${message}`);
  }

  warn(file, message) {
    this.warnings.push(`⚠️  ${file}: ${message}`);
  }

  async lintFile(filePath) {
    const filename = basename(filePath);
    
    try {
      const content = await readFile(filePath, 'utf8');
      const flag = parse(content);
      
      this.validateRequired(filename, flag);
      this.validateKey(filename, flag);
      this.validateRisk(filename, flag);
      this.validateExpiry(filename, flag);
      this.validateEnvironments(filename, flag);
      this.validateOwner(filename, flag);
      
    } catch (error) {
      this.error(filename, `Parse error: ${error.message}`);
    }
  }

  validateRequired(filename, flag) {
    const required = ['key', 'default', 'description', 'owner', 'risk', 'expiresAt', 'environments'];
    
    for (const field of required) {
      if (!(field in flag)) {
        this.error(filename, `Missing required field: ${field}`);
      }
    }
  }

  validateKey(filename, flag) {
    if (!flag.key) return;
    
    // Key should match filename (without .yaml)
    const expectedKey = filename.replace('.yaml', '');
    if (flag.key !== expectedKey) {
      this.error(filename, `Key '${flag.key}' should match filename '${expectedKey}'`);
    }
    
    // Key format validation
    if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*)*$/.test(flag.key)) {
      this.error(filename, `Key '${flag.key}' should be lowercase, dot-separated (e.g., 'feature.v1')`);
    }
  }

  validateRisk(filename, flag) {
    const validRisks = ['low', 'medium', 'high'];
    
    if (!validRisks.includes(flag.risk)) {
      this.error(filename, `Risk must be one of: ${validRisks.join(', ')}`);
      return;
    }
    
    // Check production environment for high-risk flags
    if (flag.risk === 'high' && flag.environments?.production) {
      this.error(filename, 'High-risk flags cannot be enabled in production');
    }
  }

  validateExpiry(filename, flag) {
    if (!flag.expiresAt) return;
    
    const expiry = new Date(flag.expiresAt);
    const now = new Date();
    
    if (isNaN(expiry.getTime())) {
      this.error(filename, `Invalid expiresAt date: ${flag.expiresAt}`);
      return;
    }
    
    if (expiry <= now) {
      this.error(filename, `Flag has expired: ${flag.expiresAt}`);
      return;
    }
    
    const daysUntilExpiry = Math.ceil((expiry - now) / (24 * 60 * 60 * 1000));
    if (daysUntilExpiry <= EXPIRES_WARN_DAYS) {
      this.warn(filename, `Flag expires in ${daysUntilExpiry} days: ${flag.expiresAt}`);
    }
  }

  validateEnvironments(filename, flag) {
    if (!flag.environments || typeof flag.environments !== 'object') {
      this.error(filename, 'Environments must be an object with dev/staging/production booleans');
      return;
    }
    
    const required = ['development', 'staging', 'production'];
    for (const env of required) {
      if (!(env in flag.environments)) {
        this.error(filename, `Missing environment: ${env}`);
      } else if (typeof flag.environments[env] !== 'boolean') {
        this.error(filename, `Environment '${env}' must be boolean`);
      }
    }
    
    // Warn about production-enabled flags
    if (flag.environments.production && flag.risk !== 'low') {
      this.warn(filename, `${flag.risk}-risk flag enabled in production`);
    }
  }

  validateOwner(filename, flag) {
    if (!flag.owner) return;
    
    // Email format validation
    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(flag.owner)) {
      this.error(filename, `Owner should be a valid email address: ${flag.owner}`);
    }
  }

  async run() {
    console.log('🔍 Linting feature flags...\n');
    
    try {
      const files = await readdir(FLAGS_DIR);
      const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
      
      if (yamlFiles.length === 0) {
        console.log('No flag files found in', FLAGS_DIR);
        return 0;
      }
      
      console.log(`Found ${yamlFiles.length} flag files:`);
      yamlFiles.forEach(f => console.log(`  - ${f}`));
      console.log('');
      
      for (const file of yamlFiles) {
        await this.lintFile(join(FLAGS_DIR, file));
      }
      
      // Report results
      if (this.warnings.length > 0) {
        console.log('Warnings:');
        this.warnings.forEach(w => console.log(w));
        console.log('');
      }
      
      if (this.errors.length > 0) {
        console.log('Errors:');
        this.errors.forEach(e => console.log(e));
        console.log('');
        console.log(`❌ ${this.errors.length} errors found`);
        return 1;
      }
      
      console.log(`✅ All ${yamlFiles.length} flag files are valid`);
      if (this.warnings.length > 0) {
        console.log(`⚠️  ${this.warnings.length} warnings`);
      }
      
      return 0;
      
    } catch (error) {
      console.error('Linter failed:', error.message);
      return 1;
    }
  }
}

// Run linter
const linter = new FlagLinter();
process.exit(await linter.run());