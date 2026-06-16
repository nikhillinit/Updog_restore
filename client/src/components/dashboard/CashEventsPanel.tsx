import { WorkPanel } from '@/components/work-panel/WorkPanel';
import type { WorkPanelState } from '@/components/work-panel/work-panel-types';
import { useCashFlowEvents } from '@/hooks/useCashFlowEvents';

const PANEL_KEY = 'cash-events';

function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export function CashEventsPanel({
  fundId,
  state,
  onClose,
}: {
  fundId: string | undefined;
  state: WorkPanelState | null;
  onClose: () => void;
}) {
  const isOpen = state?.panel === PANEL_KEY;
  const { data: events, isLoading } = useCashFlowEvents(fundId, { enabled: isOpen });

  return (
    <WorkPanel
      open={isOpen}
      onClose={onClose}
      title="Cash events"
      description="Persisted capital-call events for this fund (read-only)."
    >
      {isLoading ? (
        <p className="text-sm text-charcoal-600">Loading cash events...</p>
      ) : !events || events.length === 0 ? (
        <p className="text-sm text-charcoal-600">No cash events recorded for this fund yet.</p>
      ) : (
        <ul className="space-y-3">
          {events.map((event) => (
            <li key={event.id} className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-charcoal-900">{event.eventType}</p>
                <p className="text-xs text-charcoal-600">{formatEventDate(event.eventDate)}</p>
              </div>
              <span className="text-sm font-medium text-charcoal-900">{event.amount}</span>
            </li>
          ))}
        </ul>
      )}
    </WorkPanel>
  );
}
