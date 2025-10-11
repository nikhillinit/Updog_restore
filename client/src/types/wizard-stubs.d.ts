/**
 * Temporary ambient stubs for de-scoped features.
 * Remove once features are re-enabled in MVP.
 */
declare module '@/features/wizard/*' {
  import React from 'react';
  const Stub: React.ComponentType<any>;
  export default Stub;
}

declare module '@/features/scenario/*' {
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

declare module './api' {
  const api: any;
  export default api;
}

declare module '../../context/enhanced-fund-context-provider' {
  const provider: any;
  export default provider;
}
