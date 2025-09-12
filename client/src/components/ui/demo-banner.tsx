import React from 'react';

export function DemoBanner() {
  // Only show in demo mode
  if (import.meta.env.PROD && !import.meta.env['VITE_STUB_MODE']) return null;
  
  return (
    <div className="bg-amber-100 border-b border-amber-200 px-4 py-2 text-center">
      <span className="text-amber-800 text-sm font-medium">
        🚀 Demo Mode Active - Synthetic Data
      </span>
    </div>
  );
}