#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { spawn } from 'child_process';
import { join, resolve } from 'path';

/**
 * AI Gateway Script: Patch Applicator
 * Provides structured patch application for AI agents
 */

const PROJECT_ROOT = resolve(process.cwd());

class PatchApplicator {
  constructor(options = {}) {
    this.logFile = options.logFile || join(PROJECT_ROOT, 'ai-logs', 'patch-results.json');
    this.dryRun = options.dryRun || false;
    this.verbose = options.verbose || false;
  }

  async applyPatch(patchData, options = {}) {
    const startTime = Date.now();
    const patchId = `patch-${Date.now()}`;
    
    console.log(`[AI-TOOLS] Applying patch: ${patchId}`);
    if (this.dryRun) console.log('[AI-TOOLS] DRY RUN MODE - No files will be modified');

    try {
      const result = await this.processPatch(patchData, patchId, options);
      const duration = Date.now() - startTime;
      
      const patchResult = {
        patchId,
        timestamp: new Date().toISOString(),
        duration,
        success: result.success,
        changes: result.changes,
        errors: result.errors,
        dryRun: this.dryRun,
        summary: result.summary
      };

      this.logResult(patchResult);
      this.printSummary(patchResult);
      
      return patchResult;
    } catch (error) {
      const errorResult = {
        patchId,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        success: false,
        error: error.message,
        dryRun: this.dryRun
      };
      
      this.logResult(errorResult);
      console.error(`[AI-TOOLS] Patch application failed: ${error.message}`);
      return errorResult;
    }
  }

  async processPatch(patchData, patchId, options) {
    const changes = [];
    const errors = [];
    let success = true;

    // Handle different patch formats
    if (typeof patchData === 'string') {
      // Git patch format
      return await this.applyGitPatch(patchData, patchId);
    } else if (Array.isArray(patchData)) {
      // Multiple file changes
      for (const change of patchData) {
        try {
          const result = await this.applyFileChange(change, patchId);
          changes.push(result);
        } catch (error) {
          errors.push({ file: change.file, error: error.message });
          success = false;
        }
      }
    } else if (patchData.file) {
      // Single file change
      try {
        const result = await this.applyFileChange(patchData, patchId);
        changes.push(result);
      } catch (error) {
        errors.push({ file: patchData.file, error: error.message });
        success = false;
      }
    } else {
      throw new Error('Invalid patch format');
    }

    return {
      success: success && errors.length === 0,
      changes,
      errors,
      summary: `Applied ${changes.length} changes with ${errors.length} errors`
    };
  }

  async applyFileChange(change, patchId) {
    const { file, content, oldContent, operation = 'replace' } = change;
    const filePath = resolve(PROJECT_ROOT, file);
    
    if (this.verbose) console.log(`[AI-TOOLS] Processing ${operation} on ${file}`);

    // Validate file exists for operations that require it
    if ((operation === 'replace' || operation === 'patch') && !existsSync(filePath)) {
      throw new Error(`File does not exist: ${file}`);
    }

    // Validate old content if provided (safety check)
    if (oldContent && existsSync(filePath)) {
      const currentContent = readFileSync(filePath, 'utf8');
      if (currentContent !== oldContent) {
        throw new Error(`File content mismatch: ${file} has been modified`);
      }
    }

    const changeResult = {
      file,
      operation,
      success: false,
      backup: null
    };

    if (!this.dryRun) {
      // Create backup if file exists
      if (existsSync(filePath)) {
        const backupPath = `${filePath}.ai-backup.${patchId}`;
        const originalContent = readFileSync(filePath, 'utf8');
        writeFileSync(backupPath, originalContent);
        changeResult.backup = backupPath;
      }

      // Apply the change
      switch (operation) {
        case 'create':
        case 'replace':
          writeFileSync(filePath, content);
          break;
        case 'delete':
          if (existsSync(filePath)) {
            // Move to trash instead of permanent delete
            const trashPath = `${filePath}.ai-deleted.${patchId}`;
            writeFileSync(trashPath, readFileSync(filePath));
            // Don't actually delete for safety
          }
          break;
        case 'patch':
          // Apply line-by-line patch (simplified)
          const currentContent = readFileSync(filePath, 'utf8');
          const patchedContent = this.applyLinePatch(currentContent, content);
          writeFileSync(filePath, patchedContent);
          break;
        default:
          throw new Error(`Unknown operation: ${operation}`);
      }
    }

    changeResult.success = true;
    return changeResult;
  }

