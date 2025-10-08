/**
 * Press On Ventures Design Tokens
 *
 * Unified design system based on official brand guidelines.
 * Single source of truth for colors, typography, spacing, and interactive patterns.
 */

// ============================================================================
// COLOR SYSTEM
// ============================================================================

export const presson = {
  color: {
    // Primary brand colors
    bg: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceSubtle: '#F2F2F2',
    borderSubtle: '#E0D8D1',
    text: '#292929',
    textMuted: '#5A5A5A',
    accent: '#292929',           // Primary CTAs
    accentOn: '#FFFFFF',          // Text on accent
    highlight: '#E0D8D1',         // Warm highlight

    // Gradient system
    gradientFrom: '#E0D8D1',
    gradientTo: '#FFFFFF',

    // Semantic colors (preserved from existing system)
    positive: '#127E3D',
    negative: '#B00020',
    warning: '#9C6F19',
    info: '#2563EB',
  },

  // ============================================================================
  // SPACING SYSTEM (8px grid)
  // ============================================================================

  spacing: (n: number) => `${n * 8}px`,

  // ============================================================================
  // BORDER RADIUS
  // ============================================================================

  radius: {
    xs: '4px',
    sm: '6px',
    md: '10px',
    lg: '16px',
    xl: '24px'
  },

  // ============================================================================
  // SHADOW SYSTEM
  // ============================================================================

  shadow: {
    sm: '0 1px 2px rgba(0,0,0,0.06)',
    md: '0 4px 12px rgba(0,0,0,0.08)',
    lg: '0 10px 24px rgba(0,0,0,0.10)',
    card: '0 2px 8px rgba(0,0,0,0.05)',
    cardHover: '0 8px 24px rgba(0,0,0,0.12)',
  },

  // ============================================================================
  // FOCUS RING (Accessibility)
  // ============================================================================

  focus: {
    ring: '0 0 0 3px rgba(41,41,41,0.25)'
  },

  // ============================================================================
  // TYPOGRAPHY
  // ============================================================================

  typography: {
    heading: '"Inter", ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Noto Sans", "Apple Color Emoji","Segoe UI Emoji"',
    body: '"Poppins", ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  },

  // ============================================================================
  // TRANSITIONS
  // ============================================================================

  transition: {
    fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
    normal: '200ms cubic-bezier(0.4, 0, 0.2, 1)',
    slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
  },
} as const;

// ============================================================================
// UTILITY CLASSES (for use with cn() helper)
// ============================================================================

export const pressOnClasses = {
  // Typography
  heading: {
    h1: 'font-heading text-4xl font-bold text-text',
    h2: 'font-heading text-3xl font-bold text-text',
    h3: 'font-heading text-2xl font-bold text-text',
    h4: 'font-heading text-xl font-bold text-text',
    h5: 'font-heading text-lg font-bold text-text',
  },

  body: {
    base: 'font-body text-base text-text',
    sm: 'font-body text-sm text-text',
    lg: 'font-body text-lg text-text',
    muted: 'font-body text-textMuted',
  },

  // Cards
  card: {
    base: 'bg-surface shadow-card rounded-lg border border-borderSubtle',
    hover: 'transition-all duration-200 hover:shadow-cardHover hover:-translate-y-1',
    interactive: 'cursor-pointer transition-all duration-200 hover:shadow-cardHover hover:-translate-y-1',
  },

  // Buttons
  button: {
    primary: 'bg-accent text-accentOn hover:bg-accent/90 transition-colors duration-200',
    secondary: 'border border-borderSubtle text-text hover:bg-surfaceSubtle transition-colors duration-200',
    ghost: 'text-text hover:bg-surfaceSubtle transition-colors duration-200',
  },

  // Inputs
  input: {
    base: 'border border-borderSubtle rounded-md px-3 py-2 bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 transition-all duration-200',
    error: 'border-negative focus:ring-negative/30',
  },

  // Focus states (accessibility)
  focus: {
    visible: 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-2',
  },
} as const;

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type PressOnColor = keyof typeof presson.color;
export type PressOnRadius = keyof typeof presson.radius;
export type PressOnShadow = keyof typeof presson.shadow;
export type PressOnTransition = keyof typeof presson.transition;
