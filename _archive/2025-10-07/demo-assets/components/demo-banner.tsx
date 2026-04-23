import React from 'react';
import { isStubMode } from '@/lib/env-detection';

export function DemoBanner() {
  const [showBanner, setShowBanner] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    isStubMode()
      .then(stubEnabled => {
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
      <div className="bg-gray-100 border-b border-gray-200 px-4 py-2 text-center">
        <span className="text-gray-600 text-sm">Loading...</span>
      </div>
    );
  }

  if (!showBanner) return null;

  return (
    <div className="bg-amber-100 border-b border-amber-200 px-4 py-2 text-center">
      <span className="text-amber-800 text-sm font-medium">
        🚀 Demo Mode Active - Synthetic Data
      </span>
    </div>
  );
}