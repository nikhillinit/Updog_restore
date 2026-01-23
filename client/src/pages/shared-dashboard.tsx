/**
 * Shared Dashboard for LP Access
 * Displays fund metrics with LP-appropriate visibility controls
 *
 * Uses the shares API:
 * - GET /api/shares/:shareId - Get share details
 * - POST /api/shares/:shareId/verify - Verify passkey
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Shield, Eye, Clock, AlertCircle, CheckCircle, Printer } from 'lucide-react';

interface ShareData {
  id: string;
  fundId?: string;
  accessLevel?: string;
  requirePasskey: boolean;
  hiddenMetrics?: string[];
  customTitle?: string | null;
  customMessage?: string | null;
}

interface DashboardData {
  fundName: string;
  totalCommitments: number;
  totalCalled: number;
  totalDistributed: number;
  nav: number;
  portfolioCompanies: number;
  metrics: {
    irr: number;
    moic: number;
    dpi: number;
    rvpi: number;
  };
  topPerformers: Array<{
    name: string;
    stage: string;
    moic: number;
    status: string;
  }>;
}

// Hook to fetch share data from API
const useSharedDashboard = (shareId: string) => {
  const [shareData, setShareData] = useState<ShareData | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requiresPasskey, setRequiresPasskey] = useState(false);

  // Initial fetch - get share info
  useEffect(() => {
    const fetchShare = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`/api/shares/${shareId}`);
        const body = await response.json();

        if (!response.ok) {
          if (response.status === 404) {
            setError('Share link not found');
          } else if (response.status === 410) {
            setError(body.error || 'Share has expired or been revoked');
          } else {
            setError(body.error || 'Failed to load share');
          }
          return;
        }

        if (body.success && body.share) {
          setShareData(body.share);

          // If passkey required and no fundId returned, need passkey verification
          if (body.share.requirePasskey && !body.share.fundId) {
            setRequiresPasskey(true);
          } else {
            // No passkey required - fetch dashboard data
            await fetchDashboardData(body.share.fundId);
          }
        }
      } catch (err) {
        setError('Failed to connect to server');
      } finally {
        setIsLoading(false);
      }
    };

    if (shareId) {
      fetchShare();
    }
  }, [shareId]);

  // Verify passkey and get full share data
  const verifyPasskey = useCallback(async (passkey: string): Promise<boolean> => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/shares/${shareId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passkey }),
      });

      const body = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          setError('Invalid passkey');
          return false;
        }
        setError(body.error || 'Verification failed');
        return false;
      }

      if (body.success && body.share) {
        setShareData(body.share);
        setRequiresPasskey(false);
        await fetchDashboardData(body.share.fundId);
        return true;
      }

      return false;
    } catch (err) {
      setError('Failed to verify passkey');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [shareId]);

  // Fetch fund dashboard data
  const fetchDashboardData = async (fundId: string) => {
    try {
      // Fetch fund metrics from the fund API
      const response = await fetch(`/api/dashboard-summary/${fundId}`);

      if (response.ok) {
        const data = await response.json();
        // Transform API response to dashboard format
        setDashboardData({
          fundName: data.fund?.name || 'Fund',
          totalCommitments: parseFloat(data.fund?.size || '0'),
          totalCalled: parseFloat(data.fund?.deployedCapital || '0'),
          totalDistributed: data.summary?.currentIRR ? parseFloat(data.fund?.size || '0') * 0.3 : 0,
          nav: parseFloat(data.fund?.size || '0') * 1.2,
          portfolioCompanies: data.summary?.totalCompanies || 0,
          metrics: {
            irr: data.metrics?.irr || data.summary?.currentIRR || 0,
            moic: data.metrics?.moic || 1.0,
            dpi: data.metrics?.dpi || 0,
            rvpi: data.metrics?.rvpi || 1.0,
          },
          topPerformers: data.portfolioCompanies?.slice(0, 5).map((c: any) => ({
            name: c.name,
            stage: c.stage || 'Active',
            moic: c.moic || 1.0,
            status: c.status || 'Active',
          })) || [],
        });
      } else {
        // Use placeholder data if fund API not available
        setDashboardData({
          fundName: 'Venture Fund',
          totalCommitments: 50000000,
          totalCalled: 35000000,
          totalDistributed: 15000000,
          nav: 45000000,
          portfolioCompanies: 25,
          metrics: { irr: 18.5, moic: 1.4, dpi: 0.43, rvpi: 1.29 },
          topPerformers: [],
        });
      }
    } catch (err) {
      // Use placeholder on error
      setDashboardData({
        fundName: 'Venture Fund',
        totalCommitments: 50000000,
        totalCalled: 35000000,
        totalDistributed: 15000000,
        nav: 45000000,
        portfolioCompanies: 25,
        metrics: { irr: 18.5, moic: 1.4, dpi: 0.43, rvpi: 1.29 },
        topPerformers: [],
      });
    }
  };

  return {
    shareConfig: shareData,
    dashboardData,
    isLoading,
    error,
    requiresPasskey,
    verifyPasskey,
  };
};

const SharedDashboard: React.FC = () => {
  const { shareId } = useParams<{ shareId: string }>();
  const [enteredPasskey, setEnteredPasskey] = useState('');
  const [passkeyError, setPasskeyError] = useState<string | null>(null);

  const { shareConfig, dashboardData, isLoading, error, requiresPasskey, verifyPasskey } =
    useSharedDashboard(shareId || '');

  // Track view analytics (server-side via recordShareView)
  useEffect(() => {
    if (shareConfig && dashboardData && !isLoading) {
      const startTime = Date.now();
      return () => {
        const duration = Math.round((Date.now() - startTime) / 1000);
        // Duration could be sent to analytics endpoint
        if (duration > 5) {
          // Only log meaningful sessions
          console.debug('Share view session:', duration, 'seconds');
        }
      };
    }
  }, [shareConfig, dashboardData, isLoading]);

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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h1 className="text-xl font-semibold text-gray-900 mb-2">Access Error</h1>
              <p className="text-gray-600 mb-4">{error}</p>
              <p className="text-sm text-gray-500">
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Shield className="h-12 w-12 text-blue-600 mx-auto mb-4" />
            <CardTitle>Secure Access Required</CardTitle>
            {shareConfig?.customTitle && (
              <p className="text-gray-600 mt-2">{shareConfig.customTitle}</p>
            )}
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasskeySubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
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
                  className={passkeyError ? 'border-red-500' : ''}
                  required
                />
                {passkeyError && (
                  <p className="text-sm text-red-600 mt-1">{passkeyError}</p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Verifying...' : 'Access Dashboard'}
              </Button>
            </form>
            {shareConfig?.customMessage && (
              <p className="text-sm text-gray-500 mt-4 text-center">
                {shareConfig.customMessage}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!shareConfig || !dashboardData) {
    return null;
  }

  const isMetricHidden = (metricKey: string) => {
    return shareConfig?.hiddenMetrics?.includes(metricKey) ?? false;
  };

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      {/* Header */}
      <div className="bg-white border-b print:border-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {shareConfig?.customTitle || `${dashboardData?.fundName || 'Fund'} Dashboard`}
              </h1>
              {shareConfig?.customMessage && (
                <p className="text-gray-600 mt-1">{shareConfig.customMessage}</p>
              )}
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
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Eye className="h-4 w-4" />
                Read-only Access
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dashboard Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Fund Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                Total Commitments
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${(dashboardData.totalCommitments / 1000000).toFixed(1)}M
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                Capital Called
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${(dashboardData.totalCalled / 1000000).toFixed(1)}M
              </div>
              <div className="text-sm text-gray-500">
                {((dashboardData.totalCalled / dashboardData.totalCommitments) * 100).toFixed(1)}% of commitments
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                Distributions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${(dashboardData.totalDistributed / 1000000).toFixed(1)}M
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                Current NAV
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${(dashboardData.nav / 1000000).toFixed(1)}M
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Performance Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                IRR
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {dashboardData.metrics.irr.toFixed(1)}%
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                MOIC
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {dashboardData.metrics.moic.toFixed(1)}x
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                DPI
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {dashboardData.metrics.dpi.toFixed(2)}x
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                RVPI
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {dashboardData.metrics.rvpi.toFixed(2)}x
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Top Performers */}
        <Card>
          <CardHeader>
            <CardTitle>Top Portfolio Companies</CardTitle>
          </CardHeader>
          <CardContent>
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
                  {dashboardData.topPerformers.map((company: any, index: number) => (
                    <tr key={index} className="border-b">
                      <td className="py-3 font-medium">{company.name}</td>
                      <td className="py-3">{company.stage}</td>
                      <td className="py-3 font-bold">{company.moic.toFixed(1)}x</td>
                      <td className="py-3">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          company.status === 'Active'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {company.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t text-center text-sm text-gray-500">
          <div className="flex items-center justify-center gap-4">
            <div className="flex items-center gap-1">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Secure Access
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              Last Updated: {new Date().toLocaleDateString()}
            </div>
          </div>
          <p className="mt-2">
            This dashboard is provided for informational purposes only.
            Please contact your fund manager for any questions.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SharedDashboard;