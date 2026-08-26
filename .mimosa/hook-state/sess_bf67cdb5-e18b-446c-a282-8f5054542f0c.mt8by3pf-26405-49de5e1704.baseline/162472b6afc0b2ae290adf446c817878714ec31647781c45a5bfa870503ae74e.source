import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';

const COMMANDS = [
  {
    group: 'Scenarios',
    items: [
      { label: 'Model AlphaTech at 8× exit', to: '/v2/scenarios', kbd: '↵' },
      { label: 'Run sensitivity on AlphaTech reserves', to: '/v2/scenarios', kbd: '⌥↵' },
      { label: 'Compare bull / base / bear', to: '/v2/exits', kbd: '⇧↵' },
    ],
  },
  {
    group: 'Navigate',
    items: [
      { label: 'Today — Dashboard', to: '/v2/today', kbd: 'G T' },
      { label: 'Portfolio', to: '/v2/portfolio', kbd: 'G P' },
      { label: 'DigitalWave — Company file', to: '/v2/companies/digitalwave', kbd: 'G C' },
      { label: 'AlphaTech — Company file', to: '/v2/companies/alphatech', kbd: 'G A' },
    ],
  },
];

interface CommandPaletteProps {
  onClose: () => void;
}

export function CommandPalette({ onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [, navigate] = useLocation();

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = COMMANDS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !query || i.label.toLowerCase().includes(query.toLowerCase())),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="pv2-cmdk-overlay" onClick={onClose}>
      <div className="pv2-cmdk-panel" onClick={(e) => e.stopPropagation()}>
        <div className="pv2-cmdk-input">
          <span className="pv2-cmdk-prompt">›</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to… or type a command"
          />
          <span
            style={{
              color: 'var(--pv2-mute)',
              fontFamily: 'var(--pv2-font-mono)',
              fontSize: 11,
            }}
          >
            ⌘K
          </span>
        </div>
        {filtered.map((g) => (
          <div key={g.group} className="pv2-cmdk-grp">
            <div className="pv2-cmdk-grp-ttl">{g.group}</div>
            {g.items.map((item) => (
              <div
                key={item.label}
                className="pv2-cmdk-item"
                onClick={() => {
                  navigate(item.to);
                  onClose();
                }}
              >
                <span>{item.label}</span>
                <span className="pv2-cmdk-kbd">{item.kbd}</span>
              </div>
            ))}
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: '20px 18px', fontSize: 13, color: 'var(--pv2-mute)' }}>
            No matches. Press <span className="pv2-cmdk-kbd">esc</span> to close.
          </div>
        )}
      </div>
    </div>
  );
}
