import { useState } from 'react';

type KPI = {
  id: string;
  name: string;
  type: 'quantitative' | 'qualitative';
  frequency: 'monthly' | 'quarterly' | 'semi-annual' | 'annual';
  startDate: string;
  term: number;
  termUnit: 'quarters' | 'months' | 'years';
  numberFormat: string;
  askToUploadDocuments: boolean;
  showFullProjectionPeriod: boolean;
  hidePastHistoricals: boolean;
  description?: string;
};

export type TabId = 'overview' | 'analytics' | 'settings';

/**
 * useKpiManager Hook
 *
 * Centralized state management for the KPI Manager.
 * Handles tab navigation and KPI selection.
 */
export function useKpiManager() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [selectedKpi, setSelectedKpi] = useState<Partial<KPI> | null>(null);

  return {
    activeTab,
    setActiveTab,
    selectedKpi,
    setSelectedKpi,
  };
}