  applyLinePatch(originalContent, patchInstructions) {
    // Simplified patch application - can be enhanced for complex diffs
    // For now, assume patchInstructions is the new content
    return patchInstructions;
  }

  async applyGitPatch(patchContent, patchId) {
    // Apply git patch using git apply
    const patchFile = join(PROJECT_ROOT, 'ai-logs', `${patchId}.patch`);
    writeFileSync(patchFile, patchContent);

    const command = this.dryRun 
      ? ['git', 'apply', '--check', patchFile]
      : ['git', 'apply', patchFile];

    try {
      const result = await this.executeCommand(command);
      return {
        success: result.exitCode === 0,
        changes: [{ type: 'git-patch', file: patchFile }],
        errors: result.exitCode !== 0 ? [result.stderr] : [],
        summary: `Git patch ${this.dryRun ? 'validated' : 'applied'}`
      };
    } catch (error) {
      return {
        success: false,
        changes: [],
        errors: [error.message],
        summary: 'Git patch failed'
      };
    }
  }

  executeCommand(command) {
    return new Promise((resolve, reject) => {
      const process = spawn(command[0], command.slice(1), {
        cwd: PROJECT_ROOT,
        stdio: 'pipe',
        shell: true
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        if (this.verbose) console.log(chunk);
      });

      process.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        if (this.verbose) console.error(chunk);
      });

      process.on('close', (exitCode) => {
        resolve({ exitCode, stdout, stderr });
      });

      process.on('error', (error) => {
        reject(error);
      });
    });
  }

  logResult(result) {
    try {
      // Ensure ai-logs directory exists
      const logDir = join(PROJECT_ROOT, 'ai-logs');
      try {
        writeFileSync(join(logDir, '.gitkeep'), '');
      } catch (e) {
        // Directory might not exist, that's ok
      }
      
      writeFileSync(this.logFile, JSON.stringify(result, null, 2));
    } catch (error) {
      console.warn(`[AI-TOOLS] Failed to write log: ${error.message}`);
    }
  }

  printSummary(result) {
    console.log('\n=== Patch Summary ===');
    console.log(`Patch ID: ${result.patchId}`);
    console.log(`Duration: ${result.duration}ms`);
    console.log(`Success: ${result.success ? '✅' : '❌'}`);
    
    if (result.changes) {
      console.log(`Changes: ${result.changes.length}`);
      result.changes.forEach(change => {
        console.log(`  ${change.operation || 'unknown'}: ${change.file}`);
      });
    }
    
    if (result.errors && result.errors.length > 0) {
      console.log(`Errors: ${result.errors.length}`);
      result.errors.forEach(error => {
        console.log(`  ❌ ${error.file || 'unknown'}: ${error.error || error}`);
      });
    }
    
    if (result.dryRun) {
      console.log('⚠️  DRY RUN - No files were actually modified');
    }
    
    console.log('====================\n');
  }
}

// CLI Interface
if (process.argv[1].endsWith('apply-patch.js')) {
  const args = process.argv.slice(2);
  const patchFile = args.find(arg => !arg.startsWith('--'));
  const options = {
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose')
  };

  if (!patchFile) {
    console.error('Usage: apply-patch.js <patch-file-or-json> [--dry-run] [--verbose]');
    process.exit(1);
  }

  const applicator = new PatchApplicator(options);
  
  try {
    let patchData;
    if (patchFile.endsWith('.json')) {
      patchData = JSON.parse(readFileSync(patchFile, 'utf8'));
    } else {
      patchData = readFileSync(patchFile, 'utf8');
    }
    
    applicator.applyPatch(patchData)
      .then(result => {
        process.exit(result.success ? 0 : 1);
      })
      .catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
      });
  } catch (error) {
    console.error('Failed to read patch file:', error.message);
    process.exit(1);
  }
}

export { PatchApplicator };