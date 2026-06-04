import { useLocation } from 'wouter';

type NavItem = {
  label: string;
  to: string;
  kbd?: string;
  badge?: string;
};

type NavSection = { group: string; items: NavItem[] };

const NAV: NavSection[] = [
  {
    group: 'Center',
    items: [
      { label: 'Today', to: '/v2/today', badge: '4' },
      { label: 'Portfolio', to: '/v2/portfolio', kbd: 'P' },
      { label: 'Companies', to: '/v2/companies/digitalwave', kbd: 'C' },
      { label: 'Partners', to: '/v2/partners', kbd: 'L' },
    ],
  },
  {
    group: 'Model',
    items: [
      { label: 'Forecast', to: '/v2/forecast', kbd: 'F' },
      { label: 'Reserves', to: '/v2/reserves', kbd: 'R' },
      { label: 'Scenarios', to: '/v2/scenarios', kbd: 'S' },
      { label: 'Exits', to: '/v2/exits', kbd: 'X' },
    ],
  },
  {
    group: 'Operate',
    items: [
      { label: 'Cash', to: '/v2/cash', kbd: '$' },
      { label: 'Insights', to: '/v2/insights', kbd: 'I' },
    ],
  },
];

interface SidebarProps {
  onCmdK: () => void;
}

export function Sidebar({ onCmdK }: SidebarProps) {
  const [location, navigate] = useLocation();

  const isActive = (to: string) => {
    if (to === '/v2/today') return location === '/v2/today' || location === '/v2';
    return location.startsWith(to);
  };

  return (
    <aside className="pv2-side">
      <div className="pv2-side-brand">
        <span className="pv2-side-brand-mark" />
        UPDOG
      </div>
      <div className="pv2-side-entity">
        <div>
          <div className="pv2-side-entity-name">Krakatoa Ventures</div>
          <div className="pv2-side-entity-vintage">FUND II · 2021</div>
        </div>
        <span className="pv2-mono" style={{ color: 'var(--pv2-mute)' }}>
          ⇅
        </span>
      </div>
      <button type="button" className="pv2-side-cmd" onClick={onCmdK}>
        <span>Jump to&hellip;</span>
        <span>⌘K</span>
      </button>

      {NAV.map((section) => (
        <div key={section.group}>
          <div className="pv2-side-group">{section.group}</div>
          {section.items.map((item) => (
            <button
              key={item.to}
              type="button"
              className={`pv2-side-link${isActive(item.to) ? ' active' : ''}`}
              onClick={() => navigate(item.to)}
            >
              <span>{item.label}</span>
              {item.badge ? (
                <span className="pv2-side-link-badge">{item.badge}</span>
              ) : item.kbd ? (
                <span className="pv2-side-link-kbd">{item.kbd}</span>
              ) : null}
            </button>
          ))}
        </div>
      ))}
    </aside>
  );
}
