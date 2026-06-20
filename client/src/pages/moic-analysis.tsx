import { useMemo, useState } from 'react';
import { useSearch } from 'wouter';
import { AlertTriangle, Award, Info, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFundMoicRankings } from '@/hooks/use-moic';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { FundMoicRankingItemV1 } from '@shared/contracts/fund-moic-v1.contract';

type FundIdParseResult =
  | { status: 'missing'; fundId: null }
  | { status: 'invalid'; fundId: null }
  | { status: 'valid'; fundId: number };

function parseFundId(search: string): FundIdParseResult {
  const rawValue = new URLSearchParams(search).get('fundId');

  if (rawValue === null) {
    return { status: 'missing', fundId: null };
  }

  const trimmed = rawValue.trim();
  const parsed = Number(trimmed);

  if (!/^\d+$/.test(trimmed) || !Number.isSafeInteger(parsed) || parsed <= 0) {
    return { status: 'invalid', fundId: null };
  }

  return { status: 'valid', fundId: parsed };
}

function formatMoicValue(value: number | null): string {
  return value === null ? 'Unavailable' : `${value.toFixed(2)}x`;
}

function getMoicTone(value: number | null): string {
  if (value === null) return 'text-charcoal-500';
  if (value >= 2) return 'text-presson-positive';
  if (value >= 1) return 'text-presson-warning';
  return 'text-presson-negative';
}

function StateCard({
  title,
  description,
  icon = 'warning',
}: {
  title: string;
  description: string;
  icon?: 'loading' | 'info' | 'warning';
}) {
  const Icon = icon === 'loading' ? Loader2 : icon === 'info' ? Info : AlertTriangle;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-pov-charcoal">
          <Icon className={`h-5 w-5 ${icon === 'loading' ? 'animate-spin' : ''}`} />
          <span>{title}</span>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function RankingRow({ item }: { item: FundMoicRankingItemV1 }) {
  return (
    <li className="grid grid-cols-[4rem_minmax(0,1fr)_8rem] items-center gap-3 rounded-md border border-beige-200 px-3 py-2 text-sm">
      <span className="font-semibold text-charcoal-600">#{item.rank}</span>
      <span className="min-w-0">
        <span className="block truncate font-medium text-pov-charcoal">{item.investmentName}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {item.reservesMoic.description}
        </span>
      </span>
      <span className={`text-right font-bold tabular-nums ${getMoicTone(item.reservesMoic.value)}`}>
        {formatMoicValue(item.reservesMoic.value)}
      </span>
    </li>
  );
}

export default function MOICAnalysisPage() {
  const search = useSearch();
  const fundIdResult = parseFundId(search);
  const { data, error, isLoading } = useFundMoicRankings(fundIdResult.fundId);
  const [selectedInvestmentId, setSelectedInvestmentId] = useState('all');

  const displayedRankings = useMemo(() => {
    const rankings = data?.rankings ?? [];

    if (selectedInvestmentId === 'all') {
      return rankings;
    }

    return rankings.filter((item) => item.investmentId === selectedInvestmentId);
  }, [data?.rankings, selectedInvestmentId]);

  const topRanking = data?.rankings[0] ?? null;
  const queryError = error;
  const hasParsedLiveResponse = fundIdResult.status === 'valid' && !queryError && data;

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Reserves MOIC Rankings</h1>
          <p className="text-muted-foreground">
            Live planned-reserves rankings from portfolio company records.
          </p>
        </div>

        {hasParsedLiveResponse && data.rankings.length > 0 ? (
          <Select value={selectedInvestmentId} onValueChange={setSelectedInvestmentId}>
            <SelectTrigger className="w-full md:w-[240px]" aria-label="Filter live rankings">
              <SelectValue placeholder="Filter rankings" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All live rankings</SelectItem>
              {data.rankings.map((item) => (
                <SelectItem key={item.investmentId} value={item.investmentId}>
                  {item.investmentName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      {fundIdResult.status === 'missing' ? (
        <StateCard
          title="Fund ID required"
          description="Live MOIC rankings are unavailable because the page was opened without a fund ID."
          icon="info"
        />
      ) : null}

      {fundIdResult.status === 'invalid' ? (
        <StateCard
          title="Invalid fund ID"
          description="Live MOIC rankings are unavailable because the fund ID is not a positive integer."
        />
      ) : null}

      {fundIdResult.status === 'valid' && isLoading ? (
        <StateCard
          title="Loading live MOIC rankings"
          description="Fetching the fund-scoped reserves MOIC rankings from the primary endpoint."
          icon="loading"
        />
      ) : null}

      {fundIdResult.status === 'valid' && queryError ? (
        <StateCard
          title={
            queryError.code === 'CONTRACT_PARSE_ERROR'
              ? 'Live MOIC contract mismatch'
              : 'Unable to load live MOIC rankings'
          }
          description={
            queryError.code === 'CONTRACT_PARSE_ERROR'
              ? 'The live response did not match the required provenance contract, so rankings are not shown.'
              : 'The live rankings endpoint returned a load error, so rankings are not shown.'
          }
        />
      ) : null}

      {hasParsedLiveResponse && data.rankings.length === 0 ? (
        <StateCard
          title="No live rankings available"
          description="The live rankings endpoint returned zero reserves MOIC ranking rows for this fund."
          icon="info"
        />
      ) : null}

      {hasParsedLiveResponse && data.rankings.length > 0 ? (
        <>
          <Card className="border-presson-info/20 bg-presson-info/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-presson-info">
                <Info className="h-5 w-5" />
                <span>Live Provenance</span>
              </CardTitle>
              <CardDescription>
                Parsed from the shared fund MOIC rankings contract.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground">Source</dt>
                  <dd className="font-medium text-pov-charcoal">{data.provenance.source}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Calculation</dt>
                  <dd className="font-medium text-pov-charcoal">{data.provenance.calculation}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Metric basis</dt>
                  <dd className="font-medium text-pov-charcoal">{data.provenance.metricBasis}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Source records</dt>
                  <dd className="font-medium text-pov-charcoal">
                    {data.provenance.sourceRecordCount.toLocaleString()}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5" />
                <span>Planned-Reserves MOIC Ranking</span>
              </CardTitle>
              <CardDescription>
                Companies ranked by the live reserves MOIC calculation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2">
                {displayedRankings.map((item) => (
                  <RankingRow key={item.investmentId} item={item} />
                ))}
              </ol>
            </CardContent>
          </Card>

          {topRanking ? (
            <Card>
              <CardHeader>
                <CardTitle>Top Planned-Reserves MOIC</CardTitle>
                <CardDescription>
                  Highest live reserves MOIC ranking for this fund response.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-1 rounded-md bg-pov-gray p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-pov-charcoal">{topRanking.investmentName}</p>
                    <p className="text-sm text-muted-foreground">{topRanking.reservesMoic.formula}</p>
                  </div>
                  <p
                    className={`text-2xl font-bold tabular-nums ${getMoicTone(
                      topRanking.reservesMoic.value
                    )}`}
                  >
                    {formatMoicValue(topRanking.reservesMoic.value)}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
