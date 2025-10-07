/**
 * Shared Dashboard for LP Access
 * Displays fund metrics with LP-appropriate visibility controls
 */

import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Shield, Eye, Clock, AlertCircle, CheckCircle } from 'lucide-react';
import type { ShareConfig, ShareAnalytics } from '@shared/sharing-schema';

// Mock hook for shared dashboard data - replace with actual API
const useSharedDashboard = (shareId: string, passkey?: string) => {
  const [data, setData] = useState<{
    shareConfig: ShareConfig | null;
    dashboardData: any;
    isLoading: boolean;
    error: string | null;
    requiresPasskey: boolean;
  }>({
    shareConfig: null,
    dashboardData: null,
    isLoading: true,
    error: null,
    requiresPasskey: false
  });

  useEffect(() => {
    // Simulate API call
    const fetchData = async () => {
      try {
        // Mock validation
        if (shareId === 'demo-share-123') {
          const mockShareConfig: ShareConfig = {
            id: shareId,
            fundId: 'fund-123',
            createdBy: 'gp@example.com',
            accessLevel: 'view_only',
            requirePasskey: !!passkey || false,
            passkey: passkey || undefined,
            hiddenMetrics: ['gp_returns', 'management_fees', 'carried_interest'],
            customTitle: 'Demo Fund - Q4 2024 Performance',
            customMessage: 'Welcome to our quarterly performance dashboard.',
            viewCount: 15,
            lastViewedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
            isActive: true
          };

          const mockDashboardData = {
            fundName: 'Demo Venture Fund I',
            totalCommitments: 50000000,
            totalCalled: 35000000,
            totalDistributed: 15000000,
            nav: 45000000,
            portfolioCompanies: 25,
            metrics: {
              irr: 18.5,
              moic: 1.4,
              dpi: 0.43,
              rvpi: 1.29
            },
            topPerformers: [
              { name: 'TechCorp Inc.', stage: 'Series B', moic: 3.2, status: 'Active' },
              { name: 'AI Solutions', stage: 'Series A', moic: 2.1, status: 'Active' },
              { name: 'FinTech Pro', stage: 'Exit', moic: 4.5, status: 'Exited' }
            ]
          };

          setData({
            shareConfig: mockShareConfig,
            dashboardData: mockDashboardData,
            isLoading: false,
            error: null,
            requiresPasskey: false
          });
        } else {
          setData(prev => ({
            ...prev,
            isLoading: false,
            error: 'Share link not found or expired'
          }));
        }
      } catch (error) {
        setData(prev => ({
          ...prev,
          isLoading: false,
          error: 'Failed to load dashboard'
        }));
      }
    };

    fetchData();
  }, [shareId, passkey]);

  return data;
};

const SharedDashboard: React.FC = () => {
  const { shareId } = useParams<{ shareId: string }>();
  const [searchParams] = useSearchParams();
  const [enteredPasskey, setEnteredPasskey] = useState('');
  const [isPasskeyValidated, setIsPasskeyValidated] = useState(false);

  const { shareConfig, dashboardData, isLoading, error, requiresPasskey } = useSharedDashboard(
    shareId || '',
    isPasskeyValidated ? enteredPasskey : undefined
  );

  // Track view analytics
  useEffect(() => {
    if (shareConfig && dashboardData && !isLoading) {
      const analytics: Omit<ShareAnalytics, 'shareId'> = {
        viewedAt: new Date(),
        viewerIP: undefined, // Would be set server-side
        userAgent: navigator.userAgent,
        duration: undefined,
        pagesViewed: ['dashboard']
      };

      // Send analytics to API
      console.log('Track view:', { shareId, ...analytics });

      // Track time on page
      const startTime = Date.now();
      return () => {
        const duration = Math.round((Date.now() - startTime) / 1000);
        console.log('Session duration:', duration, 'seconds');
      };
    }
  }, [shareConfig, dashboardData, isLoading, shareId]);

  const handlePasskeySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // In real implementation, validate passkey with API
    if (enteredPasskey.length > 0) {
      setIsPasskeyValidated(true);
    }
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

  if (requiresPasskey && !isPasskeyValidated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Shield className="h-12 w-12 text-blue-600 mx-auto mb-4" />
            <CardTitle>Secure Access Required</CardTitle>
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
                  onChange={(e) => setEnteredPasskey(e.target.value)}
                  placeholder="Enter the passkey provided by your fund manager"
                  required
                />
              </div>
              <Button type="submit" className="w-full">
                Access Dashboard
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!shareConfig || !dashboardData) {
    return null;
  }

  const isMetricHidden = (metricKey: string) => {
    return shareConfig.hiddenMetrics.includes(metricKey);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {shareConfig.customTitle || `${dashboardData.fundName} Dashboard`}
              </h1>
              {shareConfig.customMessage && (
                <p className="text-gray-600 mt-1">{shareConfig.customMessage}</p>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Eye className="h-4 w-4" />
              Read-only Access
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