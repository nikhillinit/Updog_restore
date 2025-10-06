/**
 * OpenAPI Tool Prompt Builder
 * Converts OpenAPI operation definitions into AI tool calling prompts
 */

export interface OpenAPIOperation {
  operationId: string;
  summary?: string;
  description?: string;
  parameters?: Array<{
    name: string;
    in: string;
    required?: boolean;
    schema?: any;
    description?: string;
  }>;
  requestBody?: {
    content?: Record<string, { schema?: any }>;
    required?: boolean;
  };
}

/**
 * Build a tool calling prompt from an OpenAPI operation
 */
export function buildToolPrompt(op: OpenAPIOperation): string {
  const parts: string[] = [];

  parts.push(`Tool: ${op.operationId}`);

  if (op.summary || op.description) {
    parts.push(`Description: ${op.summary ?? op.description}`);
  }

  if (op.parameters && op.parameters.length > 0) {
    parts.push('\nParameters:');
    for (const param of op.parameters) {
      const required = param.required ? ' (required)' : ' (optional)';
      const desc = param.description ? ` - ${param.description}` : '';
      parts.push(`  - ${param.name}${required}${desc}`);
    }
  }

  if (op.requestBody?.content) {
    const schemas = Object.values(op.requestBody.content);
    if (schemas.length > 0 && schemas[0]?.schema) {
      parts.push('\nRequest Body:');
      parts.push(`  ${JSON.stringify(schemas[0].schema, null, 2)}`);
    }
  }

  return parts.join('\n');
}

/**
 * Build multiple tool prompts from OpenAPI operations
 */
export function buildToolsPrompt(operations: OpenAPIOperation[]): string {
  const header = 'Available tools:\n';
  const tools = operations.map(op => buildToolPrompt(op)).join('\n\n---\n\n');
  return header + tools;
}
