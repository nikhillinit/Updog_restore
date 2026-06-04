import React, { useCallback, useEffect, useState } from 'react';
import { useRoute } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Shield, Eye, Clock, AlertCircle, CheckCircle, Printer } from 'lucide-react';
import type {
  PublicMetricValue,
  PublicShareSnapshotPayload,
} from '@shared/contracts/public-share-snapshot.contract';

interface ShareData {
  id: string;
  requirePasskey: boolean;
  customTitle?: string | null;
  customMessage?: string | null;
  expiresAt?: string | null;
  snapshot?: PublicShareSnapshotPayload;
}

interface ShareApiResponse {
  success?: boolean;
  error?: string;
  message?: string;
  share?: ShareData;
}

type ShareResponseState =
  | { kind: 'error'; message: string }
  | { kind: 'passkey'; share: ShareData }
  | { kind: 'snapshot'; share: ShareData; snapshot: PublicShareSnapshotPayload };

function shareResponseError(body: ShareApiResponse, fallback: string): string {
  return body.message ?? body.error ?? fallback;
}

function classifyShareResponse(body: ShareApiResponse): ShareResponseState {
  if (!body.success || !body.share) {
    return { kind: 'error', message: shareResponseError(body, 'Failed to load share') };
  }

  const { share } = body;
  const { snapshot } = share;

  if (share.requirePasskey && !snapshot) {
    return { kind: 'passkey', share };
  }

  if (!snapshot) {
    return { kind: 'error', message: 'Public share snapshot is unavailable' };
  }

  return { kind: 'snapshot', share, snapshot };
}

