import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCents } from '@/lib/units';
import type { ReserveIcPacket } from './reserve-ic-packet';

interface ReserveIcPacketCardProps {
  packet: ReserveIcPacket | null;
  isLoading: boolean;
  error: Error | null;
}

function formatSourceKind(kind: ReserveIcPacket['sources'][number]['kind']) {
  switch (kind) {
    case 'authoritative':
      return 'Authoritative';
    case 'draft':
      return 'Draft';
    case 'summary-only':
      return 'Summary only';
    case 'unavailable':
      return 'Unavailable';
    default:
      return kind;
  }
}

function formatSignedCompactCents(value: number | null) {
  if (value === null) {
    return 'N/A';
  }

  if (value === 0) {
    return formatCents(0, { compact: true });
  }

  const absoluteValue = formatCents(Math.abs(value), { compact: true });
  return `${value > 0 ? '+' : '-'}${absoluteValue}`;
}

function formatDecisionLabel(value: ReserveIcPacket['companyRows'][number]['recordedDecisionType']) {
  if (!value) {
    return 'No decision';
  }

  return value.replace('_', ' ');
}

function formatDecisionStatusLabel(
  value: ReserveIcPacket['companyRows'][number]['recordedDecisionStatus']
) {
  if (!value) {
    return 'No status';
  }

  return value.replace('_', ' ');
}

export function ReserveIcPacketCard({
  packet,
  isLoading,
  error,
}: ReserveIcPacketCardProps) {
  if (isLoading) {
    return (
      <Card className="border-slate-200 bg-white/90">
        <CardHeader>
          <CardTitle>IC Reserve Packet</CardTitle>
          <CardDescription>Loading current packet evidence…</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  if (!packet) {
    return (
      <Card className="border-slate-200 bg-white/90">
        <CardHeader>
          <CardTitle>IC Reserve Packet</CardTitle>
          <CardDescription>Resume a saved scenario to assemble a review packet.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200 bg-white/90">
      <CardHeader>
        <CardTitle>IC Reserve Packet</CardTitle>
        <CardDescription>
          Draft scenario, live allocation surface, and publish-backed reserve evidence with explicit
          freshness markers.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap gap-2">
          {packet.sources.map((source) => (
            <Badge key={source.source} variant="outline" className="border-slate-300 text-slate-700">
              {source.source.replace('_', ' ')} · {formatSourceKind(source.kind)} ·{' '}
              {source.asOf ? source.asOf : 'No timestamp'}
            </Badge>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
            <div className="text-sm font-medium text-slate-950">Published Reserve Summary</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Total Allocation</div>
                <div className="mt-1 text-lg font-semibold text-slate-950">
                  {packet.publishedReserve.totalAllocation != null
                    ? formatCents(packet.publishedReserve.totalAllocation, { compact: true })
                    : 'Unavailable'}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Reserve Ratio</div>
                <div className="mt-1 text-lg font-semibold text-slate-950">
                  {packet.publishedReserve.reserveRatio != null
                    ? `${(packet.publishedReserve.reserveRatio * 100).toFixed(1)}%`
                    : 'Unavailable'}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Avg Confidence</div>
                <div className="mt-1 text-lg font-semibold text-slate-950">
                  {packet.publishedReserve.avgConfidence != null
                    ? `${(packet.publishedReserve.avgConfidence * 100).toFixed(0)}%`
                    : 'Unavailable'}
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-600">{packet.publishedReserve.note}</p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
            <div className="text-sm font-medium text-slate-950">Publish Comparison Evidence</div>
            {packet.comparison.metricDeltas.length > 0 ? (
              <div className="mt-3 space-y-2">
                {packet.comparison.metricDeltas.map((delta) => (
                  <div
                    key={delta.metric}
                    className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <span className="text-slate-700">{delta.displayName}</span>
                    <span className="font-medium text-slate-950">
                      {delta.absoluteDelta ?? 'N/A'} /{' '}
                      {delta.percentageDelta != null ? `${delta.percentageDelta}%` : 'N/A'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-600">
                Comparison status: {packet.comparison.comparisonStatus}
              </p>
            )}
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-slate-700">Company</th>
                <th className="px-3 py-2 text-right font-medium text-slate-700">Live</th>
                <th className="px-3 py-2 text-right font-medium text-slate-700">Scenario</th>
                <th className="px-3 py-2 text-right font-medium text-slate-700">Delta</th>
                <th className="px-3 py-2 text-left font-medium text-slate-700">Decision</th>
                <th className="px-3 py-2 text-left font-medium text-slate-700">Status</th>
                <th className="px-3 py-2 text-left font-medium text-slate-700">Rationale</th>
              </tr>
            </thead>
            <tbody>
              {packet.companyRows.map((row) => (
                <tr key={row.companyId} className="border-t border-slate-200">
                  <td className="px-3 py-2 font-medium text-slate-950">{row.companyName}</td>
                  <td className="px-3 py-2 text-right text-slate-700">
                    {row.livePlannedReservesCents != null
                      ? formatCents(row.livePlannedReservesCents, { compact: true })
                      : 'N/A'}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-950">
                    {formatCents(row.scenarioPlannedReservesCents, { compact: true })}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-700">
                    {formatSignedCompactCents(row.deltaPlannedReservesCents)}
                  </td>
                  <td className="px-3 py-2 text-slate-700">{formatDecisionLabel(row.recordedDecisionType)}</td>
                  <td className="px-3 py-2 text-slate-700">
                    {formatDecisionStatusLabel(row.recordedDecisionStatus)}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {row.decisionRationale?.trim() || row.rationale?.trim() || 'No rationale recorded'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
