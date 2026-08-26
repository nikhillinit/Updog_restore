import FinancialModeling from '@/pages/financial-modeling';
import { useFundContext } from '@/contexts/FundContext';
import { extractRouteScopedFundId } from '@/lib/fund-routes';
import { Redirect, useLocation, useSearch } from 'wouter';

export default function Forecasting() {
  const { currentFund } = useFundContext();
  const [location] = useLocation();
  const search = useSearch();
  const routeFundId = extractRouteScopedFundId(location, search);

  if (currentFund?.id && routeFundId == null) {
    return <Redirect to={`/forecasting?fundId=${currentFund.id}`} />;
  }

  return <FinancialModeling />;
}
