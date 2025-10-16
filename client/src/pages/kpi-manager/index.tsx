import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { KpiDefinitionModal } from './KpiDefinitionModal';
import { KpiTabs } from './KpiTabs';
import { useKpiManager } from './useKpiManager';
import { useModalState } from './useModalState';
import { Plus, FileText, Settings } from 'lucide-react';

// Placeholder components for the other modals
const RequestBuilderModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
  isOpen ? (
    <div role="dialog" data-modal-type="requestBuilder" onClick={onClose}>
      Request Builder Modal
    </div>
  ) : null;
const SettingsModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
  isOpen ? (
    <div role="dialog" data-modal-type="settings" onClick={onClose}>
      Settings Modal
    </div>
  ) : null;

/**
 * KPIManager Page
 *
 * This component has been refactored to act as a high-level orchestrator,
 * integrating a type-safe modal management system.
 *
 * Responsibilities:
 * 1. Renders the main page layout and header.
 * 2. Invokes specialized hooks for state management (`useKpiManager`, `useModalState`).
 * 3. Delegates rendering of complex UI sections (modals, tabs) to specialized child components.
 *
 * This architecture separates concerns, enhances type safety, and improves performance
 * through memoization and lazy loading (via tab configuration).
 */
export default function KPIManager() {
  const {
    activeTab,
    setActiveTab,
    selectedKpi,
    // tabContent is no longer needed from the hook
  } = useKpiManager();

  const { modalState, openModal, closeModal } = useModalState();

  // The component is declarative and easy to read.
  // State logic is handled by dedicated hooks.
  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="KPI Manager"
        description="Define, build, and track Key Performance Indicators."
        // Example actions to open modals
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => openModal('definition')}>
              <Plus className="w-4 h-4 mr-2" />
              Define KPI
            </Button>
            <Button variant="outline" onClick={() => openModal('requestBuilder')}>
              <FileText className="w-4 h-4 mr-2" />
              Build Request
            </Button>
            <Button variant="outline" onClick={() => openModal('settings')}>
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Button>
          </div>
        }
      />

      <KpiTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        // No longer passing tabContent; the component handles it internally
      />

      <KpiDefinitionModal
        isOpen={modalState.definition}
        onClose={() => closeModal('definition')}
        kpi={selectedKpi}
        data-modal-type="definition"
      />

      <RequestBuilderModal
        isOpen={modalState.requestBuilder}
        onClose={() => closeModal('requestBuilder')}
      />

      <SettingsModal isOpen={modalState.settings} onClose={() => closeModal('settings')} />
    </div>
  );
}
