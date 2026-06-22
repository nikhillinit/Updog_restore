import { useState } from 'react';
import type { InvestmentRoundResponse } from '@shared/contracts/investments/investment-round.contract';
import { ChartCard } from '@/components/presson-v2/primitives';
import { useCompanyInvestments } from '@/hooks/useCompanyInvestments';
import { useInvestmentRounds } from '@/hooks/useInvestmentRounds';
import { formatRoundMoney } from '@/lib/investment-round-format';
import { RoundsTable } from './rounds-table';
import { TrajectoryRibbon } from './trajectory-ribbon';
import NewRoundDialog from './new-round-dialog';

interface SupersedeTarget {
  id: number;
  roundName: string;
  roundDate: string;
}

interface InvestmentRoundsSectionProps {
  fundId: number;
  companyId: number;
  companyName?: string;
}

export function InvestmentRoundsSection({
  fundId,
  companyId,
  companyName,
}: InvestmentRoundsSectionProps) {
  const { investments, isLoading } = useCompanyInvestments(fundId, companyId);
  const [picked, setPicked] = useState<number | undefined>(undefined);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [supersedeTarget, setSupersedeTarget] = useState<SupersedeTarget | null>(null);

  const selectedInvestmentId =
    picked ?? (investments.length === 1 ? investments[0]!.id : undefined);
  const { rounds } = useInvestmentRounds(selectedInvestmentId);

  if (isLoading) {
    return <div className="pv2-rounds-empty">Loading rounds…</div>;
  }

  if (investments.length === 0) {
    return (
      <ChartCard title="Investment rounds">
        <div className="pv2-rounds-empty">
          No investment is recorded for this company yet, so there is nothing to attach a round to.
        </div>
      </ChartCard>
    );
  }

  const openAdd = () => {
    setSupersedeTarget(null);
    setDialogOpen(true);
  };
  const openSupersede = (r: InvestmentRoundResponse) => {
    setSupersedeTarget({ id: r.id, roundName: r.roundName, roundDate: r.roundDate });
    setDialogOpen(true);
  };

  return (
    <section data-testid="investment-rounds-section">
      {investments.length > 1 && (
        <div className="pv2-field">
          <label className="pv2-label" htmlFor="round-investment">
            Investment
          </label>
          <select
            id="round-investment"
            className="pv2-select"
            value={selectedInvestmentId ?? ''}
            onChange={(e) => setPicked(Number(e.target.value))}
          >
            <option value="" disabled>
              Select an investment…
            </option>
            {investments.map((inv) => (
              <option key={inv.id} value={inv.id}>
                {inv.round} · {formatRoundMoney(inv.amount, 'USD')} · #{inv.id}
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedInvestmentId == null ? (
        <ChartCard title="Investment rounds">
          <div className="pv2-rounds-empty">Select an investment to view its rounds.</div>
        </ChartCard>
      ) : (
        <>
          <TrajectoryRibbon rounds={rounds} />
          <RoundsTable rounds={rounds} onAdd={openAdd} onSupersede={openSupersede} />
          <NewRoundDialog
            isOpen={dialogOpen}
            onOpenChange={setDialogOpen}
            investmentId={selectedInvestmentId}
            fundId={fundId}
            companyName={companyName}
            supersedesRound={supersedeTarget}
          />
        </>
      )}
    </section>
  );
}
