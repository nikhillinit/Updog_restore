/**
 * Capital Allocation Step Components
 * Exports all portfolio management UI components
 */

export { CapitalHeader } from './CapitalHeader';
export type { CapitalHeaderProps } from './CapitalHeader';

export { PortfolioConfigForm } from './PortfolioConfigForm';
export type { PortfolioConfigFormProps } from './PortfolioConfigForm';

export { CompanyDialog } from './CompanyDialog';
export type { CompanyDialogProps, CompanyData } from './CompanyDialog';

export { PortfolioTable } from './PortfolioTable';
export type { PortfolioTableProps } from './PortfolioTable';

// Validation and metrics display components
export { ValidationDisplay, ValidationSummary } from './ValidationDisplay';
export type { ValidationMessage, ValidationDisplayProps, ValidationSummaryProps } from './ValidationDisplay';

export { PortfolioSummary } from './PortfolioSummary';
export type {
  SectorAllocation,
  StageAllocation,
  PortfolioMetrics,
  PortfolioSummaryProps,
} from './PortfolioSummary';

export { ReserveMetricsDisplay } from './ReserveMetricsDisplay';
export type {
  ReserveMetrics,
  Recommendation,
  ReserveMetricsDisplayProps,
} from './ReserveMetricsDisplay';

export { AllocationsTable, AllocationsTableCompact } from './AllocationsTable';
export type {
  CompanyAllocation,
  AllocationsTableProps,
} from './AllocationsTable';
