/**
 * Press On Ventures Theme Utilities
 * Based on official brand guidelines
 */

// Official Press On Ventures Colors
export const pressOnColors = {
  // Main colors
  dark: '#292929',        // R41 G41 B41
  beige: '#E0D8D1',       // R224 G216 B209
  white: '#FFFFFF',       // R255 G255 B255
  light: '#F2F2F2',       // R242 G242 B242

  // Hover/Active states
  beigeHover: '#d4cbb8',
  beigeActive: '#c4b8a5',
  darkHover: '#1f1f1f',
  darkActive: '#141414',
} as const;

// Typography classes based on brand guide
export const pressOnTypography = {
  // Headings (Inter Bold)
  h1: 'font-inter font-bold text-[#292929]',
  h2: 'font-inter font-bold text-[#292929]',
  h3: 'font-inter font-bold text-[#292929]',
  h4: 'font-inter font-bold text-[#292929]',

  // Subheadings (Poppins Medium)
  subheading: 'font-poppins font-medium text-[#292929]',

  // Body text (Poppins Regular)
  body: 'font-poppins text-[#292929]',
  bodyMuted: 'font-poppins text-[#292929]/70',
  bodySubtle: 'font-poppins text-[#292929]/60',

  // Labels (Poppins Medium)
  label: 'font-poppins font-medium text-[#292929]',
  labelSmall: 'text-sm font-poppins font-medium text-[#292929]',
} as const;

// Component style patterns
export const pressOnComponents = {
  // Cards
  card: 'bg-white rounded-xl border border-[#E0D8D1] shadow-md',
  cardHover: 'hover:shadow-lg hover:border-[#292929] transition-all duration-200',
  cardEdit: 'border-[#292929] bg-[#E0D8D1]/20 shadow-lg ring-2 ring-[#E0D8D1]',

  // Buttons
  buttonPrimary: 'bg-[#292929] hover:bg-[#292929]/90 text-white font-poppins font-medium transition-all duration-200',
  buttonSecondary: 'border-[#E0D8D1] text-[#292929] hover:bg-[#E0D8D1]/20 hover:border-[#292929] font-poppins font-medium transition-all duration-200',

  // Inputs
  input: 'border-[#E0D8D1] focus:border-[#292929] focus:ring-[#292929] font-poppins',
  inputReadonly: 'bg-[#F2F2F2] border-[#E0D8D1]',

  // Tables
  tableHeader: 'bg-[#292929] text-white font-poppins font-bold rounded-xl',
  tableRow: 'bg-white rounded-xl border border-[#E0D8D1] hover:bg-[#F2F2F2] hover:border-[#292929] hover:shadow-md transition-all duration-200',

  // Borders & Dividers
  border: 'border-[#E0D8D1]',
  divider: 'border-t border-[#E0D8D1]',

  // Backgrounds
  bgLight: 'bg-[#F2F2F2]',
  bgWhite: 'bg-white',
  bgBeige: 'bg-[#E0D8D1]',
  bgDark: 'bg-[#292929]',
} as const;

// Helper function to combine classes
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

// Semantic color mapping for state indicators
export const pressOnStates = {
  success: '#10b981',   // Keep existing success color
  warning: '#f59e0b',   // Keep existing warning color
  error: '#ef4444',     // Keep existing error color
  info: '#3b82f6',      // Keep existing info color
} as const;

// Shadow system
export const pressOnShadows = {
  sm: 'shadow-sm',
  md: 'shadow-md',
  lg: 'shadow-lg',
  cardHover: 'shadow-[0_8px_24px_rgba(0,0,0,0.12)]',
} as const;

// Transition system
export const pressOnTransitions = {
  fast: 'transition-all duration-150',
  normal: 'transition-all duration-200',
  slow: 'transition-all duration-300',
} as const;