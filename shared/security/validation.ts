/**
 * Security validation utilities
 * Common validation functions for input sanitization
 */

/**
 * Validates an alphanumeric identifier (branch name, file name, etc.)
 */
export function validateIdentifier(
  input: string,
  options: {
    maxLength?: number;
    allowDots?: boolean;
    allowDashes?: boolean;
    allowSlashes?: boolean;
    allowUnderscores?: boolean;
    allowAt?: boolean;
  } = {}
): string {
  const {
    maxLength = 255,
    allowDots = true,
    allowDashes = true,
    allowSlashes = true,
    allowUnderscores = true,
    allowAt = false,
  } = options;
  
  if (!input || input.length === 0) {
    throw new Error('Input cannot be empty');
  }
  
  if (input.length > maxLength) {
    throw new Error(`Input exceeds maximum length of ${maxLength}`);
  }
  
  // Build allowed character pattern
  let pattern = 'a-zA-Z0-9';
  if (allowDots) pattern += '\\.';
  if (allowDashes) pattern += '\\-';
  if (allowSlashes) pattern += '\\/';
  if (allowUnderscores) pattern += '_';
  if (allowAt) pattern += '@';
  
  const regex = new RegExp(`^[${pattern}]+$`);
  
  if (!regex.test(input)) {
    throw new Error(`Input contains invalid characters. Allowed: ${pattern.replace(/\\/g, '')}`);
  }
  
  // Prevent path traversal
  if (input.includes('..')) {
    throw new Error('Path traversal patterns are not allowed');
  }
  
  // Prevent absolute paths
  if (input.startsWith('/') || input.match(/^[a-zA-Z]:\\/)) {
    throw new Error('Absolute paths are not allowed');
  }
  
  return input;
}

/**
 * Validates a database connection string
 */
export function validateDatabaseUrl(url: string): string {
  if (!url) {
    throw new Error('Database URL cannot be empty');
  }
  
  // Parse and validate URL
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid database URL format');
  }
  
  // Check protocol
  const validProtocols = ['postgres:', 'postgresql:', 'mysql:', 'mysql2:', 'sqlite:'];
  if (!validProtocols.includes(parsed.protocol)) {
    throw new Error(`Invalid database protocol: ${parsed.protocol}`);
  }
  
  // Don't allow localhost in production
  if (process.env['NODE_ENV'] === 'production') {
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      throw new Error('Localhost database connections not allowed in production');
    }
  }
  
  return url;
}

/**
 * Validates an email address
 */
export function validateEmail(email: string): string {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  
  if (!email || !emailRegex.test(email)) {
    throw new Error('Invalid email address');
  }
  
  if (email.length > 254) {
    throw new Error('Email address too long');
  }
  
  return email.toLowerCase();
}

/**
 * Validates a port number
 */
export function validatePort(port: string | number): number {
  const portNum = typeof port === 'string' ? parseInt(port, 10) : port;
  
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    throw new Error('Invalid port number (must be 1-65535)');
  }
  
  // Warn about privileged ports
  if (portNum < 1024 && process.env['NODE_ENV'] === 'production') {
    console.warn(`Warning: Using privileged port ${portNum} in production`);
  }
  
  return portNum;
}

/**
 * Sanitizes a filename
 */
export function sanitizeFilename(filename: string): string {
  if (!filename) {
    throw new Error('Filename cannot be empty');
  }
  
  // Remove path components
  const basename = filename.split(/[/\\]/).pop() || '';
  
  // Remove dangerous characters
  const sanitized = basename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^\.+/, '') // Remove leading dots
    .replace(/\.{2,}/g, '_'); // Replace multiple dots
  
  // Check for reserved names (Windows)
  const reserved = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'LPT1'];
  const nameWithoutExt = (sanitized.split('.')[0] || '').toUpperCase();
  
  if (reserved.includes(nameWithoutExt)) {
    throw new Error('Reserved filename not allowed');
  }
  
  if (sanitized.length === 0) {
    throw new Error('Filename cannot be empty after sanitization');
  }
  
  if (sanitized.length > 255) {
    throw new Error('Filename too long');
  }
  
  return sanitized;
}

/**
 * Validates a Git reference (branch, tag, commit SHA)
 */
export function validateGitRef(ref: string): string {
  if (!ref) {
    throw new Error('Git reference cannot be empty');
  }
  
  // Allow alphanumeric, dots, slashes, dashes, underscores
  if (!/^[a-zA-Z0-9._\/-]+$/.test(ref)) {
    throw new Error('Invalid characters in Git reference');
  }
  
  // Prevent command injection via ref names
  const dangerous = ['--', '..', '~', '^', ':', '\\', '*', '?', '[', '@{'];
  for (const pattern of dangerous) {
    if (ref.includes(pattern)) {
      throw new Error(`Dangerous pattern "${pattern}" in Git reference`);
    }
  }
  
  return ref;
}

/**
 * Validates environment variable name
 */
export function validateEnvVarName(name: string): string {
  if (!name) {
    throw new Error('Environment variable name cannot be empty');
  }
  
  // Must start with letter or underscore, then alphanumeric or underscore
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error('Invalid environment variable name');
  }
  
  return name;
}