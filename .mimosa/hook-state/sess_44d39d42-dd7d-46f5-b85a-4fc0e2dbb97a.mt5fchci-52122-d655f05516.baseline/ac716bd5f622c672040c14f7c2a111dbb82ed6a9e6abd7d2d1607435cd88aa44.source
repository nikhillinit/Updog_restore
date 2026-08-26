/**
 * LP Portal Sprint 3 API Types
 *
 * Type definitions for:
 * - Capital call tracking (TC-LP-003)
 * - Distribution history with breakdown (TC-LP-004)
 * - Enhanced dashboard (TC-LP-002)
 * - Document management (TC-LP-006)
 * - In-app notifications (TC-LP-008)
 *
 * @module shared/types/lp-sprint3
 */

// ============================================================================
// CAPITAL CALLS (TC-LP-003)
// ============================================================================

export interface WireInstructions {
  bankName: string;
  accountName: string;
  accountNumber: string; // Masked: ****1234
  routingNumber: string; // Masked: ****5678
  swiftCode?: string;
  reference: string;
}

export type CapitalCallStatus = 'pending' | 'due' | 'overdue' | 'paid' | 'partial';

export interface CapitalCall {
  id: string;
  lpId: number;
  fundId: number;
  fundName: string;
  commitmentId: number;
  callNumber: number;
  callAmount: number; // In cents
  dueDate: string; // ISO date
  callDate: string; // ISO date
  status: CapitalCallStatus;
  purpose: string | null;
  paidAmount: number | null; // Amount paid (if partial/paid)
  paidDate: string | null; // When payment was received
  wireInstructions: WireInstructions;

  // Computed fields
  daysUntilDue?: number;
  daysOverdue?: number;
}

export interface CapitalCallListResponse {
  capitalCalls: CapitalCall[];
  nextCursor: string | null;
  hasMore: boolean;
  summary: {
    totalCalls: number;
    pendingCount: number;
    overdueCount: number;
    totalPending: number; // Total amount pending in cents
    totalOverdue: number; // Total amount overdue in cents
  };
}

export interface CapitalCallDetailResponse {
  capitalCall: CapitalCall;
  paymentHistory: PaymentSubmission[];
}

export type PaymentStatus = 'pending' | 'confirmed' | 'rejected';

export interface PaymentSubmission {
  id: string;
  callId: string;
  amount: number; // In cents
  paymentDate: string; // ISO date
  referenceNumber: string;
  receiptUrl?: string;
  status: PaymentStatus;
  submittedAt: string;
  confirmedAt?: string;
  rejectionReason?: string;
  notes?: string;
}

export interface PaymentSubmissionRequest {
  amount: number; // In cents
  paymentDate: string; // ISO date
  referenceNumber: string;
  receiptUrl?: string;
  notes?: string;
}

export interface PaymentSubmissionResponse {
  success: boolean;
  submission: PaymentSubmission;
  callStatus: CapitalCallStatus; // Updated call status
  message: string;
}

// ============================================================================
// DISTRIBUTIONS (TC-LP-004)
// ============================================================================

export type DistributionType = 'return_of_capital' | 'capital_gains' | 'dividend' | 'mixed';
export type DistributionStatus = 'pending' | 'processing' | 'completed';

export interface WaterfallBreakdown {
  returnOfCapital: number; // Non-taxable (cents)
  preferredReturn: number; // Taxable (cents)
  carriedInterest: number; // Taxable - carry tier (cents)
  catchUp: number; // GP catch-up (cents)
}

export interface TaxBreakdown {
  nonTaxable: number; // ROC (cents)
  ordinaryIncome: number; // Short-term gains (cents)
  longTermCapitalGains: number; // Long-term gains (cents)
  qualifiedDividends: number; // Qualified dividends (cents)
}

export interface Distribution {
  id: string;
  lpId: number;
  fundId: number;
  fundName: string;
  distributionNumber: number;
  totalAmount: number; // In cents
  distributionDate: string; // ISO date
  distributionType: DistributionType;
  status: DistributionStatus;

  // Waterfall breakdown
  breakdown: WaterfallBreakdown;

  // Tax categorization
  taxBreakdown: TaxBreakdown;

  // Wire details
  wireDate?: string;
  wireReference?: string;
  notes?: string;
}

export interface DistributionListResponse {
  distributions: Distribution[];
  nextCursor: string | null;
  hasMore: boolean;
  summary: {
    totalDistributed: number; // Total in cents
    distributionCount: number;
  };
}

export interface DistributionDetailResponse {
  distribution: Distribution;
  // Pro-rata share of underlying exits (if available)
  underlyingExits?: {
    companyName: string;
    exitAmount: number;
    lpProRataShare: number;
    exitDate: string;
  }[];
}

export interface DistributionSummary {
  year: number;
  totalDistributed: number; // Cents
  returnOfCapital: number; // Cents
  taxableIncome: number; // Cents
  byQuarter: {
    quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
    amount: number;
    breakdown: WaterfallBreakdown;
  }[];
}

export interface TaxExportResponse {
  year: number;
  lpName: string;
  csvData: string; // CSV content
  fileName: string;
  totalDistributed: number;
  totalTaxable: number;
  totalNonTaxable: number;
}

// ============================================================================
// ENHANCED DASHBOARD (TC-LP-002)
// ============================================================================

