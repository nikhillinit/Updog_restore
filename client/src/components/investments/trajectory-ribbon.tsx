import type { InvestmentRoundResponse } from '@shared/contracts/investments/investment-round.contract';
import { presson } from '@/theme/presson.tokens';
import { formatRoundDate, formatRoundMoney } from '@/lib/investment-round-format';

const WIDTH = 1180;
const PAD = 80;
const Y = 120;

export function TrajectoryRibbon({ rounds }: { rounds: InvestmentRoundResponse[] }) {
  if (rounds.length === 0) return null;

  const sorted = [...rounds].sort((a, b) => a.roundDate.localeCompare(b.roundDate));
  const times = sorted.map((r) => Date.parse(`${r.roundDate}T00:00:00Z`));
  const min = Math.min(...times);
  const max = Math.max(...times);
  const span = max - min;
  const inner = WIDTH - PAD * 2;

  const xFor = (i: number): number => {
    if (sorted.length === 1) return PAD + inner / 2;
    if (span === 0) return PAD + (i * inner) / (sorted.length - 1);
    return PAD + ((times[i]! - min) / span) * inner;
  };

  return (
    <svg
      viewBox={`0 0 ${WIDTH} 200`}
      role="img"
      aria-label="Capital trajectory"
      style={{ width: '100%', height: 200 }}
    >
      <line x1={PAD} y1={Y} x2={WIDTH - PAD} y2={Y} stroke={presson.color.highlight} strokeWidth={2} />
      {sorted.map((r, i) => {
        const x = xFor(i);
        return (
          <g
            key={r.id}
            data-testid="ribbon-node"
            fontFamily="JetBrains Mono"
            fontSize={10}
            fill={presson.color.textMuted}
          >
            <circle cx={x} cy={Y} r={7} fill={presson.color.text} />
            <text
              x={x}
              y={Y - 16}
              textAnchor="middle"
              fill={presson.color.text}
              fontFamily="Inter"
              fontSize={12}
              fontWeight={600}
            >
              {formatRoundMoney(r.investmentAmount, r.currency)}
            </text>
            <text x={x} y={Y + 24} textAnchor="middle" fill={presson.color.text} fontWeight={600}>
              {r.roundName}
            </text>
            <text x={x} y={Y + 38} textAnchor="middle">
              {formatRoundDate(r.roundDate)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
