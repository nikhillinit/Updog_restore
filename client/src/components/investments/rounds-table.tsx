import type { CSSProperties } from 'react';
import type { InvestmentRoundResponse } from '@shared/contracts/investments/investment-round.contract';
import { Btn, ChartCard, Tag } from '@/components/presson-v2/primitives';
import { formatRoundDate, formatRoundMoney } from '@/lib/investment-round-format';

const SECURITY_LABEL: Record<string, string> = {
  equity: 'Equity',
  convertible_note: 'Convertible Note',
  safe: 'SAFE',
  warrant: 'Warrant',
  other: 'Other',
};

const thStyle: CSSProperties = {
  textAlign: 'left',
  fontFamily: 'var(--pv2-font-mono)',
  fontSize: 10,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--pv2-mute)',
  padding: '6px 8px',
  borderBottom: '1px solid var(--pv2-rule, #E0D8D1)',
};
const tdStyle: CSSProperties = { padding: '8px', fontSize: 13, color: 'var(--pv2-ink)' };
const numStyle: CSSProperties = { ...tdStyle, fontVariantNumeric: 'tabular-nums' };

interface RoundsTableProps {
  rounds: InvestmentRoundResponse[];
  onAdd: () => void;
  onSupersede: (round: InvestmentRoundResponse) => void;
}

export function RoundsTable({ rounds, onAdd, onSupersede }: RoundsTableProps) {
  return (
    <ChartCard title="Investment rounds" meta={<Btn primary onClick={onAdd}>Add round</Btn>}>
      {rounds.length === 0 ? (
        <div className="pv2-rounds-empty">No rounds recorded yet.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Round', 'Security', 'Date', 'Investment', 'Round size', 'Pre-money', ''].map((h, i) => (
                <th key={h || `actions-${i}`} style={thStyle}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rounds.map((r) => (
              <tr key={r.id} data-testid="round-row">
                <td style={tdStyle}>
                  {r.roundName} {r.supersedesRoundId != null && <Tag>corrected</Tag>}
                </td>
                <td style={tdStyle}>
                  <Tag>{SECURITY_LABEL[r.securityType] ?? r.securityType}</Tag>
                </td>
                <td style={numStyle}>{formatRoundDate(r.roundDate)}</td>
                <td style={numStyle}>{formatRoundMoney(r.investmentAmount, r.currency)}</td>
                <td style={numStyle}>{formatRoundMoney(r.roundSize, r.currency)}</td>
                <td style={numStyle}>{formatRoundMoney(r.preMoneyValuation, r.currency)}</td>
                <td style={tdStyle}>
                  <Btn onClick={() => onSupersede(r)}>Correct</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ChartCard>
  );
}
