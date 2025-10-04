/**
 * Centralized branding constants for Updawg
 * Press On Ventures Fund Modeling Platform
 */

export const BRANDING = {
  app: {
    name: 'Updawg',
    nameStyled: 'UpDawg', // For headers with stylized capitalization
    tagline: 'Modern Fund Modeling for Venture Capital',
  },
  company: {
    name: 'Press On Ventures',
    shortName: 'POV',
    legalName: 'Press On Ventures II L.P.',
  },
  contact: {
    general: 'contact@pressonventures.com',
    portfolio: 'portfolio@pressonventures.com',
    kpi: 'kpi-requests@pressonventures.com',
    support: 'support@pressonventures.com',
    demo: 'demo@pressonventures.com',
  },
  footer: {
    tagline: 'Powered by Press On Ventures',
    copyright: `© ${new Date().getFullYear()} Press On Ventures. All rights reserved.`,
  },
  // Demo/sample data defaults
  demo: {
    fundName: 'Press On Ventures Fund',
    emailDomain: 'example.com', // Use for placeholder emails in demos
  },
} as const;

// Type-safe exports
export type BrandingConfig = typeof BRANDING;
