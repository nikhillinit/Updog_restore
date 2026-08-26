/**
 * Export Header Component
 *
 * Branded header for exported reports and screenshots.
 * Used when capturing charts/tables for external sharing.
 */

import React from 'react';
import { colors } from '@/lib/brand-tokens';

export interface ExportHeaderProps {
  /** Report title */
  title: string;
  /** Optional subtitle */
  subtitle?: string;
  /** Show POV logo */
  showLogo?: boolean;
  /** Show generation date */
  showDate?: boolean;
  /** Custom date string (defaults to current date) */
  dateString?: string;
  /** Fund name to display */
  fundName?: string;
}

/**
 * POV Logo SVG (simplified for export)
 */
const PovLogo: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 120 40"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-label="Press On Ventures"
  >
    <rect width="40" height="40" rx="4" fill={colors.dark} />
    <text x="7" y="28" fill={colors.white} fontFamily="Inter" fontWeight="700" fontSize="20">
      POV
    </text>
    <text x="48" y="24" fill={colors.dark} fontFamily="Inter" fontWeight="500" fontSize="11">
      Press On
    </text>
    <text x="48" y="36" fill={colors.dark} fontFamily="Inter" fontWeight="500" fontSize="11">
      Ventures
    </text>
  </svg>
);

/**
 * Export Header Component
 */
export const ExportHeader: React.FC<ExportHeaderProps> = ({
  title,
  subtitle,
  showLogo = true,
  showDate = true,
  dateString,
  fundName,
}) => {
  const formattedDate =
    dateString ??
    new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

  return (
    <header
      className="export-header"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 24px',
        borderBottom: `1px solid ${colors.beige}`,
        backgroundColor: colors.white,
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {/* Left: Logo and Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {showLogo && <PovLogo className="h-10 w-auto" />}
        <div>
          <h1
            style={{
              fontSize: '18px',
              fontWeight: 600,
              color: colors.dark,
              margin: 0,
              lineHeight: 1.3,
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              style={{
                fontSize: '13px',
                color: colors.darkMuted,
                margin: '2px 0 0 0',
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Right: Fund name and date */}
      <div style={{ textAlign: 'right' }}>
        {fundName && (
          <p
            style={{
              fontSize: '13px',
              fontWeight: 500,
              color: colors.dark,
              margin: 0,
            }}
          >
            {fundName}
          </p>
        )}
        {showDate && (
          <p
            style={{
              fontSize: '12px',
              color: colors.darkMuted,
              margin: fundName ? '2px 0 0 0' : 0,
            }}
          >
            {formattedDate}
          </p>
        )}
      </div>
    </header>
  );
};

export default ExportHeader;
