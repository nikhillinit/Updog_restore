/**
 * Modeling Wizard Page
 *
 * Entry point for the 7-step fund modeling wizard workflow.
 *
 * Features:
 * - General Info, Sector Profiles, Capital Allocation
 * - Fees & Expenses, Exit/Recycling, Waterfall, Scenarios
 * - Auto-save with resume capability
 * - Validation at each step
 */

import { ModelingWizard } from '@/components/modeling-wizard/ModelingWizard';

export default function ModelingWizardPage() {
  return <ModelingWizard />;
}
