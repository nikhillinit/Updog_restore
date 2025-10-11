/**
 * Temporary ambient stubs for de-scoped wizard features.
 * Remove once wizard is re-enabled in MVP.
 */
declare module '@/features/wizard/*' {
  import React from 'react';
  const Stub: React.ComponentType<any>;
  export default Stub;
}

declare module './ProgressStepper' {
  import React from 'react';
  const ProgressStepper: React.ComponentType<any>;
  export default ProgressStepper;
}

declare module './WizardCard' {
  import React from 'react';
  const WizardCard: React.ComponentType<any>;
  export default WizardCard;
}
