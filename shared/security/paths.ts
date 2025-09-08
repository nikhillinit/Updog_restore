/**
 * Security utilities for safe file system access
 * Prevents path traversal vulnerabilities
 */

import path from 'path';
import fs from 'fs/promises';

/**
 * Safely joins paths and prevents traversal attacks
 */
export function safeJoin(baseDir: string, ...segments: string[]): string {
  const base = path.resolve(baseDir);
  const joined = path.resolve(baseDir, ...segments);
  
  // Ensure the resolved path is within the base directory
  if (!joined.startsWith(base + path.sep) && joined !== base) {
    throw new Error(`Path traversal attempt detected: ${segments.join('/')}`);
  }
  
  return joined;
}

/**
 * Safe file read with size limits
 */
export async function safeReadFile(
  baseDir: string,
  filePath: string,
  options: {
    maxSize?: number;
    encoding?: BufferEncoding;
  } = {}
): Promise<string | Buffer> {
  const { maxSize = 10 * 1024 * 1024, encoding = 'utf-8' } = options; // 10MB default
  
  const safePath = safeJoin(baseDir, filePath);
  
  // Check file size first
  const stats = await fs.stat(safePath);
  if (stats.size > maxSize) {
    throw new Error(`File too large: ${stats.size} bytes (max: ${maxSize})`);
  }
  
  return fs.readFile(safePath, encoding);
}

/**
 * Safe directory listing
 */
export async function safeListDir(
  baseDir: string,
  subPath: string = '.',
  options: {
    maxDepth?: number;
    extensions?: string[];
  } = {}
): Promise<string[]> {
  const safePath = safeJoin(baseDir, subPath);
  
  const entries = await fs.readdir(safePath, { withFileTypes: true });
  
  if (options.extensions) {
    return entries
      .filter(entry => entry.isFile())
      .map(entry => entry.name)
      .filter(name => options.extensions!.some(ext => name.endsWith(ext)));
  }
  
  return entries.map(entry => entry.name);
}

/**
 * Validate and sanitize filename
 */
export function sanitizeFilename(filename: string): string {
  // Remove any path components
  const base = path.basename(filename);
  
  // Allow only safe characters
  const sanitized = base.replace(/[^a-zA-Z0-9._-]/g, '_');
  
  // Prevent hidden files and special names
  if (sanitized.startsWith('.') || sanitized === 'CON' || sanitized === 'PRN') {
    throw new Error('Invalid filename');
  }
  
  return sanitized;
}