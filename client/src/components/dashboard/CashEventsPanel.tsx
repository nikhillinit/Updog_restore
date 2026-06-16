import { useEffect, useState } from 'react';
import { WorkPanel } from '@/components/work-panel/WorkPanel';
import type { WorkPanelState } from '@/components/work-panel/work-panel-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useFlag } from '@/shared/useFlags';
import type { CashFlowEventResponse } from '@shared/contracts/lp-reporting/cash-flow-event.contract';
import {
  buildLpCapitalCallPatch,
  formFromEvent,
  isCashEventFormValid,
  useCashFlowEvents,
  useUpdateCashFlowEvent,
  type CashEventEditForm,
  type CashFlowEventMutationError,
} from '@/hooks/useCashFlowEvents';

const PANEL_KEY = 'cash-events';

function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

function conflictMessage(error: CashFlowEventMutationError): string {
  if (error.status === 412) {
    return 'This event changed since you opened it. The latest version is now shown — review and save again.';
  }
  if (error.status === 409) {
    return 'This event is no longer an editable draft. The latest version is now shown.';
  }
  return error.message || 'Failed to save changes.';
}

export function CashEventsPanel({
  fundId,
  state,
  onClose,
  onSelect,
  onBack,
}: {
  fundId: string | undefined;
  state: WorkPanelState | null;
  onClose: () => void;
  onSelect: (eventId: string) => void;
  onBack: () => void;
}) {
  const isOpen = state?.panel === PANEL_KEY;
  const objectId = isOpen ? (state?.object ?? null) : null;
  const editFlag = useFlag('enable_cash_event_edit');

  const query = useCashFlowEvents(fundId, { enabled: isOpen });
  const events = query.data;
  const mutation = useUpdateCashFlowEvent(fundId);

  const selectedEvent =
    objectId != null ? events?.find((event) => String(event.id) === objectId) : undefined;

  const [loadedEvent, setLoadedEvent] = useState<CashFlowEventResponse | null>(null);
  const [form, setForm] = useState<CashEventEditForm | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // F4: reset baseline + form when the row identity OR etag changes
  // (initial open, post-save refetch, 412/409 refetch). Unchanged etag => no reset.
  const editKey = selectedEvent ? `${selectedEvent.id}:${selectedEvent.etag}` : null;
  useEffect(() => {
    if (selectedEvent) {
      setLoadedEvent(selectedEvent);
      setForm(formFromEvent(selectedEvent));
    } else {
      setLoadedEvent(null);
      setForm(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editKey]);

  // Clear any stale conflict note when switching to a different row.
  useEffect(() => {
    setErrorMsg(null);
  }, [objectId]);

  const isEditable =
    editFlag &&
    selectedEvent != null &&
    selectedEvent.eventType === 'lp_capital_call' &&
    selectedEvent.status === 'draft' &&
    typeof selectedEvent.etag === 'string' &&
    selectedEvent.etag.length > 0;

  const patch = loadedEvent && form ? buildLpCapitalCallPatch(loadedEvent, form) : {};
  const isDirty = Object.keys(patch).length > 0;
  const canSave =
    isEditable && isDirty && form != null && isCashEventFormValid(form) && !mutation.isPending;
  const panelDescription =
    objectId == null ? 'Persisted capital-call events for this fund.' : undefined;

  const guardedLeave = (action: () => void) => {
    if (isDirty && !window.confirm('Discard unsaved changes?')) {
      return;
    }
    action();
  };

  const setField = (key: keyof CashEventEditForm, value: string) => {
    setErrorMsg(null);
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleSave = () => {
    if (!selectedEvent || !loadedEvent || !form || !canSave) return;
    mutation.mutate(
      { eventId: selectedEvent.id, etag: loadedEvent.etag, patch },
      {
        onSuccess: (updated) => {
          setLoadedEvent(updated);
          setForm(formFromEvent(updated));
          setErrorMsg(null);
        },
        onError: (error) => {
          setErrorMsg(conflictMessage(error));
          if (error.status === 412 || error.status === 409) {
            void query.refetch();
          }
        },
      }
    );
  };

  const handleCancel = () => {
    if (loadedEvent) {
      setForm(formFromEvent(loadedEvent));
    }
    setErrorMsg(null);
  };

  return (
    <WorkPanel
      open={isOpen}
      onClose={() => guardedLeave(onClose)}
      title="Cash events"
      {...(panelDescription ? { description: panelDescription } : {})}
    >
      {query.isLoading ? (
        <p className="text-sm text-charcoal-600">Loading cash events...</p>
      ) : objectId == null ? (
        !events || events.length === 0 ? (
          <p className="text-sm text-charcoal-600">No cash events recorded for this fund yet.</p>
        ) : (
          <ul className="space-y-3">
            {events.map((event) => (
              <li key={event.id}>
                <button
                  type="button"
                  onClick={() => guardedLeave(() => onSelect(String(event.id)))}
                  className="flex w-full items-center justify-between gap-4 rounded-md px-2 py-2 text-left hover:bg-beige-100"
                >
                  <span>
                    <span className="block text-sm font-medium text-charcoal-900">
                      {event.eventType}
                    </span>
                    <span className="block text-xs text-charcoal-600">
                      {formatEventDate(event.eventDate)}
                    </span>
                  </span>
                  <span className="text-sm font-medium text-charcoal-900">{event.amount}</span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : !selectedEvent ? (
        <div className="space-y-4">
          <p className="text-sm text-charcoal-600">This cash event was not found.</p>
          <Button variant="outline" size="sm" onClick={() => guardedLeave(onBack)}>
            Back to list
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          <Button variant="ghost" size="sm" onClick={() => guardedLeave(onBack)}>
            Back to list
          </Button>

          {errorMsg ? (
            <p role="alert" className="text-sm text-error-dark">
              {errorMsg}
            </p>
          ) : null}

          {isEditable && form ? (
            <form
              className="space-y-4"
              onSubmit={(submitEvent) => {
                submitEvent.preventDefault();
                handleSave();
              }}
            >
              <div className="space-y-1">
                <Label htmlFor="cash-event-amount">Amount</Label>
                <Input
                  id="cash-event-amount"
                  type="text"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(changeEvent) => setField('amount', changeEvent.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cash-event-date">Event date</Label>
                <Input
                  id="cash-event-date"
                  type="date"
                  value={form.eventDate}
                  onChange={(changeEvent) => setField('eventDate', changeEvent.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cash-event-description">Description</Label>
                <Textarea
                  id="cash-event-description"
                  value={form.description}
                  onChange={(changeEvent) => setField('description', changeEvent.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cash-event-call-number">Call number</Label>
                <Input
                  id="cash-event-call-number"
                  type="text"
                  inputMode="numeric"
                  value={form.callNumber}
                  onChange={(changeEvent) => setField('callNumber', changeEvent.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cash-event-due-date">Due date</Label>
                <Input
                  id="cash-event-due-date"
                  type="date"
                  value={form.dueDate}
                  onChange={(changeEvent) => setField('dueDate', changeEvent.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cash-event-purpose">Purpose</Label>
                <Textarea
                  id="cash-event-purpose"
                  value={form.purpose}
                  onChange={(changeEvent) => setField('purpose', changeEvent.target.value)}
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-beige-200 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCancel}
                  disabled={!isDirty || mutation.isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={!canSave}>
                  {mutation.isPending ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </form>
          ) : (
            <dl className="space-y-3 text-sm">
              <ReadOnlyRow label="Type" value={selectedEvent.eventType} />
              <ReadOnlyRow label="Status" value={selectedEvent.status} />
              <ReadOnlyRow label="Amount" value={selectedEvent.amount} />
              <ReadOnlyRow label="Event date" value={formatEventDate(selectedEvent.eventDate)} />
              <ReadOnlyRow label="Description" value={selectedEvent.description ?? '—'} />
            </dl>
          )}
        </div>
      )}
    </WorkPanel>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-charcoal-600">{label}</dt>
      <dd className="font-medium text-charcoal-900">{value}</dd>
    </div>
  );
}
