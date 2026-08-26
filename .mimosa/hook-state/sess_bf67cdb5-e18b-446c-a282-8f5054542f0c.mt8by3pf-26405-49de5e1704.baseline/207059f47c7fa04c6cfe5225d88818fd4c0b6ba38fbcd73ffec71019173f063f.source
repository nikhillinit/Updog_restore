/**
 * Export Wrapper Component
 *
 * Wraps content with branded header and footer for export.
 * Use this component when capturing charts/tables for external sharing.
 *
 * Features:
 * - Consistent Press On Ventures branding
 * - Configurable header/footer visibility
 * - Export-friendly styling (removes interactive elements)
 * - Print-optimized layout
 *
 * Usage:
 * ```tsx
 * <ExportWrapper
 *   title="Portfolio Summary"
 *   subtitle="Q4 2024"
 *   fundName="Press On Ventures II"
 * >
 *   <PortfolioChart data={data} />
 * </ExportWrapper>
 * ```
 */

import React, { forwardRef } from 'react';
import { colors } from '@/lib/brand-tokens';
import { ExportHeader, type ExportHeaderProps } from './ExportHeader';
import { ExportFooter, type ExportFooterProps } from './ExportFooter';

export interface ExportWrapperProps {
  /** Content to wrap */
  children: React.ReactNode;
  /** Report title */
  title: string;
  /** Optional subtitle */
  subtitle?: string;
  /** Fund name */
  fundName?: string;
  /** Show header */
  showHeader?: boolean;
  /** Show footer */
  showFooter?: boolean;
  /** Header props override */
  headerProps?: Partial<ExportHeaderProps>;
  /** Footer props override */
  footerProps?: Partial<ExportFooterProps>;
  /** Background color */
  backgroundColor?: string;
  /** Padding around content */
  contentPadding?: string | number;
  /** Width of the export container */
  width?: string | number;
  /** Height of the export container */
  height?: string | number;
  /** Additional className */
  className?: string;
  /** Additional styles */
  style?: React.CSSProperties;
}

/**
 * Export Wrapper Component
 *
 * Wraps content with branded header/footer for screenshot/export.
 */
export const ExportWrapper = forwardRef<HTMLDivElement, ExportWrapperProps>(
  (
    {
      children,
      title,
      subtitle,
      fundName,
      showHeader = true,
      showFooter = true,
      headerProps,
      footerProps,
      backgroundColor = colors.white,
      contentPadding = '24px',
      width = '100%',
      height = 'auto',
      className,
      style,
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={`export-wrapper ${className ?? ''}`}
        style={{
          width,
          height,
          backgroundColor,
          fontFamily: 'Inter, sans-serif',
          display: 'flex',
          flexDirection: 'column',
          ...style,
        }}
      >
        {/* Header */}
        {showHeader && (
          <ExportHeader
            title={title}
            {...(subtitle ? { subtitle } : {})}
            {...(fundName ? { fundName } : {})}
            {...headerProps}
          />
        )}

        {/* Content */}
        <div
          className="export-content"
          style={{
            flex: 1,
            padding: contentPadding,
            backgroundColor,
            overflow: 'hidden',
          }}
        >
          {children}
        </div>

        {/* Footer */}
        {showFooter && <ExportFooter {...footerProps} />}
      </div>
    );
  }
);

ExportWrapper.displayName = 'ExportWrapper';

export default ExportWrapper;
