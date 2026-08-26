import { useCallback } from 'react';
import { useLocation, useSearch } from 'wouter';
import { WORK_PANEL_PARAMS, type WorkPanelState } from './work-panel-types';

export interface UseWorkPanelUrlState {
  /** Current panel state, or null when no panel param is present. */
  state: WorkPanelState | null;
  /** Open/replace the panel; preserves all non-panel query params. */
  openPanel: (next: WorkPanelState) => void;
  /** Close the panel; removes ONLY the panel params, restores the rest. */
  closePanel: () => void;
  /** Change the active tab without otherwise touching the URL. */
  setTab: (tab: string) => void;
}

export function useWorkPanelUrlState(): UseWorkPanelUrlState {
  const [location, setLocation] = useLocation();
  const search = useSearch();

  const params = new URLSearchParams(search);
  const panel = params.get(WORK_PANEL_PARAMS.panel);
  const object = params.get(WORK_PANEL_PARAMS.object);
  const tab = params.get(WORK_PANEL_PARAMS.tab);

  const state: WorkPanelState | null = panel
    ? { panel, ...(object ? { object } : {}), ...(tab ? { tab } : {}) }
    : null;

  const navigateWith = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(search);
      mutate(next);
      const nextSearch = next.toString();
      setLocation(nextSearch ? `${location}?${nextSearch}` : location);
    },
    [location, search, setLocation]
  );

  const openPanel = useCallback(
    (next: WorkPanelState) => {
      navigateWith((p) => {
        p.set(WORK_PANEL_PARAMS.panel, next.panel);
        if (next.object) p.set(WORK_PANEL_PARAMS.object, next.object);
        else p.delete(WORK_PANEL_PARAMS.object);
        if (next.tab) p.set(WORK_PANEL_PARAMS.tab, next.tab);
        else p.delete(WORK_PANEL_PARAMS.tab);
      });
    },
    [navigateWith]
  );

  const closePanel = useCallback(() => {
    navigateWith((p) => {
      p.delete(WORK_PANEL_PARAMS.panel);
      p.delete(WORK_PANEL_PARAMS.object);
      p.delete(WORK_PANEL_PARAMS.tab);
    });
  }, [navigateWith]);

  const setTab = useCallback(
    (nextTab: string) => {
      navigateWith((p) => {
        if (nextTab) p.set(WORK_PANEL_PARAMS.tab, nextTab);
        else p.delete(WORK_PANEL_PARAMS.tab);
      });
    },
    [navigateWith]
  );

  return { state, openPanel, closePanel, setTab };
}
