export const ACTUALS_LEDGER_TEMPLATE_VERSION = 'actuals-ledger/1.0.0' as const;
export const ACTUALS_VALUATION_TEMPLATE_VERSION = 'actuals-valuation/1.0.0' as const;

export const ACTUALS_LEDGER_TEMPLATE_HEADER =
  'event_type,effective_date,amount,currency,company_name,vehicle_slug,deployment_category,description,expense_category,distribution_type,recallable,external_ref' as const;
export const ACTUALS_VALUATION_TEMPLATE_HEADER =
  'company_name,vehicle_slug,mark_date,position_fair_value,currency,mark_source,confidence_level,valuation_method,cost_basis,external_ref' as const;

export const ACTUALS_LEDGER_TEMPLATE_SHA256 =
  '03988ba4732fddd8c361f1a18802825ba32d04265e3c1b71be971c0caa7217b7' as const;
export const ACTUALS_VALUATION_TEMPLATE_SHA256 =
  '767b6f013b95ce29e21edc2d6a9305415c13b0dcfb2c50eca69f14ca510cc34f' as const;
