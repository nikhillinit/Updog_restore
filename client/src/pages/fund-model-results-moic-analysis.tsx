import { AlertTriangle, Info, Loader2 } from 'lucide-react';
import { useRoute } from 'wouter';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useFundMoicRankingsV2 } from '@/hooks/use-moic';
import type { FundMoicRankingsResponseV2 } from '@shared/contracts/fund-moic-v2.contract';

type FundIdParseResult =
  | { status: 'missing'; fundId: null }
  | { status: 'invalid'; fundId: null }
  | { status: 'valid'; fundId: number };

type FundMoicRankingV2 = FundMoicRankingsResponseV2['rankings'][number];

function parseFundIdParam(rawValue: string | undefined): FundIdParseResult {
  if (rawValue === undefined) {
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

function ProvenanceStrip({ data }: { data: FundMoicRankingsResponseV2 }) {
  const warningCodes = data.roundEvidenceSummary.warningCodes;

  return (
    <Card className="border-presson-info/20 bg-presson-info/10">
      <CardContent className="grid gap-3 p-4 text-sm md:grid-cols-3">
        <div>
          <p className="text-muted-foreground">Materiality</p>
          <p className="font-medium text-pov-charcoal">{data.materiality.status}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Provenance</p>
          <p className="font-medium text-pov-charcoal">{data.provenance.mode}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Warning codes</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {warningCodes.length > 0 ? (
              warningCodes.map((code) => (
                <Badge
                  key={code}
                  variant="outline"
                  className="border-beige-200 text-charcoal-700"
                >
                  {code}
                </Badge>
              ))
            ) : (
              <span className="font-medium text-pov-charcoal">None</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RankingsTable({ rankings }: { rankings: FundMoicRankingV2[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>MOIC Rankings</CardTitle>
        <CardDescription>Fund-scoped V2 rankings payload.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rank</TableHead>
              <TableHead>Investment</TableHead>
              <TableHead className="text-right">Reserves MOIC</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rankings.map((item) => (
              <TableRow key={item.investmentId}>
                <TableCell className="font-semibold text-charcoal-600">#{item.rank}</TableCell>
                <TableCell className="font-medium text-pov-charcoal">
                  {item.investmentName}
                </TableCell>
                <TableCell className="text-right font-bold tabular-nums text-pov-charcoal">
                  {formatMoicValue(item.reservesMoic.value)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function FundModelResultsMoicAnalysisPage() {
  const [, params] = useRoute('/fund-model-results/:fundId/moic-analysis');
  const fundIdResult = parseFundIdParam(params?.fundId);
  const { data, error, isLoading } = useFundMoicRankingsV2(fundIdResult.fundId);
  const hasParsedResponse = fundIdResult.status === 'valid' && !error && data;

  return (
    <div className="container mx-auto space-y-6 p-6">
      <header>
        <h1 className="text-3xl font-bold text-pov-charcoal">MOIC Analysis</h1>
        <p className="text-muted-foreground">
          {fundIdResult.status === 'valid' ? `Fund ${fundIdResult.fundId}` : 'Fund-scoped results'}
        </p>
      </header>

      {fundIdResult.status === 'missing' ? (
        <StateCard
          title="Fund ID required"
          description="MOIC rankings are unavailable because the route did not include a fund ID."
          icon="info"
        />
      ) : null}

      {fundIdResult.status === 'invalid' ? (
        <StateCard
          title="Invalid fund ID"
          description="MOIC rankings are unavailable because the fund ID is not a positive integer."
        />
      ) : null}

      {fundIdResult.status === 'valid' && isLoading ? (
        <StateCard
          title="Loading MOIC rankings"
          description="Fetching the fund-scoped MOIC rankings response."
          icon="loading"
        />
      ) : null}

      {fundIdResult.status === 'valid' && error ? (
        <StateCard
          title={
            error.code === 'CONTRACT_PARSE_ERROR'
              ? 'MOIC contract mismatch'
              : 'Unable to load MOIC rankings'
          }
          description={
            error.code === 'CONTRACT_PARSE_ERROR'
              ? 'The response did not match the required V2 contract, so rankings are not shown.'
              : 'The rankings endpoint returned a load error, so rankings are not shown.'
          }
        />
      ) : null}

      {hasParsedResponse && data.rankings.length === 0 ? (
        <>
          <ProvenanceStrip data={data} />
          <StateCard
            title="No rankings available"
            description="The V2 response returned zero reserves MOIC ranking rows for this fund."
            icon="info"
          />
        </>
      ) : null}

      {hasParsedResponse && data.rankings.length > 0 ? (
        <>
          <ProvenanceStrip data={data} />
          <RankingsTable rankings={data.rankings} />
        </>
      ) : null}
    </div>
  );
}
