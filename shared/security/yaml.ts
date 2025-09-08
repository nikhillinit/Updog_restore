/**
 * Security utilities for YAML parsing
 * Prevents code execution via unsafe YAML features
 */

import { parseDocument, Document } from 'yaml';
import { z } from 'zod';

/**
 * Safe YAML parsing with YAML 1.2 core schema
 * Prevents custom tags and code execution
 */
export function parseYamlSafe(content: string): unknown {
  try {
    const doc = parseDocument(content, {
      version: '1.2',
      strict: true,
      uniqueKeys: true,
    });
    
    if (doc.errors && doc.errors.length > 0) {
      throw new Error(`YAML parse error: ${doc.errors[0]?.message || 'Unknown error'}`);
    }
    
    // Convert to plain JS object (no custom types)
    return doc.toJS({ 
      mapAsMap: false
    });
  } catch (error) {
    throw new Error(`Failed to parse YAML: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Parse YAML and validate against a Zod schema
 */
export function parseYamlWithSchema<T>(
  content: string, 
  schema: z.ZodSchema<T>
): T {
  const parsed = parseYamlSafe(content);
  return schema.parse(parsed);
}

/**
 * Common schemas for configuration files
 */
export const ConfigSchemas = {
  // Basic team configuration
  Team: z.object({
    name: z.string().min(1).max(100),
    version: z.string().optional(),
    dependencies: z.record(z.array(z.string())).optional(),
    scripts: z.record(z.string()).optional(),
    config: z.record(z.unknown()).optional(),
  }).strict(),
  
  // CI/CD configuration
  Pipeline: z.object({
    name: z.string(),
    on: z.union([
      z.string(),
      z.array(z.string()),
      z.record(z.unknown()),
    ]),
    jobs: z.record(z.object({
      runs_on: z.union([z.string(), z.array(z.string())]).optional(),
      steps: z.array(z.object({
        name: z.string().optional(),
        uses: z.string().optional(),
        run: z.string().optional(),
        with: z.record(z.unknown()).optional(),
        env: z.record(z.string()).optional(),
      })),
    })),
  }),
  
  // Docker compose configuration
  DockerCompose: z.object({
    version: z.string().optional(),
    services: z.record(z.object({
      image: z.string().optional(),
      build: z.union([
        z.string(),
        z.object({
          context: z.string(),
          dockerfile: z.string().optional(),
        }),
      ]).optional(),
      ports: z.array(z.string()).optional(),
      environment: z.union([
        z.array(z.string()),
        z.record(z.string()),
      ]).optional(),
      volumes: z.array(z.string()).optional(),
      depends_on: z.array(z.string()).optional(),
    })),
    volumes: z.record(z.unknown()).optional(),
    networks: z.record(z.unknown()).optional(),
  }),
};

/**
 * Load and validate a YAML configuration file
 */
export async function loadYamlConfig<T>(
  filePath: string,
  schema: z.ZodSchema<T>
): Promise<T> {
  const fs = await import('fs/promises');
  const content = await fs.readFile(filePath, 'utf-8');
  return parseYamlWithSchema(content, schema);
}

/**
 * Stringify object to YAML safely
 */
export function stringifyYaml(data: unknown): string {
  const doc = new Document(data, {
    version: '1.2',
  });
  
  return doc.toString({
    lineWidth: 120,
    minContentWidth: 20,
    doubleQuotedAsJSON: true,
    doubleQuotedMinMultiLineLength: 40,
  });
}