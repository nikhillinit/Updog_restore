/** @type {import('tailwindcss').Config} */

import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
    './client/**/*.{ts,tsx}',
    './shared/**/*.{ts,tsx}',
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      // Brand Typography
      fontFamily: {
        'inter': ['Inter', 'system-ui', 'sans-serif'],
        'poppins': ['Poppins', 'system-ui', 'sans-serif'],
        'sans': ['Inter', 'system-ui', 'sans-serif'], // Default to Inter
        'heading': ['Inter', 'system-ui', 'sans-serif'], // Headlines
        'body': ['Poppins', 'system-ui', 'sans-serif'], // Body text
        'mono': ['Fira Code', 'Monaco', 'Cascadia Code', 'Roboto Mono', 'monospace'],
      },

      // Enhanced Color Palette
      colors: {
        // Brand Colors
        brand: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },

        // Neutral Palette (Primary)
        neutral: {
          0: '#ffffff',
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
          950: '#0a0a0a',
        },

        // Semantic Colors
        success: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
          950: '#052e16',
        },

        warning: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
          950: '#431407',
        },

        error: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
          950: '#450a0a',
        },

        // Financial Data Colors
        financial: {
          profit: '#22c55e',
          loss: '#ef4444',
          neutral: '#6b7280',
          growth: '#10b981',
          decline: '#f59e0b',
          stable: '#8b5cf6',
        },

        // Chart Colors (Optimized for data visualization)
        chart: {
          1: '#8b5cf6',  // Purple
          2: '#06b6d4',  // Cyan
          3: '#10b981',  // Emerald
          4: '#f59e0b',  // Amber
          5: '#ef4444',  // Red
          6: '#8b5cf6',  // Purple (repeat for more series)
          7: '#06b6d4',  // Cyan
          8: '#10b981',  // Emerald
        },

        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },

      // Enhanced Spacing
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '120': '30rem',
        '144': '36rem',
      },

      // Component-specific spacing
      gap: {
        'xs': '0.5rem',
        'sm': '0.75rem',
        'md': '1rem',
        'lg': '1.5rem',
        'xl': '2rem',
        '2xl': '3rem',
      },

      // Typography Scale
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.75rem' }],
        'xs': ['0.75rem', { lineHeight: '1rem' }],
        'sm': ['0.875rem', { lineHeight: '1.25rem' }],
        'base': ['1rem', { lineHeight: '1.5rem' }],
        'lg': ['1.125rem', { lineHeight: '1.75rem' }],
        'xl': ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
        '5xl': ['3rem', { lineHeight: '1' }],
        '6xl': ['3.75rem', { lineHeight: '1' }],
        '7xl': ['4.5rem', { lineHeight: '1' }],
        '8xl': ['6rem', { lineHeight: '1' }],
        '9xl': ['8rem', { lineHeight: '1' }],

        // Semantic font sizes
        'caption': ['0.75rem', { lineHeight: '1rem' }],
        'body-sm': ['0.875rem', { lineHeight: '1.5rem' }],
        'body': ['1rem', { lineHeight: '1.5rem' }],
        'body-lg': ['1.125rem', { lineHeight: '1.75rem' }],
        'heading-sm': ['1.25rem', { lineHeight: '1.75rem' }],
        'heading': ['1.5rem', { lineHeight: '2rem' }],
        'heading-lg': ['1.875rem', { lineHeight: '2.25rem' }],
        'heading-xl': ['2.25rem', { lineHeight: '2.5rem' }],
        'display': ['3rem', { lineHeight: '1.2' }],
      },

      // Enhanced Border Radius
      borderRadius: {
        'lg': "var(--radius)",
        'md': "calc(var(--radius) - 2px)",
        'sm': "calc(var(--radius) - 4px)",
        '2xs': '0.125rem',
        'xs': '0.25rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },

      // Box Shadows
      boxShadow: {
        'xs': '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        'sm': '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
        'md': '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        'lg': '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
        'xl': '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
        '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
        'inner': 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
        
        // Component-specific shadows
        'card': '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px 0 rgb(0 0 0 / 0.06)',
        'card-hover': '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -1px rgb(0 0 0 / 0.06)',
        'modal': '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 10px 10px -5px rgb(0 0 0 / 0.04)',
        'dropdown': '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -2px rgb(0 0 0 / 0.05)',
      },

      // Animation & Transitions
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.5s ease-out",
        "fade-out": "fade-out 0.5s ease-out",
        "slide-in": "slide-in 0.3s ease-out",
        "slide-out": "slide-out 0.3s ease-out",
        "bounce-in": "bounce-in 0.5s ease-out",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },

      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-out": {
          from: { opacity: "1" },
          to: { opacity: "0" },
        },
        "slide-in": {
          from: { transform: "translateY(-10px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "slide-out": {
          from: { transform: "translateY(0)", opacity: "1" },
          to: { transform: "translateY(-10px)", opacity: "0" },
        },
        "bounce-in": {
          "0%": { transform: "scale(0.3)", opacity: "0" },
          "50%": { transform: "scale(1.05)" },
          "70%": { transform: "scale(0.9)" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },

      // Responsive Breakpoints (enhanced)
      screens: {
        'xs': '475px',
        'sm': '640px',
        'md': '768px',
        'lg': '1024px',
        'xl': '1280px',
        '2xl': '1536px',
        '3xl': '1920px',
        
        // Specific breakpoints
        'mobile': { 'max': '767px' },
        'tablet': { 'min': '768px', 'max': '1023px' },
        'desktop': { 'min': '1024px' },
        'wide': { 'min': '1536px' },
      },

      // Grid System
      gridTemplateColumns: {
        '13': 'repeat(13, minmax(0, 1fr))',
        '14': 'repeat(14, minmax(0, 1fr))',
        '15': 'repeat(15, minmax(0, 1fr))',
        '16': 'repeat(16, minmax(0, 1fr))',
        
        // Dashboard specific layouts
        'dashboard': '240px 1fr',
        'dashboard-wide': '280px 1fr',
        'sidebar-content': 'minmax(200px, 300px) 1fr',
        'card-grid': 'repeat(auto-fit, minmax(300px, 1fr))',
      },

      // Z-index scale
      zIndex: {
        '1': '1',
        '2': '2',
        '3': '3',
        '4': '4',
        '5': '5',
        'dropdown': '1000',
        'sticky': '1020',
        'fixed': '1030',
        'modal-backdrop': '1040',
        'modal': '1050',
        'popover': '1060',
        'tooltip': '1070',
        'toast': '1080',
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    require("@tailwindcss/typography"),
    
    // Custom plugin for component utilities
    function({ addUtilities, addComponents, theme }) {
      // Add custom utilities
      addUtilities({
        '.text-balance': {
          'text-wrap': 'balance',
        },
        '.text-pretty': {
          'text-wrap': 'pretty',
        },
        
        // Scrollbar utilities
        '.scrollbar-none': {
          'scrollbar-width': 'none',
          '&::-webkit-scrollbar': {
            display: 'none',
          },
        },
        '.scrollbar-thin': {
          'scrollbar-width': 'thin',
          '&::-webkit-scrollbar': {
            width: '8px',
            height: '8px',
          },
        },
        
        // Focus utilities
        '.focus-ring': {
          '&:focus': {
            outline: '2px solid transparent',
            'outline-offset': '2px',
            'box-shadow': `0 0 0 2px ${theme('colors.brand.500')}`,
          },
        },
      });

      // Add custom components
      addComponents({
        // Card components
        '.card': {
          'background-color': theme('colors.white'),
          'border-radius': theme('borderRadius.lg'),
          'padding': theme('spacing.6'),
          'box-shadow': theme('boxShadow.card'),
          'border': `1px solid ${theme('colors.neutral.200')}`,
        },
        '.card-hover': {
          'transition': 'all 0.2s ease-in-out',
          '&:hover': {
            'box-shadow': theme('boxShadow.card-hover'),
            'transform': 'translateY(-1px)',
          },
        },

        // Button variants
        '.btn-primary': {
          'background-color': theme('colors.brand.600'),
          'color': theme('colors.white'),
          'padding': `${theme('spacing.2')} ${theme('spacing.4')}`,
          'border-radius': theme('borderRadius.md'),
          'font-weight': theme('fontWeight.medium'),
          'transition': 'all 0.2s ease-in-out',
          '&:hover': {
            'background-color': theme('colors.brand.700'),
          },
          '&:focus': {
            'outline': '2px solid transparent',
            'outline-offset': '2px',
            'box-shadow': `0 0 0 2px ${theme('colors.brand.500')}`,
          },
        },

        // Typography components
        '.heading-1': {
          'font-family': theme('fontFamily.heading'),
          'font-size': theme('fontSize.heading-xl')[0],
          'line-height': theme('fontSize.heading-xl')[1].lineHeight,
          'font-weight': theme('fontWeight.bold'),
          'color': theme('colors.neutral.900'),
        },
        '.heading-2': {
          'font-family': theme('fontFamily.heading'),
          'font-size': theme('fontSize.heading-lg')[0],
          'line-height': theme('fontSize.heading-lg')[1].lineHeight,
          'font-weight': theme('fontWeight.semibold'),
          'color': theme('colors.neutral.900'),
        },
        '.body-text': {
          'font-family': theme('fontFamily.body'),
          'font-size': theme('fontSize.body')[0],
          'line-height': theme('fontSize.body')[1].lineHeight,
          'color': theme('colors.neutral.700'),
        },
      });
    },
  ],
};

export default config;