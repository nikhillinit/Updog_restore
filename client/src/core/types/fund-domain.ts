/**
 * Fund Domain Types
 *
 * Type-safe domain models for VC fund KPI calculations.
 * All types are designed for immutability and pure function compatibility.
 *
 * @module fund-domain
 */

/**
 * Core fund information
 */
export interface Fund {
  id: number;
  name: string;
  size: number; // Total committed capital
  managementFee: number; // Annual management fee rate (decimal, e.g., 0.025 for 2.5%)
  carryPercentage: number; // Carried interest percentage (decimal, e.g., 0.20 for 20%)
  vintageYear: number;
  establishmentDate?: string; // ISO date string
  deployedCapital: number; // Total capital deployed to date
  status: string;
  createdAt: string;
  updatedAt: string;
  termYears?: number; // Fund term in years
}

/**
 * Portfolio company investment
 */
export interface Investment {
  id: number;
  fundId: number;
  companyName: string;
  investmentDate: string; // ISO date string
  initialAmount: number; // Initial investment amount
  totalInvested: number; // Total invested including follow-ons
  stage: string; // e.g., 'seed', 'series_a', 'series_b'
  sector: string;
  ownership: number; // Ownership percentage (decimal, e.g., 0.15 for 15%)
  isActive: boolean;
  exitDate?: string; // ISO date string if exited
  exitAmount?: number; // Exit proceeds if realized
  createdAt: string;
  updatedAt: string;
}

/**
 * Portfolio company valuation (fair value)
 */
export interface Valuation {
  id: number;
  investmentId: number;
  valuationDate: string; // ISO date string
  fairValue: number; // Fair market value of the position
  valuer: string; // Who provided the valuation (e.g., 'GP', 'third_party')
  methodology: string; // Valuation methodology (e.g., 'last_round', 'dcf', 'comparable')
  notes?: string;
  isLatest: boolean; // Whether this is the most recent valuation
  createdAt: string;
  updatedAt: string;
}

/**
 * Capital call to LPs
 */
export interface CapitalCall {
  id: number;
  fundId: number;
  callNumber: number; // Sequential capital call number
  amount: number; // Total amount called
  callDate: string; // ISO date string when call was issued
  dueDate: string; // ISO date string when payment is due
  receivedDate?: string; // ISO date string when fully received
  status: 'planned' | 'issued' | 'partial' | 'received' | 'overdue';
  purpose: string; // Reason for the capital call
  createdAt: string;
  updatedAt: string;
}

/**
 * Distribution to LPs
 */
export interface Distribution {
  id: number;
  fundId: number;
  distributionDate: string; // ISO date string
  amount: number; // Total distribution amount
  type: 'recallable' | 'non_recallable' | 'return_of_capital' | 'profit';
  source?: string; // Source of distribution (e.g., company exit, dividend)
  investmentId?: number; // Related investment if distribution is from exit
  status: 'planned' | 'approved' | 'executed';
  createdAt: string;
  updatedAt: string;
}

/**
 * Fund operating expenses and fees
 */
export interface FeeExpense {
  id: number;
  fundId: number;
  expenseDate: string; // ISO date string
  amount: number; // Expense amount (positive number)
  category: 'management_fee' | 'legal' | 'audit' | 'admin' | 'consulting' | 'other';
  description: string;
  isPaid: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Cash flow event for XIRR/IRR calculations
 * Negative amounts = outflows (investments, fees)
 * Positive amounts = inflows (distributions, exits)
 */
export interface CashFlowEvent {
  date: string; // ISO date string
  amount: number; // Positive for inflows, negative for outflows
  type: 'capital_call' | 'distribution' | 'fee' | 'other';
}

/**
 * Complete fund data structure for KPI calculations
 * This is the primary input to selector functions
 */
export interface FundData {
  fund: Fund;
  investments: Investment[];
  valuations: Valuation[];
  capitalCalls: CapitalCall[];
  distributions: Distribution[];
  feeExpenses: FeeExpense[];
}

/**
 * Historical snapshot options for "as of" date queries
 */
export interface AsOfOptions {
  asOf?: string; // ISO date string - if not provided, uses current date
}

/**
 * KPI calculation result with metadata
 */
export interface KPIResult<T> {
  value: T;
  calculatedAt: string; // ISO date string
  asOf?: string; // ISO date string if historical
  metadata?: Record<string, unknown>;
}

/**
 * Complete KPI snapshot
 */
export interface FundKPIs {
  committed: number; // Total committed capital
  called: number; // Total capital called from LPs
  uncalled: number; // Remaining callable capital (committed - called)
  invested: number; // Total capital invested in portfolio companies
  nav: number; // Net Asset Value (current portfolio value - liabilities)
  dpi: number; // Distributions to Paid-In (distributions / called)
  tvpi: number; // Total Value to Paid-In ((distributions + nav) / called)
  irr: number; // Internal Rate of Return (annualized)
  calculatedAt: string; // ISO date string
  asOf?: string; // ISO date string if historical
}

/**
 * Type guards for runtime validation
 */
export function isFund(obj: unknown): obj is Fund {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'name' in obj &&
    'size' in obj &&
    typeof (obj as Fund).size === 'number'
  );
}

export function isFundData(obj: unknown): obj is FundData {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'fund' in obj &&
    'investments' in obj &&
    'valuations' in obj &&
    'capitalCalls' in obj &&
    'distributions' in obj &&
    'feeExpenses' in obj &&
    isFund((obj as FundData).fund) &&
    Array.isArray((obj as FundData).investments) &&
    Array.isArray((obj as FundData).valuations) &&
    Array.isArray((obj as FundData).capitalCalls) &&
    Array.isArray((obj as FundData).distributions) &&
    Array.isArray((obj as FundData).feeExpenses)
  );
}

/**
 * Helper type for filtering by date
 */
export type DateFilterable = {
  [K in keyof any]: string;
} & Record<string, unknown>;

/**
 * Utility type for making all properties optional except specified keys
 */
export type PartialExcept<T, K extends keyof T> = Partial<T> & Pick<T, K>;
