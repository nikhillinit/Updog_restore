/**
 * Centralized test IDs for E2E and integration testing
 * 
 * Naming convention: {page}-{section}-{element}
 * Examples: wizard-step1-input-fundName, dashboard-chart-reserves
 */

export const testIds = {
  // Fund Setup Wizard
  wizard: {
    container: 'wizard-container',
    progress: 'wizard-progress',
    navigation: {
      next: 'wizard-nav-next',
      prev: 'wizard-nav-prev',
      save: 'wizard-nav-save',
      cancel: 'wizard-nav-cancel'
    },
    step1: {
      container: 'wizard-step1-container',
      fundName: 'wizard-step1-input-fundName',
      fundSize: 'wizard-step1-input-fundSize',
      fundType: 'wizard-step1-select-fundType',
      vintage: 'wizard-step1-input-vintage',
      stage: 'wizard-step1-select-stage'
    },
    step2: {
      container: 'wizard-step2-container',
      targetDeployment: 'wizard-step2-input-targetDeployment',
      reservePercent: 'wizard-step2-input-reservePercent',
      managementFee: 'wizard-step2-input-managementFee',
      carryPercent: 'wizard-step2-input-carryPercent'
    },
    step3: {
      container: 'wizard-step3-container',
      pacingStrategy: 'wizard-step3-select-pacingStrategy',
      deploymentPeriod: 'wizard-step3-input-deploymentPeriod',
      followOnRatio: 'wizard-step3-input-followOnRatio',
      recycleCapital: 'wizard-step3-checkbox-recycleCapital'
    },
    step4: {
      container: 'wizard-step4-container',
      summary: 'wizard-step4-summary',
      confirmButton: 'wizard-step4-button-confirm',
      editButton: 'wizard-step4-button-edit'
    },
    validation: {
      error: 'wizard-validation-error',
      warning: 'wizard-validation-warning',
      success: 'wizard-validation-success'
    }
  },

  // Dashboard
  dashboard: {
    container: 'dashboard-container',
    header: 'dashboard-header',
    filters: {
      container: 'dashboard-filters',
      dateRange: 'dashboard-filter-dateRange',
      fundSelect: 'dashboard-filter-fund',
      scenarioSelect: 'dashboard-filter-scenario'
    },
    metrics: {
      totalValue: 'dashboard-metric-totalValue',
      irr: 'dashboard-metric-irr',
      tvpi: 'dashboard-metric-tvpi',
      dpi: 'dashboard-metric-dpi'
    },
    charts: {
      reserves: 'dashboard-chart-reserves',
      pacing: 'dashboard-chart-pacing',
      portfolio: 'dashboard-chart-portfolio',
      cashflow: 'dashboard-chart-cashflow'
    }
  },

  // Reserves Engine
  reserves: {
    container: 'reserves-container',
    input: {
      totalReserve: 'reserves-input-totalReserve',
      strategy: 'reserves-input-strategy',
      remainPass: 'reserves-input-remainPass',
      capPolicy: 'reserves-input-capPolicy'
    },
    output: {
      allocations: 'reserves-output-allocations',
      remaining: 'reserves-output-remaining',
      diagnostics: 'reserves-output-diagnostics'
    },
    actions: {
      calculate: 'reserves-action-calculate',
      reset: 'reserves-action-reset',
      export: 'reserves-action-export',
      snapshot: 'reserves-action-snapshot'
    }
  },

  // Monte Carlo Simulation
  simulation: {
    container: 'simulation-container',
    config: {
      runs: 'simulation-config-runs',
      seed: 'simulation-config-seed',
      confidence: 'simulation-config-confidence'
    },
    results: {
      distribution: 'simulation-results-distribution',
      statistics: 'simulation-results-statistics',
      percentiles: 'simulation-results-percentiles'
    },
    actions: {
      run: 'simulation-action-run',
      cancel: 'simulation-action-cancel',
      save: 'simulation-action-save'
    }
  },

  // Settings
  settings: {
    container: 'settings-container',
    tabs: {
      general: 'settings-tab-general',
      security: 'settings-tab-security',
      notifications: 'settings-tab-notifications',
      advanced: 'settings-tab-advanced'
    },
    actions: {
      save: 'settings-action-save',
      cancel: 'settings-action-cancel',
      reset: 'settings-action-reset'
    }
  },

  // Common UI Elements
  common: {
    modal: {
      container: 'modal-container',
      title: 'modal-title',
      content: 'modal-content',
      confirm: 'modal-button-confirm',
      cancel: 'modal-button-cancel'
    },
    toast: {
      container: 'toast-container',
      message: 'toast-message',
      close: 'toast-button-close'
    },
    loading: {
      spinner: 'loading-spinner',
      overlay: 'loading-overlay',
      message: 'loading-message'
    },
    error: {
      container: 'error-container',
      message: 'error-message',
      retry: 'error-button-retry',
      dismiss: 'error-button-dismiss'
    }
  }
} as const;

// Type-safe test ID getter
export function getTestId(path: string): string {
  return path;
}

// Helper to add data-testid attribute
export function withTestId(id: string): { 'data-testid': string } {
  return { 'data-testid': id };
}

// Helper for Playwright selectors
export function testIdSelector(id: string): string {
  return `[data-testid="${id}"]`;
}

// Export type for type safety
export type TestIds = typeof testIds;