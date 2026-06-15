/**
 * Context rail (dashboard fourth zone) contracts.
 * Shell-stage: enumerates all item kinds for future use; only `freshness`
 * is populated today (no operating-object backend yet - see PR 0-S audit).
 */

export type ContextRailItemKind =
  | 'freshness'
  | 'due'
  | 'blocker'
  | 'owner'
  | 'artifact'
  | 'activity';

/** Lets a rail item deep-link to an operating object (WorkPanel, PR 7+). */
export interface ContextRailObjectLink {
  objectType: string;
  objectId: string;
}

export interface ContextRailItem {
  id: string;
  kind: ContextRailItemKind;
  label: string;
  detail?: string;
  objectLink?: ContextRailObjectLink;
}

export interface ContextRailSection {
  id: string;
  title: string;
  items: ContextRailItem[];
  /** Shown when `items` is empty - never leave a section blank. */
  emptyText: string;
}
