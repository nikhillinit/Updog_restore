/**
 * Storage Service - Abstraction Layer for File Storage
 *
 * Provides a unified interface for file storage operations.
 * Supports multiple backends: S3, local filesystem, or memory (for testing).
 *
 * @module server/services/storage-service
 */

import { createReadStream, createWriteStream, promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

// Storage provider types
export type StorageProvider = 'local' | 's3' | 'memory';

export interface StorageConfig {
  provider: StorageProvider;
  // Local storage config
  localPath?: string;
  // S3 config (for future implementation)
  s3Bucket?: string;
  s3Region?: string;
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
  // URL configuration
  baseUrl?: string;
  signedUrlExpiry?: number; // seconds
}

export interface UploadResult {
  key: string;
  url: string;
  size: number;
  contentType: string;
  etag: string;
}

export interface DownloadResult {
  buffer: Buffer;
  contentType: string;
  size: number;
}

export interface SignedUrlResult {
  url: string;
  expiresAt: Date;
}

export interface StorageService {
  upload(key: string, buffer: Buffer, contentType: string): Promise<UploadResult>;
  download(key: string): Promise<DownloadResult>;
  delete(key: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;
  getSignedUrl(key: string, expirySeconds?: number): Promise<SignedUrlResult>;
  listFiles(prefix: string): Promise<string[]>;
}

// In-memory storage for testing
const memoryStore = new Map<string, { buffer: Buffer; contentType: string }>();

/**
 * Local Filesystem Storage Implementation
 */
class LocalStorageService implements StorageService {
  private basePath: string;
  private baseUrl: string;

  constructor(config: StorageConfig) {
    this.basePath = config.localPath || './uploads';
    this.baseUrl = config.baseUrl || '/files';
  }

  async upload(key: string, buffer: Buffer, contentType: string): Promise<UploadResult> {
    const filePath = path.join(this.basePath, key);
    const dir = path.dirname(filePath);

    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true });

    // Write file
    await fs.writeFile(filePath, buffer);

    const etag = crypto.createHash('md5').update(buffer).digest('hex');

    return {
      key,
      url: `${this.baseUrl}/${key}`,
      size: buffer.length,
      contentType,
      etag,
    };
  }

  async download(key: string): Promise<DownloadResult> {
    const filePath = path.join(this.basePath, key);
    const buffer = await fs.readFile(filePath);
    const stats = await fs.stat(filePath);

    // Infer content type from extension
    const ext = path.extname(key).toLowerCase();
    const contentTypes: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.csv': 'text/csv',
      '.json': 'application/json',
    };

    return {
      buffer,
      contentType: contentTypes[ext] || 'application/octet-stream',
      size: stats.size,
    };
  }

  async delete(key: string): Promise<boolean> {
    try {
      const filePath = path.join(this.basePath, key);
      await fs.unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const filePath = path.join(this.basePath, key);
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async getSignedUrl(key: string, expirySeconds = 3600): Promise<SignedUrlResult> {
    // For local storage, generate a simple token-based URL
    const expiresAt = new Date(Date.now() + expirySeconds * 1000);
    const token = crypto
      .createHmac('sha256', process.env['STORAGE_SECRET'] || 'dev-secret')
      .update(`${key}:${expiresAt.getTime()}`)
      .digest('hex')
      .slice(0, 16);

    return {
      url: `${this.baseUrl}/${key}?token=${token}&expires=${expiresAt.getTime()}`,
      expiresAt,
    };
  }

  async listFiles(prefix: string): Promise<string[]> {
    const dirPath = path.join(this.basePath, prefix);
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      return entries
        .filter((e) => e.isFile())
        .map((e) => path.join(prefix, e.name));
    } catch {
      return [];
    }
  }
}

/**
 * In-Memory Storage Implementation (for testing)
 */
class MemoryStorageService implements StorageService {
  async upload(key: string, buffer: Buffer, contentType: string): Promise<UploadResult> {
    memoryStore.set(key, { buffer, contentType });
    const etag = crypto.createHash('md5').update(buffer).digest('hex');

    return {
      key,
      url: `/memory/${key}`,
      size: buffer.length,
      contentType,
      etag,
    };
  }

