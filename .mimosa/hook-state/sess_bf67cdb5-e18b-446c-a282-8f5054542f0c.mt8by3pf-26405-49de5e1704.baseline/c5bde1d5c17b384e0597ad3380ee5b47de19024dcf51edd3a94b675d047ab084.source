/**
 * PDF rendering utilities.
 * @module server/services/pdf-generation/renderer
 */

import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import type React from 'react';

/** Render a React-PDF document element to a Buffer. */
export async function renderPdfToBuffer(doc: React.ReactElement): Promise<Buffer> {
  return renderToBuffer(doc as React.ReactElement<DocumentProps>);
}