const useSharedDashboard = (shareId: string) => {
  const [shareData, setShareData] = useState<ShareData | null>(null);
  const [snapshot, setSnapshot] = useState<PublicShareSnapshotPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requiresPasskey, setRequiresPasskey] = useState(false);

  const applyShareResponse = useCallback((body: ShareApiResponse) => {
    const state = classifyShareResponse(body);

    if (state.kind === 'error') {
      setError(state.message);
      return false;
    }

    setShareData(state.share);
    if (state.kind === 'passkey') {
      setRequiresPasskey(true);
      setSnapshot(null);
      return true;
    }

    setRequiresPasskey(false);
    setSnapshot(state.snapshot);
    return true;
  }, []);

  useEffect(() => {
    const fetchShare = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetch(`/api/public/shares/${shareId}`);
        const body = (await response.json()) as ShareApiResponse;

        if (!response.ok) {
          setError(shareResponseError(body, 'Failed to load share'));
          return;
        }

        applyShareResponse(body);
      } catch {
        setError('Failed to connect to server');
      } finally {
        setIsLoading(false);
      }
    };

    if (shareId) {
      fetchShare();
    }
  }, [applyShareResponse, shareId]);

  const verifyPasskey = useCallback(
    async (passkey: string): Promise<boolean> => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(`/api/public/shares/${shareId}/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ passkey }),
        });

        const body = (await response.json()) as ShareApiResponse;

        if (!response.ok) {
          setError(shareResponseError(body, 'Verification failed'));
          return false;
        }

        return applyShareResponse(body);
      } catch {
        setError('Failed to verify passkey');
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [applyShareResponse, shareId]
  );

  return {
    shareConfig: shareData,
    snapshot,
    isLoading,
    error,
    requiresPasskey,
    verifyPasskey,
  };
};

function formatMetric(metric: PublicMetricValue): string {
  if (metric.availability !== 'available' || metric.value === null) {
    return 'Unavailable';
  }

  if (metric.unit === 'currency') {
    return `$${(metric.value / 1000000).toFixed(1)}M`;
  }

  if (metric.unit === 'percent') {
    return `${metric.value.toFixed(1)}%`;
  }

  if (metric.unit === 'multiple') {
    return `${metric.value.toFixed(2)}x`;
  }

  return String(metric.value);
}

function MetricCard({ metric }: { metric: PublicMetricValue }) {
  const unavailable = metric.availability !== 'available';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-charcoal-600">{metric.label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className={`text-2xl font-bold ${unavailable ? 'text-charcoal-500' : 'text-pov-charcoal'}`}
        >
          {formatMetric(metric)}
        </div>
        <p className="mt-2 text-xs text-charcoal-500">
          {unavailable
            ? (metric.unavailableReason ?? 'Source data unavailable')
            : `${metric.source} as of ${new Date(metric.asOfDate).toLocaleDateString()}`}
        </p>
      </CardContent>
    </Card>
  );
}

const SharedDashboard: React.FC = () => {
  const [, params] = useRoute('/shared/:shareId');
  const shareId = params?.shareId ?? '';
  const [enteredPasskey, setEnteredPasskey] = useState('');
  const [passkeyError, setPasskeyError] = useState<string | null>(null);

  const { shareConfig, snapshot, isLoading, error, requiresPasskey, verifyPasskey } =
    useSharedDashboard(shareId);

  useEffect(() => {
    if (shareConfig && snapshot && !isLoading) {
      const startTime = Date.now();
      return () => {
        const duration = Math.round((Date.now() - startTime) / 1000);
        if (duration > 5) {
          // Duration is intentionally tracked for future analytics integration.
        }
      };
    }
  }, [shareConfig, snapshot, isLoading]);

  const handlePasskeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasskeyError(null);

    if (enteredPasskey.length === 0) {
      setPasskeyError('Please enter a passkey');
      return;
    }

    const success = await verifyPasskey(enteredPasskey);
    if (!success) {
      setPasskeyError('Invalid passkey. Please try again.');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-pov-gray flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pov-charcoal mx-auto mb-4"></div>
          <p className="text-charcoal-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-pov-gray flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 text-error mx-auto mb-4" />
              <h1 className="text-xl font-semibold text-pov-charcoal mb-2">Access Error</h1>
              <p className="text-charcoal-600 mb-4">{error}</p>
              <p className="text-sm text-charcoal-500">
                Please check your link or contact the fund manager for assistance.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (requiresPasskey) {
    return (
      <div className="min-h-screen bg-pov-gray flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Shield className="h-12 w-12 text-pov-charcoal mx-auto mb-4" />
            <CardTitle>Secure Access Required</CardTitle>
            {shareConfig?.customTitle && (
              <p className="text-charcoal-600 mt-2">{shareConfig.customTitle}</p>
            )}
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasskeySubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-charcoal-700 mb-2">
                  Enter Passkey
                </label>
                <Input
                  type="password"
                  value={enteredPasskey}
                  onChange={(e) => {
                    setEnteredPasskey(e.target.value);
                    setPasskeyError(null);
                  }}
                  placeholder="Enter the passkey provided by your fund manager"
                  className={passkeyError ? 'border-error' : ''}
                  required
                />
                {passkeyError && <p className="text-sm text-error-dark mt-1">{passkeyError}</p>}
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Verifying...' : 'Access Dashboard'}
              </Button>
            </form>
            {shareConfig?.customMessage && (
              <p className="text-sm text-charcoal-500 mt-4 text-center">
                {shareConfig.customMessage}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!snapshot) {
    return null;
  }

  return (
    <div className="min-h-screen bg-pov-gray print:bg-white">
      <div className="bg-white border-b print:border-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-pov-charcoal">{snapshot.title}</h1>
              {snapshot.message && <p className="text-charcoal-600 mt-1">{snapshot.message}</p>}
            </div>
            <div className="flex items-center gap-4 no-print">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                className="flex items-center gap-2"
              >
                <Printer className="h-4 w-4" />
                Print
              </Button>
              <div className="flex items-center gap-2 text-sm text-charcoal-500">
                <Eye className="h-4 w-4" />
                Read-only Access
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {snapshot.metrics.map((metric) => (
            <MetricCard key={metric.id} metric={metric} />
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Public Portfolio Snapshot</CardTitle>
          </CardHeader>
          <CardContent>
            {snapshot.portfolioCompanies.length === 0 ? (
              <div className="rounded-md border border-warning/50 bg-warning/10 p-4 text-sm text-warning-dark">
                Portfolio company details are unavailable in this public snapshot.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Company</th>
                      <th className="text-left py-2">Stage</th>
                      <th className="text-left py-2">MOIC</th>
                      <th className="text-left py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.portfolioCompanies.map((company) => (
                      <tr key={company.name} className="border-b">
                        <td className="py-3 font-medium">{company.name}</td>
                        <td className="py-3">{company.stage ?? 'Unavailable'}</td>
                        <td className="py-3 font-bold">
                          {company.moic === null ? 'Unavailable' : `${company.moic.toFixed(1)}x`}
                        </td>
                        <td className="py-3">{company.status ?? 'Unavailable'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="mt-12 pt-8 border-t text-center text-sm text-charcoal-500">
          <div className="flex items-center justify-center gap-4">
            <div className="flex items-center gap-1">
              <CheckCircle className="h-4 w-4 text-success" />
              Server-authorized Snapshot
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              As of {new Date(snapshot.asOfDate).toLocaleDateString()}
            </div>
          </div>
          <p className="mt-2">
            This dashboard is provided for informational purposes only. Please contact your fund
            manager for any questions.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SharedDashboard;
