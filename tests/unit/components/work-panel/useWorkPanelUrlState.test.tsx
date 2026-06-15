import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSearch } from 'wouter';
import { createWouterWrapper } from '../../../utils/withWouter';
import { useWorkPanelUrlState } from '@/components/work-panel/useWorkPanelUrlState';

function Harness() {
  const { state, openPanel, closePanel, setTab } = useWorkPanelUrlState();
  const search = useSearch();
  return (
    <div>
      <div data-testid="state">{state ? JSON.stringify(state) : 'null'}</div>
      <div data-testid="search">{search}</div>
      <button onClick={() => openPanel({ panel: 'scenario', object: 's1', tab: 'proof' })}>
        open
      </button>
      <button onClick={() => setTab('detail')}>tab</button>
      <button onClick={() => closePanel()}>close</button>
    </div>
  );
}

describe('useWorkPanelUrlState', () => {
  it('starts closed when no panel param is present', () => {
    const { Wrapper } = createWouterWrapper('/dashboard?fundId=7');
    render(<Harness />, { wrapper: Wrapper });
    expect(screen.getByTestId('state').textContent).toBe('null');
  });

  it('opens via the URL and preserves existing params', async () => {
    const user = userEvent.setup();
    const { Wrapper } = createWouterWrapper('/dashboard?fundId=7');
    render(<Harness />, { wrapper: Wrapper });

    await user.click(screen.getByRole('button', { name: 'open' }));

    expect(JSON.parse(screen.getByTestId('state').textContent ?? 'null')).toEqual({
      panel: 'scenario',
      object: 's1',
      tab: 'proof',
    });
    const search = screen.getByTestId('search').textContent ?? '';
    const params = new URLSearchParams(search);
    expect(params.get('fundId')).toBe('7'); // preserved
    expect(params.get('panel')).toBe('scenario');
    expect(params.get('object')).toBe('s1');
    expect(params.get('panelTab')).toBe('proof');
  });

  it('updates only the tab param', async () => {
    const user = userEvent.setup();
    const { Wrapper } = createWouterWrapper('/dashboard?panel=scenario&object=s1&panelTab=proof');
    render(<Harness />, { wrapper: Wrapper });

    await user.click(screen.getByRole('button', { name: 'tab' }));

    expect(
      new URLSearchParams(screen.getByTestId('search').textContent ?? '').get('panelTab')
    ).toBe('detail');
    expect(JSON.parse(screen.getByTestId('state').textContent ?? 'null')).toMatchObject({
      panel: 'scenario',
      tab: 'detail',
    });
  });

  it('closes by removing only the panel params, restoring the rest', async () => {
    const user = userEvent.setup();
    const { Wrapper } = createWouterWrapper(
      '/dashboard?fundId=7&panel=scenario&object=s1&panelTab=proof'
    );
    render(<Harness />, { wrapper: Wrapper });

    expect(screen.getByTestId('state').textContent).not.toBe('null');

    await user.click(screen.getByRole('button', { name: 'close' }));

    expect(screen.getByTestId('state').textContent).toBe('null');
    const params = new URLSearchParams(screen.getByTestId('search').textContent ?? '');
    expect(params.get('fundId')).toBe('7'); // preserved
    expect(params.get('panel')).toBeNull();
    expect(params.get('object')).toBeNull();
    expect(params.get('panelTab')).toBeNull();
  });
});
