/**
 * PDF rendering utilities: stream-to-buffer conversion and generic render helper.
 * @module server/services/pdf-generation/renderer
 */

import { pdf } from '@react-pdf/renderer';
import type React from 'react';

/** Convert ReadableStream to Buffer (for Node.js environment) */
async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return Buffer.from(result);
}

/** Render a React-PDF document element to a Buffer. */
export async function renderPdfToBuffer(doc: React.ReactElement): Promise<Buffer> {
  const pdfStream = await pdf(doc).toBuffer();
  if (pdfStream instanceof ReadableStream) {
    return streamToBuffer(pdfStream as ReadableStream<Uint8Array>);
  }
  return pdfStream as unknown as Buffer;
}
