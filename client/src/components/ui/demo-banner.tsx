import React from 'react';
import { isStubMode } from '@/lib/env-detection';

export function DemoBanner() {
  const [showBanner, setShowBanner] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    isStubMode()
      .then((stubEnabled) => {
        setShowBanner(stubEnabled);
        setLoading(false);
      })
      .catch(() => {
        setShowBanner(false);
        setLoading(false);
      });
  }, []);

  // Simple loading state for MVP
  if (loading) {
    return (
      <div className="bg-pov-gray border-b border-beige-200 px-4 py-2 text-center">
        <span className="text-charcoal-600 text-sm">Loading...</span>
      </div>
    );
  }

  if (!showBanner) return null;

  return (
    <div className="bg-warning/10 border-b border-warning/50 px-4 py-2 text-center">
      <span className="text-warning-dark text-sm font-medium">
        Demo Mode Active - Synthetic Data
      </span>
    </div>
  );
}
