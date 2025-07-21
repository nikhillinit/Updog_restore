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
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
