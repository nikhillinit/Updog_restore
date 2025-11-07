/**
 * EmbeddingService - OpenAI Embeddings Integration
 *
 * Generates vector embeddings for semantic search.
 * Uses text-embedding-3-small for cost efficiency (1536 dimensions).
 */

import OpenAI from 'openai';

export interface EmbeddingOptions {
  model?: 'text-embedding-3-small' | 'text-embedding-3-large' | 'text-embedding-ada-002';
  dimensions?: number;
}

export class EmbeddingService {
  private openai: OpenAI;
  private useMock: boolean;

  constructor(apiKey?: string, useMock = false) {
    this.useMock = useMock || (!apiKey && !process.env.OPENAI_API_KEY);

    if (!this.useMock) {
      this.openai = new OpenAI({
        apiKey: apiKey || process.env.OPENAI_API_KEY,
      });
    }
  }

  /**
   * Generate embedding vector for text
   */
  async embed(text: string, options: EmbeddingOptions = {}): Promise<number[]> {
    const { model = 'text-embedding-3-small', dimensions = 1536 } = options;

    // Use mock embeddings if no API key provided
    if (this.useMock) {
      console.warn('EmbeddingService: Using mock embeddings. Set OPENAI_API_KEY for production.');
      return this.generateMockEmbedding(text, dimensions);
    }

    // Use real OpenAI embeddings API
    try {
      const response = await this.openai.embeddings.create({
        model,
        input: text,
        dimensions: model === 'text-embedding-3-small' ? dimensions : undefined,
      });
      return response.data[0].embedding;
    } catch (error) {
      console.error('OpenAI embeddings API error:', error);
      // Fallback to mock on error
      return this.generateMockEmbedding(text, dimensions);
    }
  }

  /**
   * Batch embed multiple texts
   * More efficient than individual calls
   */
  async embedBatch(texts: string[], options: EmbeddingOptions = {}): Promise<number[][]> {
    const { model = 'text-embedding-3-small', dimensions = 1536 } = options;

    // Use mock embeddings if no API key provided
    if (this.useMock) {
      return Promise.all(texts.map((text) => this.generateMockEmbedding(text, dimensions)));
    }

    // Use batch API for efficiency
    try {
      const response = await this.openai.embeddings.create({
        model,
        input: texts,
        dimensions: model === 'text-embedding-3-small' ? dimensions : undefined,
      });
      return response.data.map((d) => d.embedding);
    } catch (error) {
      console.error('OpenAI batch embeddings API error:', error);
      // Fallback to mock on error
      return Promise.all(texts.map((text) => this.generateMockEmbedding(text, dimensions)));
    }
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Embeddings must have same dimensions');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Generate mock embedding for development/testing
   * Uses simple hash-based approach for deterministic results
   */
  private generateMockEmbedding(text: string, dimensions: number): number[] {
    // Simple hash function for deterministic embeddings
    const hash = this.simpleHash(text);
    const embedding: number[] = [];

    for (let i = 0; i < dimensions; i++) {
      // Generate pseudo-random but deterministic values
      const seed = (hash + i) * 2654435761;
      embedding.push((Math.sin(seed) + 1) / 2);
    }

    // Normalize to unit vector
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map((val) => val / norm);
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}

/**
 * Production Implementation Guide:
 *
 * 1. Install OpenAI SDK: npm install openai
 *
 * 2. Replace EmbeddingService implementation:
 *
 * import OpenAI from 'openai';
 *
 * export class EmbeddingService {
 *   private openai: OpenAI;
 *
 *   constructor(apiKey?: string) {
 *     this.openai = new OpenAI({ apiKey: apiKey || process.env.OPENAI_API_KEY });
 *   }
 *
 *   async embed(text: string, options: EmbeddingOptions = {}): Promise<number[]> {
 *     const { model = 'text-embedding-3-small' } = options;
 *     const response = await this.openai.embeddings.create({
 *       model,
 *       input: text,
 *     });
 *     return response.data[0].embedding;
 *   }
 * }
 *
 * 3. Set environment variable: OPENAI_API_KEY=sk-...
 */
