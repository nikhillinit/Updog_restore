#!/usr/bin/env tsx
/**
 * Generate Strong Secrets Script
 * Creates cryptographically secure random secrets for deployment
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

interface SecretConfig {
  name: string;
  length: number;
  description: string;
  encoding: 'base64url' | 'hex' | 'base64';
}

const SECRETS: SecretConfig[] = [
  {
    name: 'SESSION_SECRET',
    length: 64,
    description: 'Express session encryption key',
    encoding: 'base64url',
  },
  {
    name: 'JWT_SECRET',
    length: 64,
    description: 'JSON Web Token signing key',
    encoding: 'base64url',
  },
  {
    name: 'HEALTH_KEY',
    length: 32,
    description: 'Health endpoint authentication key',
    encoding: 'base64url',
  },
  {
    name: 'METRICS_KEY',
    length: 32,
    description: 'Metrics endpoint authentication key',
    encoding: 'base64url',
  },
  {
    name: 'ENCRYPTION_KEY',
    length: 32,
    description: 'Data encryption key (AES-256)',
    encoding: 'hex',
  },
];

function generateSecret(length: number, encoding: SecretConfig['encoding']): string {
  const bytes = crypto.randomBytes(length);

  switch (encoding) {
    case 'base64url':
      return bytes.toString('base64url');
    case 'hex':
      return bytes.toString('hex');
    case 'base64':
      return bytes.toString('base64');
    default:
      return bytes.toString('base64url');
  }
}

function validateSecret(secret: string, minLength: number): boolean {
  if (secret.length < minLength) {
    return false;
  }

  // Check for weak patterns
  const weakPatterns = [
    /password/i,
    /secret/i,
    /12345/,
    /test/i,
    /dev/i,
    /admin/i,
    /default/i,
  ];

  for (const pattern of weakPatterns) {
    if (pattern.test(secret)) {
      return false;
    }
  }

  return true;
}

function generateSecrets(format: 'env' | 'json' | 'gcp' | 'shell' = 'env'): string {
  const secrets: Record<string, string> = {};

  console.log('🔐 Generating cryptographically secure secrets...\n');

  for (const config of SECRETS) {
    const secret = generateSecret(config.length, config.encoding);

    // Validate generated secret
    if (!validateSecret(secret, config.length)) {
      throw new Error(`Generated secret failed validation: ${config.name}`);
    }

    secrets[config.name] = secret;
    console.log(`✅ ${config.name} (${secret.length} chars)`);
    console.log(`   ${config.description}`);
  }

  console.log('\n📋 Secrets generated successfully!\n');

  // Format output
  switch (format) {
    case 'env':
      return formatEnv(secrets);

    case 'json':
      return formatJson(secrets);

    case 'gcp':
      return formatGcp(secrets);

    case 'shell':
      return formatShell(secrets);

    default:
      return formatEnv(secrets);
  }
}

function formatEnv(secrets: Record<string, string>): string {
  let output = '# Generated secrets - Add to .env.production\n';
  output += `# Generated: ${new Date().toISOString()}\n`;
  output += '# WARNING: Keep these secrets secure and never commit to version control\n\n';

  for (const [name, value] of Object.entries(secrets)) {
    const config = SECRETS.find(s => s.name === name);
    output += `# ${config?.description || name}\n`;
    output += `${name}="${value}"\n\n`;
  }

  return output;
}

function formatJson(secrets: Record<string, string>): string {
  return JSON.stringify(secrets, null, 2);
}

function formatGcp(secrets: Record<string, string>): string {
  let output = '#!/bin/bash\n';
  output += '# GCP Secret Manager Commands\n';
  output += `# Generated: ${new Date().toISOString()}\n\n`;

  output += 'PROJECT_ID="${GCP_PROJECT}"\n\n';

  for (const [name, value] of Object.entries(secrets)) {
    const secretName = name.toLowerCase().replace(/_/g, '-');
    output += `# ${name}\n`;
    output += `echo "${value}" | gcloud secrets create ${secretName} \\\n`;
    output += `  --project="\${PROJECT_ID}" \\\n`;
    output += `  --replication-policy="automatic" \\\n`;
    output += `  --data-file=-\n\n`;

    output += `# Update existing secret\n`;
    output += `# echo "${value}" | gcloud secrets versions add ${secretName} \\\n`;
    output += `#   --project="\${PROJECT_ID}" \\\n`;
    output += `#   --data-file=-\n\n`;
  }

  return output;
}

function formatShell(secrets: Record<string, string>): string {
  let output = '#!/bin/bash\n';
  output += '# Export secrets as environment variables\n';
  output += `# Generated: ${new Date().toISOString()}\n`;
  output += '# Source this file: source secrets.sh\n\n';

  for (const [name, value] of Object.entries(secrets)) {
    output += `export ${name}="${value}"\n`;
  }

  return output;
}

function saveSecrets(content: string, format: string, outputDir: string = 'secrets') {
  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  let filename: string;
  let extension: string;

  switch (format) {
    case 'json':
      extension = 'json';
      filename = `secrets-${timestamp}.json`;
      break;
    case 'gcp':
      extension = 'sh';
      filename = `gcp-secrets-${timestamp}.sh`;
      break;
    case 'shell':
      extension = 'sh';
      filename = `secrets-${timestamp}.sh`;
      break;
    default:
      extension = 'env';
      filename = `.env.production.${timestamp}`;
  }

  const filepath = path.join(outputDir, filename);
  fs.writeFileSync(filepath, content);

  // Make shell scripts executable
  if (extension === 'sh') {
    try {
      fs.chmodSync(filepath, '700');
    } catch (error) {
      console.warn('⚠️  Could not set executable permissions (Windows?)');
    }
  }

  console.log(`💾 Secrets saved to: ${filepath}`);
  console.log('\n⚠️  SECURITY WARNING:');
  console.log('  1. Never commit this file to version control');
  console.log('  2. Store secrets in a secure secret manager (GCP Secret Manager, AWS Secrets Manager, etc.)');
  console.log('  3. Rotate secrets regularly');
  console.log('  4. Delete this file after storing secrets securely\n');

  return filepath;
}

function rotateSecret(secretName: string): void {
  const config = SECRETS.find(s => s.name === secretName);

  if (!config) {
    console.error(`❌ Unknown secret: ${secretName}`);
    console.log('\nAvailable secrets:');
    SECRETS.forEach(s => console.log(`  - ${s.name}`));
    process.exit(1);
  }

  const newSecret = generateSecret(config.length, config.encoding);

  console.log(`🔄 Rotating ${secretName}...\n`);
  console.log(`New ${secretName}:`);
  console.log(newSecret);
  console.log('\n⚠️  Remember to:');
  console.log('  1. Update the secret in your secret manager');
  console.log('  2. Deploy the new secret to all environments');
  console.log('  3. Verify services are using the new secret');
  console.log('  4. Remove the old secret after verification\n');
}

function validateExistingSecrets(envPath: string): void {
  if (!fs.existsSync(envPath)) {
    console.error(`❌ File not found: ${envPath}`);
    process.exit(1);
  }

  console.log(`🔍 Validating secrets in: ${envPath}\n`);

  const envContent = fs.readFileSync(envPath, 'utf-8');
  const lines = envContent.split('\n');
  const issues: string[] = [];

  for (const line of lines) {
    if (line.trim().startsWith('#') || !line.includes('=')) {
      continue;
    }

    const [key, ...valueParts] = line.split('=');
    const value = valueParts.join('=').replace(/['"]/g, '').trim();

    const config = SECRETS.find(s => s.name === key.trim());
    if (!config) {
      continue;
    }

    // Validate length
    if (value.length < config.length) {
      issues.push(`❌ ${key}: Too short (${value.length} chars, minimum ${config.length})`);
    }

    // Validate strength
    if (!validateSecret(value, config.length)) {
      issues.push(`❌ ${key}: Contains weak pattern or insufficient length`);
    }

    if (issues.length === 0) {
      console.log(`✅ ${key}: Valid`);
    }
  }

  if (issues.length > 0) {
    console.log('\n⚠️  Issues found:\n');
    issues.forEach(issue => console.log(issue));
    console.log('\nRecommendation: Generate new secrets with this script\n');
    process.exit(1);
  } else {
    console.log('\n✅ All secrets are valid!\n');
  }
}

// CLI
function main() {
  const command = process.argv[2] || 'generate';
  const arg = process.argv[3];

  try {
    switch (command) {
      case 'generate': {
        const format = (arg as 'env' | 'json' | 'gcp' | 'shell') || 'env';
        const secrets = generateSecrets(format);
        console.log(secrets);
        break;
      }

      case 'save': {
        const format = (arg as 'env' | 'json' | 'gcp' | 'shell') || 'env';
        const secrets = generateSecrets(format);
        saveSecrets(secrets, format);
        break;
      }

      case 'rotate': {
        if (!arg) {
          console.error('❌ Secret name required');
          console.log('Usage: tsx generate-secrets.ts rotate <SECRET_NAME>');
          process.exit(1);
        }
        rotateSecret(arg);
        break;
      }

      case 'validate': {
        if (!arg) {
          console.error('❌ File path required');
          console.log('Usage: tsx generate-secrets.ts validate <path-to-env-file>');
          process.exit(1);
        }
        validateExistingSecrets(arg);
        break;
      }

      case 'help':
      default:
        console.log('Usage:');
        console.log('  tsx generate-secrets.ts generate [env|json|gcp|shell]  - Generate and display secrets');
        console.log('  tsx generate-secrets.ts save [env|json|gcp|shell]      - Generate and save secrets');
        console.log('  tsx generate-secrets.ts rotate <SECRET_NAME>            - Rotate a specific secret');
        console.log('  tsx generate-secrets.ts validate <path-to-env>          - Validate existing secrets');
        console.log('\nFormats:');
        console.log('  env    - .env file format (default)');
        console.log('  json   - JSON format');
        console.log('  gcp    - GCP Secret Manager commands');
        console.log('  shell  - Shell export commands');
        console.log('\nExamples:');
        console.log('  tsx generate-secrets.ts generate');
        console.log('  tsx generate-secrets.ts save gcp');
        console.log('  tsx generate-secrets.ts rotate SESSION_SECRET');
        console.log('  tsx generate-secrets.ts validate .env.production');
        break;
    }
  } catch (error) {
    console.error('❌ Error:', (error as Error).message);
    process.exit(1);
  }
}

main();