import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {
        // POV Brand Colors (Enhanced)
        pov: {
          charcoal: '#292929',
          white: '#FFFFFF',
          gray: '#F2F2F2',
          beige: '#E0D8D1',
          success: '#10B981',
          error: '#EF4444',
          warning: '#F59E0B',
        },
        // AI Confidence Level Colors (Semantic)
        confidence: {
          critical: '#ef4444',    // Red for critical/low confidence
          low: '#f59e0b',         // Amber for low confidence
          medium: '#3b82f6',      // Blue for medium confidence
          high: '#10b981',        // Green for high confidence
          excellent: '#059669',   // Dark green for excellent confidence
        },
        // Semantic State Colors (Enhanced)
        semantic: {
          // Success states
          success: {
            50: '#ecfdf5',
            100: '#d1fae5',
            500: '#10b981',
            600: '#059669',
            700: '#047857',
            900: '#064e3b',
          },
          // Warning states
          warning: {
            50: '#fffbeb',
            100: '#fef3c7',
            500: '#f59e0b',
            600: '#d97706',
            700: '#b45309',
            900: '#78350f',
          },
          // Error states
          error: {
            50: '#fef2f2',
            100: '#fee2e2',
            500: '#ef4444',
            600: '#dc2626',
            700: '#b91c1c',
            900: '#7f1d1d',
          },
          // Info states
          info: {
            50: '#eff6ff',
            100: '#dbeafe',
            500: '#3b82f6',
            600: '#2563eb',
            700: '#1d4ed8',
            900: '#1e3a8a',
          },
          // Neutral states
          neutral: {
            50: '#fafafa',
            100: '#f5f5f5',
            200: '#e5e5e5',
            300: '#d4d4d4',
            400: '#a3a3a3',
            500: '#737373',
            600: '#525252',
            700: '#404040',
            800: '#262626',
            900: '#171717',
          },
        },
        // Interactive States (Enhanced)
        interactive: {
          primary: {
            DEFAULT: '#292929',
            hover: '#1f1f1f',
            active: '#141414',
            disabled: '#a3a3a3',
            focus: '#0ea5e9',
          },
          secondary: {
            DEFAULT: '#E0D8D1',
            hover: '#d4cbb8',
            active: '#c4b8a5',
            disabled: '#e5e7eb',
          },
          accent: {
            DEFAULT: '#3b82f6',
            hover: '#2563eb',
            active: '#1d4ed8',
            disabled: '#9ca3af',
          },
        },
        // Target UI theme colors
        charcoal: {
          DEFAULT: "#292929",
          50: "#f8f8f8",
          100: "#f0f0f0",
          200: "#e0e0e0",
          300: "#c0c0c0",
          400: "#a0a0a0",
          500: "#808080",
          600: "#606060",
          700: "#404040",
          800: "#303030",
          900: "#292929",
          950: "#1a1a1a"
        },
        beige: {
          DEFAULT: "#E0D8D1",
          50: "#f9f8f7",
          100: "#f2f0ed",
          200: "#e8e4de",
          300: "#ddd6cb",
          400: "#d1c7b8",
          500: "#c4b8a5",
          600: "#b0a087",
          700: "#8f7f6b",
          800: "#726356",
          900: "#5c4e44"
        },
        lightGray: "#F2F2F2",
        // UI state colors
        success: {
          DEFAULT: "#10b981",
          light: "#d1fae5",
          dark: "#065f46"
        },
        warning: {
          DEFAULT: "#f59e0b", 
          light: "#fef3c7",
          dark: "#92400e"
        },
        error: {
          DEFAULT: "#ef4444",
          light: "#fee2e2", 
          dark: "#991b1b"
        },
        info: {
          DEFAULT: "#3b82f6",
          light: "#dbeafe",
          dark: "#1e40af"
        },
        // Existing shadcn colors (preserved for compatibility)
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        chart: {
          "1": "var(--chart-1)",
          "2": "var(--chart-2)",
          "3": "var(--chart-3)",
          "4": "var(--chart-4)",
          "5": "var(--chart-5)",
        },
        sidebar: {
          DEFAULT: "var(--sidebar-background)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          "primary-foreground": "var(--sidebar-primary-foreground)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          border: "var(--sidebar-border)",
          ring: "var(--sidebar-ring)",
        },
      },
      fontFamily: {
        inter: ["Inter", "sans-serif"],
        poppins: ["Poppins", "sans-serif"],
        mono: ["Roboto Mono", "monospace"],
        sans: ["Inter", "sans-serif"],
      },
      boxShadow: {
        card: "0 2px 8px rgba(0, 0, 0, 0.05)",
        elevated: "0 4px 12px rgba(0, 0, 0, 0.08)",
        // Enhanced shadow system
        'card-hover': '0 8px 24px rgba(0, 0, 0, 0.12)',
        'card-active': '0 2px 4px rgba(0, 0, 0, 0.08)',
        'confidence-high': '0 0 0 2px rgba(16, 185, 129, 0.2)',
        'confidence-medium': '0 0 0 2px rgba(59, 130, 246, 0.2)',
        'confidence-low': '0 0 0 2px rgba(245, 158, 11, 0.2)',
        'confidence-critical': '0 0 0 2px rgba(239, 68, 68, 0.2)',
        'focus-ring': '0 0 0 2px rgba(59, 130, 246, 0.5)',
        'ai-insight': '0 4px 16px rgba(59, 130, 246, 0.1)',
        'success-glow': '0 0 20px rgba(16, 185, 129, 0.2)',
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        // Enhanced Micro-interactions
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          "0%": { opacity: "0", transform: "translateX(20px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "slide-in-left": {
          "0%": { opacity: "0", transform: "translateX(-20px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.9)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "gentle-bounce": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-2px)" },
        },
        "card-hover": {
          "0%": { transform: "translateY(0) scale(1)", boxShadow: "0 2px 8px rgba(0, 0, 0, 0.05)" },
          "100%": { transform: "translateY(-2px) scale(1.005)", boxShadow: "0 8px 24px rgba(0, 0, 0, 0.12)" },
        },
        "loading-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        "confidence-glow": {
          "0%, 100%": { boxShadow: "0 0 5px rgba(59, 130, 246, 0.3)" },
          "50%": { boxShadow: "0 0 15px rgba(59, 130, 246, 0.6)" },
        },
        "ai-thinking": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        "metric-update": {
          "0%": { backgroundColor: "rgba(16, 185, 129, 0)" },
          "50%": { backgroundColor: "rgba(16, 185, 129, 0.2)" },
          "100%": { backgroundColor: "rgba(16, 185, 129, 0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        // Professional Micro-interactions
        "fade-in": "fade-in 0.3s ease-out",
        "slide-in-right": "slide-in-right 0.3s ease-out",
        "slide-in-left": "slide-in-left 0.3s ease-out",
        "scale-in": "scale-in 0.2s ease-out",
        "gentle-bounce": "gentle-bounce 2s ease-in-out infinite",
        "card-hover": "card-hover 0.2s ease-out forwards",
        "loading-pulse": "loading-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "confidence-glow": "confidence-glow 2s ease-in-out infinite",
        "ai-thinking": "ai-thinking 1s linear infinite",
        "metric-update": "metric-update 0.6s ease-out",
      },
      // Enhanced Transitions
      transitionDuration: {
        '0': '0ms',
        '75': '75ms',
        '100': '100ms',
        '150': '150ms',
        '200': '200ms',
        '300': '300ms',
        '500': '500ms',
        '700': '700ms',
        '1000': '1000ms',
      },
      transitionTimingFunction: {
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'smooth-in': 'cubic-bezier(0, 0, 0.2, 1)',
        'smooth-out': 'cubic-bezier(0.4, 0, 1, 1)',
        'professional': 'cubic-bezier(0.25, 0.1, 0.25, 1)',
      },
      // Enhanced Spacing for Touch Targets
      spacing: {
        '18': '4.5rem',   // 72px - optimal touch target
        '22': '5.5rem',   // 88px - comfortable touch target
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    require("@tailwindcss/typography"),
    // Custom plugin for accessibility and interactions
    function({ addUtilities, addComponents, theme }: any) {
      // Accessibility utilities
      addUtilities({
        '.focus-visible-ring': {
          '&:focus-visible': {
            outline: `2px solid ${theme('colors.interactive.primary.focus')}`,
            outlineOffset: '2px',
            borderRadius: theme('borderRadius.sm'),
          },
        },
        '.reduced-motion-safe': {
          '@media (prefers-reduced-motion: reduce)': {
            animation: 'none !important',
            transition: 'none !important',
          },
        },
        '.high-contrast-border': {
          '@media (prefers-contrast: high)': {
            border: '2px solid currentColor',
          },
        },
      });

      // Interactive component classes
      addComponents({
        '.btn-enhanced': {
          transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
          transform: 'translateY(0)',
          '&:focus-visible': {
            outline: `2px solid ${theme('colors.interactive.primary.focus')}`,
            outlineOffset: '2px',
          },
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: theme('boxShadow.elevated'),
          },
          '&:active': {
            transform: 'translateY(0)',
            boxShadow: theme('boxShadow.card-active'),
          },
          '&:disabled': {
            opacity: '0.5',
            cursor: 'not-allowed',
            transform: 'none',
            boxShadow: 'none',
          },
          '@media (prefers-reduced-motion: reduce)': {
            animation: 'none !important',
            transition: 'none !important',
          },
        },
        '.card-enhanced': {
          transition: 'all 300ms cubic-bezier(0.25, 0.1, 0.25, 1)',
          '&:hover': {
            boxShadow: theme('boxShadow.card-hover'),
            transform: 'translateY(-4px)',
          },
          '@media (prefers-reduced-motion: reduce)': {
            animation: 'none !important',
            transition: 'none !important',
          },
        },
        '.ai-confidence-indicator': {
          '&.critical': {
            borderLeftWidth: '4px',
            borderLeftColor: theme('colors.confidence.critical'),
            backgroundColor: theme('colors.semantic.error.50'),
          },
          '&.low': {
            borderLeftWidth: '4px',
            borderLeftColor: theme('colors.confidence.low'),
            backgroundColor: theme('colors.semantic.warning.50'),
          },
          '&.medium': {
            borderLeftWidth: '4px',
            borderLeftColor: theme('colors.confidence.medium'),
            backgroundColor: theme('colors.semantic.info.50'),
          },
          '&.high': {
            borderLeftWidth: '4px',
            borderLeftColor: theme('colors.confidence.high'),
            backgroundColor: theme('colors.semantic.success.50'),
          },
        },
      });
    }
  ],
} satisfies Config;

// Export type definitions for enhanced design system
export type ConfidenceLevel = 'critical' | 'low' | 'medium' | 'high' | 'excellent';
export type SemanticColor = 'success' | 'warning' | 'error' | 'info' | 'neutral';
export type InteractiveState = 'default' | 'hover' | 'active' | 'disabled' | 'focus';
