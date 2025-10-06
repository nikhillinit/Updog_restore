import { z } from 'zod';

/**
 * PromptTemplate: Type-safe prompt construction with variable interpolation
 *
 * Features:
 * - Zod-validated inputs
 * - Handlebars-style {{variable}} syntax
 * - Support for system/user/assistant roles
 */

export interface TemplateSpec<I extends z.ZodTypeAny> {
  id: string;
  inputSchema: I;
  system?: string;
  user: string;
}

export class PromptTemplate<I extends z.ZodTypeAny> {
  constructor(private spec: TemplateSpec<I>) {}

  /**
   * Render template with validated inputs
   */
  render(input: z.infer<I>): {
    system?: string;
    user: string;
  } {
    const data = this.spec.inputSchema.parse(input);

    const fill = (s?: string) => {
      if (!s) return undefined;
      return s.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        const value = (data as any)[key];
        if (value === undefined || value === null) {
          return '';
        }
        if (typeof value === 'object') {
          return JSON.stringify(value);
        }
        return String(value);
      });
    };

    return {
      system: fill(this.spec.system),
      user: fill(this.spec.user),
    };
  }

  /**
   * Get template ID
   */
  getId(): string {
    return this.spec.id;
  }

  /**
   * Validate input without rendering
   */
  validate(input: unknown): z.infer<I> {
    return this.spec.inputSchema.parse(input);
  }
}
