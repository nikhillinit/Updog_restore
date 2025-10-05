import { useState, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useFeatureFlags } from '@/providers/FeatureFlagProvider';

/**
 * Staging environment indicator ribbon
 * - Shows at the top of the page in staging environments
 * - Can be dismissed for the current session
 * - Persists dismissal state in sessionStorage
 */
export function StagingRibbon() {
  const flags = useFeatureFlags();
  const [isDismissed, setIsDismissed] = useState(false);

  // Check if ribbon was previously dismissed in this session
  useEffect(() => {
    const dismissed = sessionStorage.getItem('staging-ribbon-dismissed');
    if (dismissed === 'true') {
      setIsDismissed(true);
    }
  }, []);

  // Don't show in production or development, or if dismissed
  if (!flags.isStaging || isDismissed) {
    return null;
  }

  const handleDismiss = () => {
    setIsDismissed(true);
    sessionStorage.setItem('staging-ribbon-dismissed', 'true');
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-center gap-3 shadow-md">
      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
      <span className="text-sm font-medium">
        STAGING ENVIRONMENT - For testing purposes only
      </span>
      <button
        onClick={handleDismiss}
        className="ml-auto p-1 hover:bg-amber-600/20 rounded-md transition-colors"
        aria-label="Dismiss staging banner"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
