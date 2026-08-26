/**
 * WorkPanel = context-preserving drill-down (side Sheet). State is URL-addressable
 * via ?panel=&object=&panelTab= so a panel is copyable/reloadable. `panel`
 * presence = open.
 */

export interface WorkPanelState {
  /** Panel kind/identity (e.g. 'scenario', 'company'). Presence = panel open. */
  panel: string;
  /** Optional operating-object id the panel is bound to. */
  object?: string;
  /** Optional active tab within the panel. */
  tab?: string;
}

/** URL param names (single source of truth for read + write). */
export const WORK_PANEL_PARAMS = {
  panel: 'panel',
  object: 'object',
  tab: 'panelTab',
} as const;
