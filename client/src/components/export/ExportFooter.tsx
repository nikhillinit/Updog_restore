/**
 * Export Footer Component
 *
 * Branded footer for exported reports and screenshots.
 * Includes copyright, confidentiality notice, and generation timestamp.
 */

import React from 'react';
import { colors } from '@/lib/brand-tokens';

export interface ExportFooterProps {
  /** Show copyright notice */
  showCopyright?: boolean;
  /** Show confidentiality notice */
  confidential?: boolean;
  /** Show generation timestamp */
  showTimestamp?: boolean;
  /** Custom text to display */
  customText?: string;
  /** Page number (if paginated) */
  pageNumber?: number;
  /** Total pages (if paginated) */
  totalPages?: number;
}

/**
 * Export Footer Component
 */
export const ExportFooter: React.FC<ExportFooterProps> = ({
  showCopyright = true,
  confidential = true,
  showTimestamp = true,
  customText,
  pageNumber,
  totalPages,
}) => {
  const year = new Date().getFullYear();
  const timestamp = new Date().toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <footer
      className="export-footer"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 24px',
        borderTop: `1px solid ${colors.beige}`,
        backgroundColor: colors.light,
        fontFamily: 'Inter, sans-serif',
        fontSize: '10px',
        color: colors.darkMuted,
      }}
    >
      {/* Left: Copyright and confidentiality */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
        {showCopyright && <span>{year} Press On Ventures. All rights reserved.</span>}
        {confidential && (
          <span
            style={{
              backgroundColor: colors.beige,
              padding: '2px 8px',
              borderRadius: '4px',
              fontWeight: 500,
              textTransform: 'uppercase',
              fontSize: '9px',
              letterSpacing: '0.5px',
            }}
          >
            Confidential
          </span>
        )}
      </div>

      {/* Center: Custom text */}
      {customText && <span>{customText}</span>}

      {/* Right: Timestamp and pagination */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
        {showTimestamp && <span>Generated {timestamp}</span>}
        {pageNumber !== undefined && totalPages !== undefined && (
          <span>
            Page {pageNumber} of {totalPages}
          </span>
        )}
      </div>
    </footer>
  );
};

export default ExportFooter;
