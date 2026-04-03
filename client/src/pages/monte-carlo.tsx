import { BacktestingWorkspace } from '@/components/backtesting/BacktestingWorkspace';
import { useFundContext } from '@/contexts/FundContext';

export default function MonteCarloPage() {
  const { fundId } = useFundContext();

  return <BacktestingWorkspace fundId={fundId} />;
}
