/**
 * Source-linked narrative panel (PLAN_61 Task 19, Wave G).
 *
 * Renders the terminal narrative for a Task 18 anchor as ONE copyable block and
 * copies exactly that block: the visible text and the clipboard text both come from
 * `renderNarrativeCopyBlock`, so provenance travels with the content and the copy
 * can never drift from what is shown (defect D33). Generation, regeneration, and
 * append-only notes are the only affordances -- there is deliberately no recipient,
 * send, approval, or export control.
 *
 * @module client/components/fund-results/InternalNarrativePanel
 */
import { useState } from 'react';

import {
  type NarrativeAnchor,
  renderNarrativeCopyBlock,
} from '@shared/contracts/internal-analysis/internal-narrative-draft-v1.contract';
import { Button } from '@/components/ui/button';
import { useInternalNarratives } from '@/hooks/useInternalNarratives';

export interface InternalNarrativePanelProps {
  fundId: number;
  /** The Task 18 draft or reference this narrative hangs off; null hides the panel body. */
  anchor: NarrativeAnchor | null;
}

function InternalNarrativePanelContent({
  fundId,
  anchor,
}: {
  fundId: number;
  anchor: NarrativeAnchor;
}) {
  const {
    narrative,
    notes,
    isLoading,
    error,
    generate,
    isGenerating,
    appendNote,
    isAppendingNote,
    mutationError,
  } = useInternalNarratives(fundId, anchor);
  const [noteBody, setNoteBody] = useState('');

  // The single source of truth for BOTH the rendered block and the copied text.
  const copyBlock = narrative === null ? '' : renderNarrativeCopyBlock(narrative);

  return (
    <section
      aria-label="Working narrative"
      className="space-y-4 rounded-lg border border-beige-200 bg-white p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-pov-charcoal">Working narrative</h3>
        <Button
          type="button"
          size="sm"
          className="text-xs"
          disabled={isGenerating}
          onClick={() => generate()}
        >
          {narrative === null ? 'Generate' : 'Regenerate'}
        </Button>
      </div>

      {isLoading ? <p className="text-sm text-presson-textMuted">Loading narrative...</p> : null}

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-pov-charcoal"
        >
          {error.message}
        </p>
      ) : null}

      {mutationError ? (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-pov-charcoal"
        >
          {mutationError.message}
        </p>
      ) : null}

      {!isLoading && narrative === null && error === null ? (
        <p className="text-sm text-presson-textMuted">
          No narrative yet. Generate a source-linked draft from this analysis.
        </p>
      ) : null}

      {narrative !== null ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs uppercase text-presson-textMuted">
              Copyable narrative - revision{' '}
              <span className="tabular-nums">{narrative.revision}</span>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs text-pov-charcoal"
              aria-label="Copy the full source-linked narrative block, including its notice and basis line"
              onClick={() => {
                if (!navigator.clipboard) {
                  return;
                }
                void navigator.clipboard.writeText(copyBlock).catch(() => undefined);
              }}
            >
              Copy narrative
            </Button>
          </div>
          <pre
            data-testid="internal-narrative-copy-block"
            className="whitespace-pre-wrap rounded-md border border-beige-200 bg-white p-3 text-xs text-pov-charcoal"
          >
            {copyBlock}
          </pre>
        </div>
      ) : null}

      <div className="space-y-2 border-t border-beige-200 pt-3">
        <h4 className="text-xs font-semibold uppercase text-pov-charcoal">Notes</h4>
        {notes.length === 0 ? (
          <p className="text-sm text-presson-textMuted">No notes yet.</p>
        ) : (
          <ul className="space-y-1">
            {notes.map((note) => (
              <li
                key={note.noteId}
                data-testid={`internal-analysis-note-${note.noteId}`}
                className="text-sm text-pov-charcoal"
              >
                {note.body}
                {note.supersedesNoteId === null ? null : (
                  <span className="ml-2 text-xs text-presson-textMuted">
                    corrects note <span className="tabular-nums">{note.supersedesNoteId}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = noteBody.trim();
            if (trimmed === '') {
              return;
            }
            appendNote(trimmed);
            setNoteBody('');
          }}
        >
          <label htmlFor="internal-analysis-note-body" className="sr-only">
            Add an append-only note
          </label>
          <textarea
            id="internal-analysis-note-body"
            value={noteBody}
            onChange={(event) => setNoteBody(event.target.value)}
            rows={2}
            placeholder="Add an append-only note"
            className="rounded-md border border-beige-200 p-2 text-sm text-pov-charcoal"
          />
          <Button
            type="submit"
            size="sm"
            className="self-start text-xs"
            disabled={isAppendingNote || noteBody.trim() === ''}
          >
            Add note
          </Button>
        </form>
      </div>
    </section>
  );
}

export function InternalNarrativePanel({ fundId, anchor }: InternalNarrativePanelProps) {
  // Null-guard wrapper: the data hooks only run once an anchor is resolved.
  if (anchor === null) {
    return (
      <section
        aria-label="Working narrative"
        className="rounded-lg border border-beige-200 bg-white p-4"
      >
        <h3 className="text-sm font-semibold text-pov-charcoal">Working narrative</h3>
        <p className="mt-1 text-sm text-presson-textMuted">
          Open or save an analysis draft to attach a source-linked narrative.
        </p>
      </section>
    );
  }

  return <InternalNarrativePanelContent fundId={fundId} anchor={anchor} />;
}