export interface PerformanceMetrics {
  netMOIC: number; // e.g., 1.67
  netIRR: number; // e.g., 0.152 (15.2%)
  dpi: number; // Distributed to Paid-In
  tvpi: number; // Total Value to Paid-In
  rvpi: number; // Residual Value to Paid-In
}

export type ActivityType = 'capital_call' | 'distribution' | 'report' | 'notification';

export interface ActivityItem {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  amount?: number; // In cents
  date: string; // ISO date
  fundName?: string;
  status?: string;
  actionUrl?: string;
}

export interface PendingItems {
  capitalCalls: number; // Count of due/overdue calls
  reportsReady: number; // Count of new reports
  unreadNotifications: number;
}

export interface LPDashboard {
  // Basic summary
  lpId: number;
  lpName: string;
  totalCommitted: string; // Bigint as string
  totalCalled: string;
  totalDistributed: string;
  totalNAV: string;
  totalUnfunded: string;
  fundCount: number;

  // Performance metrics (TC-LP-002b)
  performance: PerformanceMetrics;

  // Recent activity (TC-LP-002c)
  recentActivity: ActivityItem[];

  // Pending items requiring attention
  pendingItems: PendingItems;

  // Last updated timestamp
  asOfDate: string;
}

// ============================================================================
// PERFORMANCE CHARTS (TC-LP-005)
// ============================================================================

export interface PerformanceChartPeriod {
  date: string;
  cumulativeCalledCapital: number; // Cents
  cumulativeDistributions: number; // Cents
  currentValue: number; // NAV in cents
  unrealizedGains: number; // Cents (for shaded area)
}

export interface MOICDetail {
  value: number;
  formula: string;
  components: {
    distributions: number;
    currentValue: number;
    capitalCalled: number;
  };
}

export interface IRRDetail {
  value: number;
  methodology: string;
  notes: string[];
}

export interface PerformanceChartData {
  periods: PerformanceChartPeriod[];
  metrics: {
    moic: MOICDetail;
    irr: IRRDetail;
    dpi: number;
    tvpi: number;
    rvpi: number;
  };
}

export interface CashFlowDetail {
  date: string;
  type: 'call' | 'distribution';
  amount: number; // Cents (negative for calls)
  description: string;
  runningContributions: number;
  runningDistributions: number;
}

export interface CashFlowTimelineResponse {
  cashFlows: CashFlowDetail[];
  summary: {
    totalContributions: number;
    totalDistributions: number;
    netCashFlow: number;
  };
}

// ============================================================================
// DOCUMENTS (TC-LP-006)
// ============================================================================

export type DocumentType =
  | 'quarterly_report'
  | 'annual_report'
  | 'k1'
  | 'lpa'
  | 'side_letter'
  | 'fund_overview'
  | 'other';

export type AccessLevel = 'standard' | 'sensitive';
export type DocumentStatus = 'available' | 'archived';

export interface LPDocument {
  id: string;
  lpId: number;
  fundId?: number;
  fundName?: string;

  // Document metadata
  documentType: DocumentType;
  title: string;
  description?: string;

  // File info
  fileName: string;
  fileSize: number; // Bytes
  mimeType: string;

  // Dates
  documentDate?: string; // Date of content (e.g., Q4 2024)
  publishedAt: string; // When uploaded/published

  // Access control
  accessLevel: AccessLevel;
  status: DocumentStatus;
}

export interface DocumentListResponse {
  documents: LPDocument[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
}

export interface DocumentSearchParams {
  query?: string;
  documentType?: DocumentType;
  fundId?: number;
  year?: number;
  quarter?: string;
}

export interface DocumentDownloadResponse {
  success: boolean;
  document: LPDocument;
  downloadUrl: string;
  expiresAt: string;
}

// ============================================================================
// NOTIFICATIONS (TC-LP-008)
// ============================================================================

export type NotificationType =
  | 'capital_call'
  | 'distribution'
  | 'report_ready'
  | 'document'
  | 'system';

export type RelatedEntityType = 'capital_call' | 'distribution' | 'report' | 'document';

export interface LPNotification {
  id: string;
  lpId: number;
  type: NotificationType;
  title: string;
  message: string;

  // Link to related entity
  relatedEntityType?: RelatedEntityType;
  relatedEntityId?: string;
  actionUrl?: string;

  // Status
  read: boolean;
  readAt?: string;

  // Timestamps
  createdAt: string;
  expiresAt?: string;
}

export interface NotificationListResponse {
  notifications: LPNotification[];
  nextCursor: string | null;
  hasMore: boolean;
  unreadCount: number;
}

export interface NotificationPreferences {
  emailCapitalCalls: boolean;
  emailDistributions: boolean;
  emailQuarterlyReports: boolean;
  emailAnnualReports: boolean;
  emailMarketUpdates: boolean;
  inAppCapitalCalls: boolean;
  inAppDistributions: boolean;
  inAppReports: boolean;
}

export interface MarkReadResponse {
  success: boolean;
  unreadCount: number;
}

// ============================================================================
// API REQUEST/RESPONSE HELPERS
// ============================================================================

export interface LPApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    field?: string;
  };
  timestamp: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
  total?: number;
}

export interface DateRangeParams {
  startDate?: string;
  endDate?: string;
}

export interface PaginationParams {
  limit?: number;
  cursor?: string;
}
