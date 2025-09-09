#!/usr/bin/env node

/**
 * Security Headers Validation Script
 * Checks that required security headers are present and correctly configured
 */

import assert from 'node:assert';
import { exit } from 'node:process';

const base = process.env.HEADERS_CHECK_URL || process.env.BASE_URL;
if (!base) {
  console.error('❌ HEADERS_CHECK_URL or BASE_URL environment variable is required');
  exit(1);
}

const timeout = parseInt(process.env.HEADERS_CHECK_TIMEOUT || '10000');

async function checkSecurityHeaders() {
  console.log(`🔍 Checking security headers for: ${base}`);
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(`${base}/healthz`, { 
      redirect: 'manual',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (response.status >= 500) {
      throw new Error(`Server error: ${response.status} ${response.statusText}`);
    }
    
    const headers = Object.fromEntries(response.headers.entries());
    
    // Required security headers
    const requiredHeaders = [
      'strict-transport-security',
      'x-content-type-options', 
      'x-frame-options',
      'referrer-policy'
    ];
    
    // CSP can be either enforced or report-only
    const cspHeader = headers['content-security-policy'] || 
                     headers['content-security-policy-report-only'];
    
    console.log('📋 Security Headers Audit:');
    
    // Check required headers
    for (const headerName of requiredHeaders) {
      const value = headers[headerName];
      if (!value) {
        console.log(`❌ Missing required header: ${headerName}`);
        assert(false, `Missing required security header: ${headerName}`);
      } else {
        console.log(`✅ ${headerName}: ${value}`);
      }
    }
    
    // Check CSP
    if (!cspHeader) {
      console.log('❌ Missing Content Security Policy header');
      assert(false, 'Missing Content-Security-Policy or Content-Security-Policy-Report-Only header');
    } else {
      const isReportOnly = !!headers['content-security-policy-report-only'];
      console.log(`✅ content-security-policy${isReportOnly ? '-report-only' : ''}: ${cspHeader}`);
      
      // Validate CSP directives
      const requiredDirectives = ["default-src 'self'"];
      for (const directive of requiredDirectives) {
        if (!cspHeader.includes(directive)) {
          console.log(`❌ CSP missing required directive: ${directive}`);
          assert(false, `CSP must include directive: ${directive}`);
        }
      }
    }
    
    // Validate specific header values
    const hsts = headers['strict-transport-security'];
    if (hsts && !hsts.includes('max-age=')) {
      console.log('❌ HSTS header missing max-age directive');
      assert(false, 'HSTS header must include max-age directive');
    }
    
    const xfo = headers['x-frame-options'];
    if (xfo && !['DENY', 'SAMEORIGIN'].includes(xfo.toUpperCase())) {
      console.log(`❌ X-Frame-Options has unsafe value: ${xfo}`);
      assert(false, 'X-Frame-Options must be DENY or SAMEORIGIN');
    }
    
    const xcto = headers['x-content-type-options'];
    if (xcto && xcto.toLowerCase() !== 'nosniff') {
      console.log(`❌ X-Content-Type-Options has wrong value: ${xcto}`);
      assert(false, 'X-Content-Type-Options must be "nosniff"');
    }
    
    console.log('✅ All security headers validation passed');
    return true;
    
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error(`❌ Request timeout after ${timeout}ms`);
    } else {
      console.error(`❌ Security headers check failed: ${error.message}`);
    }
    exit(1);
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  await checkSecurityHeaders();
}

export { checkSecurityHeaders };