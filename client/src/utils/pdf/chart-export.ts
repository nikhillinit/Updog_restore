/**
 * Chart-to-SVG Export Utility
 *
 * Captures SVG from Recharts/Nivo components and converts to formats
 * suitable for embedding in @react-pdf/renderer documents.
 *
 * Strategy:
 * - Extract SVG from DOM container
 * - Serialize to string with inline styles
 * - Convert to data URL (base64 PNG) for PDF embedding
 */

/**
 * Options for SVG export
 */
export interface ChartExportOptions {
  /** Width of the exported chart (default: auto from SVG) */
  width?: number;
  /** Height of the exported chart (default: auto from SVG) */
  height?: number;
  /** Background color (default: white) */
  backgroundColor?: string;
  /** Scale factor for higher resolution (default: 2 for retina) */
  scale?: number;
  /** Image format (default: png) */
  format?: 'png' | 'jpeg';
  /** JPEG quality 0-1 (default: 0.9) */
  quality?: number;
}

/**
 * Export result containing both SVG and rasterized formats
 */
export interface ChartExportResult {
  /** Original SVG string */
  svgString: string;
  /** Data URL for embedding in PDF */
  dataUrl: string;
  /** Width of the exported chart */
  width: number;
  /** Height of the exported chart */
  height: number;
}

/**
 * Extract SVG element from a container
 */
function extractSvgElement(container: HTMLElement): SVGSVGElement | null {
  return container.querySelector('svg');
}

/**
 * Clone SVG with computed styles inlined
 * This ensures the SVG looks correct when extracted from DOM context
 */
function cloneSvgWithStyles(svg: SVGSVGElement): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement;

  // Get all elements in original and clone
  const originalElements = svg.querySelectorAll('*');
  const clonedElements = clone.querySelectorAll('*');

  // Inline computed styles for each element
  originalElements.forEach((originalEl, index) => {
    const clonedEl = clonedElements[index];
    if (!clonedEl) return;

    const computed = window.getComputedStyle(originalEl);

    // Key style properties to inline
    const styleProps = [
      'fill',
      'stroke',
      'stroke-width',
      'stroke-dasharray',
      'stroke-linecap',
      'stroke-linejoin',
      'opacity',
      'fill-opacity',
      'stroke-opacity',
      'font-family',
      'font-size',
      'font-weight',
      'text-anchor',
      'dominant-baseline',
    ];

    const inlineStyles = styleProps
      .map((prop) => {
        const value = computed.getPropertyValue(prop);
        return value ? `${prop}: ${value}` : '';
      })
      .filter(Boolean)
      .join('; ');

    if (inlineStyles) {
      (clonedEl as SVGElement).setAttribute(
        'style',
        `${(clonedEl as SVGElement).getAttribute('style') || ''}; ${inlineStyles}`
      );
    }
  });

  return clone;
}

/**
 * Serialize SVG element to string
 */
function serializeSvg(svg: SVGSVGElement): string {
  const serializer = new XMLSerializer();
  let svgString = serializer.serializeToString(svg);

  // Ensure proper XML namespace
  if (!svgString.includes('xmlns')) {
    svgString = svgString.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  return svgString;
}

/**
 * Convert SVG to PNG data URL using canvas
 */
async function svgToDataUrl(
  svgString: string,
  width: number,
  height: number,
  options: ChartExportOptions = {}
): Promise<string> {
  const { backgroundColor = '#FFFFFF', scale = 2, format = 'png', quality = 0.9 } = options;

  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Failed to get canvas context'));
      return;
    }

    // Set canvas size with scale for higher resolution
    canvas.width = width * scale;
    canvas.height = height * scale;

    // Scale context for higher resolution
    ctx.scale(scale, scale);

    // Fill background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    // Create image from SVG
    const img = new Image();
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);

      const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
      const dataUrl = canvas.toDataURL(mimeType, quality);
      resolve(dataUrl);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load SVG image'));
    };

    img.src = url;
  });
}

/**
 * Export a chart container to SVG and PNG data URL
 *
 * @param container - DOM element containing the chart (Recharts/Nivo)
 * @param options - Export options
 * @returns Promise with SVG string and data URL
 *
 * @example
 * ```tsx
 * const containerRef = useRef<HTMLDivElement>(null);
 *
 * const handleExport = async () => {
 *   if (!containerRef.current) return;
 *   const result = await exportChartToImage(containerRef.current, {
 *     backgroundColor: '#FFFFFF',
 *     scale: 2,
 *   });
 *   // Use result.dataUrl in PDF generation
 * };
 *
 * return (
 *   <div ref={containerRef}>
 *     <ResponsiveContainer>
 *       <LineChart data={data}>...</LineChart>
 *     </ResponsiveContainer>
 *   </div>
 * );
 * ```
 */
export async function exportChartToImage(
  container: HTMLElement,
  options: ChartExportOptions = {}
): Promise<ChartExportResult> {
  const svg = extractSvgElement(container);

  if (!svg) {
    throw new Error('No SVG element found in container');
  }

  // Get dimensions from SVG or options
  const svgRect = svg.getBoundingClientRect();
  const width = options.width ?? svgRect.width;
  const height = options.height ?? svgRect.height;

  if (width === 0 || height === 0) {
    throw new Error('SVG has zero dimensions');
  }

  // Clone with inlined styles
  const styledSvg = cloneSvgWithStyles(svg);

  // Set explicit dimensions on clone
  styledSvg.setAttribute('width', String(width));
  styledSvg.setAttribute('height', String(height));

  // Serialize to string
  const svgString = serializeSvg(styledSvg);

  // Convert to data URL
  const dataUrl = await svgToDataUrl(svgString, width, height, options);

  return {
    svgString,
    dataUrl,
    width,
    height,
  };
}

/**
 * Export multiple charts to images (for batch PDF generation)
 */
export async function exportChartsToImages(
  containers: HTMLElement[],
  options: ChartExportOptions = {}
): Promise<ChartExportResult[]> {
  return Promise.all(containers.map((container) => exportChartToImage(container, options)));
}

/**
 * React hook for chart export
 */
export function useChartExport(options: ChartExportOptions = {}) {
  const exportChart = async (container: HTMLElement): Promise<ChartExportResult> => {
    return exportChartToImage(container, options);
  };

  const exportCharts = async (containers: HTMLElement[]): Promise<ChartExportResult[]> => {
    return exportChartsToImages(containers, options);
  };

  return { exportChart, exportCharts };
}

/**
 * Create a placeholder for charts that couldn't be exported
 */
export function createChartPlaceholder(
  width: number,
  height: number,
  message: string = 'Chart not available'
): ChartExportResult {
  const svgString = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="100%" height="100%" fill="#F5F5F5" stroke="#E0E0E0" stroke-width="1"/>
      <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle"
            font-family="Inter, sans-serif" font-size="14" fill="#666666">
        ${message}
      </text>
    </svg>
  `.trim();

  const dataUrl = `data:image/svg+xml;base64,${btoa(svgString)}`;

  return {
    svgString,
    dataUrl,
    width,
    height,
  };
}