  async download(key: string): Promise<DownloadResult> {
    const item = memoryStore.get(key);
    if (!item) {
      throw new Error(`File not found: ${key}`);
    }

    return {
      buffer: item.buffer,
      contentType: item.contentType,
      size: item.buffer.length,
    };
  }

  async delete(key: string): Promise<boolean> {
    return memoryStore.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return memoryStore.has(key);
  }

  async getSignedUrl(key: string, expirySeconds = 3600): Promise<SignedUrlResult> {
    return {
      url: `/memory/${key}`,
      expiresAt: new Date(Date.now() + expirySeconds * 1000),
    };
  }

  async listFiles(prefix: string): Promise<string[]> {
    return Array.from(memoryStore.keys()).filter((k) => k.startsWith(prefix));
  }
}

/**
 * S3 Storage Implementation (stub - requires @aws-sdk/client-s3)
 */
class S3StorageService implements StorageService {
  private bucket: string;
  private region: string;

  constructor(config: StorageConfig) {
    this.bucket = config.s3Bucket || '';
    this.region = config.s3Region || 'us-east-1';

    if (!this.bucket) {
      console.warn('[StorageService] S3 bucket not configured, falling back to local storage');
    }
  }

  async upload(_key: string, _buffer: Buffer, _contentType: string): Promise<UploadResult> {
    // TODO: Implement with @aws-sdk/client-s3
    // const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    // const client = new S3Client({ region: this.region });
    // await client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: buffer, ContentType: contentType }));

    throw new Error('S3 storage not yet implemented. Install @aws-sdk/client-s3 and implement.');
  }

  async download(_key: string): Promise<DownloadResult> {
    // TODO: Implement with @aws-sdk/client-s3
    throw new Error('S3 storage not yet implemented');
  }

  async delete(_key: string): Promise<boolean> {
    // TODO: Implement with @aws-sdk/client-s3
    throw new Error('S3 storage not yet implemented');
  }

  async exists(_key: string): Promise<boolean> {
    // TODO: Implement with @aws-sdk/client-s3
    throw new Error('S3 storage not yet implemented');
  }

  async getSignedUrl(_key: string, _expirySeconds?: number): Promise<SignedUrlResult> {
    // TODO: Implement with @aws-sdk/s3-request-presigner
    throw new Error('S3 storage not yet implemented');
  }

  async listFiles(_prefix: string): Promise<string[]> {
    // TODO: Implement with @aws-sdk/client-s3
    throw new Error('S3 storage not yet implemented');
  }
}

// Default configuration from environment
const defaultConfig: StorageConfig = {
  provider: (process.env['STORAGE_PROVIDER'] as StorageProvider) || 'local',
  localPath: process.env['STORAGE_LOCAL_PATH'] || './uploads/reports',
  baseUrl: process.env['STORAGE_BASE_URL'] || '/api/files',
  signedUrlExpiry: parseInt(process.env['STORAGE_URL_EXPIRY'] || '3600', 10),
  // Only set S3 config if env vars are present
  ...(process.env['AWS_S3_BUCKET'] ? { s3Bucket: process.env['AWS_S3_BUCKET'] } : {}),
  ...(process.env['AWS_REGION'] ? { s3Region: process.env['AWS_REGION'] } : {}),
};

/**
 * Create storage service based on configuration
 */
export function createStorageService(config: StorageConfig = defaultConfig): StorageService {
  switch (config.provider) {
    case 's3':
      return new S3StorageService(config);
    case 'memory':
      return new MemoryStorageService();
    case 'local':
    default:
      return new LocalStorageService(config);
  }
}

// Singleton instance
let storageInstance: StorageService | null = null;

/**
 * Get the storage service singleton
 */
export function getStorageService(): StorageService {
  if (!storageInstance) {
    storageInstance = createStorageService();
  }
  return storageInstance;
}

/**
 * Reset storage service (for testing)
 */
export function resetStorageService(): void {
  storageInstance = null;
  memoryStore.clear();
}

// Export default instance
export const storage = getStorageService();
