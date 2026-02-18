/**
 * Privacy Settings Component
 * Allows users to control analytics and telemetry preferences
 */

import React, { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Eye, Activity } from 'lucide-react';
import { setAnalyticsEnabled } from '@/monitoring';

export function PrivacySettings() {
  const [analyticsEnabled, setAnalyticsEnabledState] = useState(false);
  const [rumEnabled, setRumEnabled] = useState(false);

  useEffect(() => {
    // Check current state
    const optedOut = localStorage.getItem('analyticsOptOut') === '1';
    const rumOptedOut = localStorage.getItem('rumOptOut') === '1';

    setAnalyticsEnabledState(!optedOut);
    setRumEnabled(!rumOptedOut);
  }, []);

  const handleAnalyticsToggle = (enabled: boolean) => {
    setAnalyticsEnabledState(enabled);
    setAnalyticsEnabled(enabled);

    // Show notification
    const message = enabled
      ? 'Analytics enabled. Page will reload to apply changes.'
      : 'Analytics disabled. Your privacy preferences have been saved.';

    if (window.confirm(message)) {
      window.location.reload();
    }
  };

  const handleRumToggle = (enabled: boolean) => {
    setRumEnabled(enabled);

    if (enabled) {
      localStorage.removeItem('rumOptOut');
    } else {
      localStorage.setItem('rumOptOut', '1');
    }

    // RUM changes take effect on next page load
    const message = enabled
      ? 'Performance monitoring enabled for next session.'
      : 'Performance monitoring disabled.';

    console.log(message);
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Privacy Settings
        </CardTitle>
        <CardDescription>Control how we collect and use your data</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Analytics Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="analytics" className="flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Error Tracking & Analytics
              </Label>
              <p className="text-sm text-muted-foreground">
                Help us improve by sending anonymous error reports and usage analytics
              </p>
            </div>
            <Switch
              id="analytics"
              checked={analyticsEnabled}
              onCheckedChange={handleAnalyticsToggle}
            />
          </div>

          {analyticsEnabled && (
            <div className="ml-6 p-3 bg-muted rounded-md text-sm">
              <ul className="space-y-1">
                <li>• Anonymous error reports via Sentry</li>
                <li>• No personally identifiable information</li>
                <li>• Helps us fix bugs faster</li>
              </ul>
            </div>
          )}
        </div>

        {/* RUM Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="rum" className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Performance Monitoring
              </Label>
              <p className="text-sm text-muted-foreground">
                Share page load and interaction metrics to help us optimize performance
              </p>
            </div>
            <Switch id="rum" checked={rumEnabled} onCheckedChange={handleRumToggle} />
          </div>

          {rumEnabled && (
            <div className="ml-6 p-3 bg-muted rounded-md text-sm">
              <ul className="space-y-1">
                <li>• Web Vitals (LCP, INP, CLS)</li>
                <li>• Page routes only, no user data</li>
                <li>• Helps us make the app faster</li>
              </ul>
            </div>
          )}
        </div>

        {/* Privacy Notice */}
        <div className="mt-6 p-4 border rounded-lg bg-background">
          <p className="text-sm text-muted-foreground">
            <strong>Your privacy matters.</strong> We respect Do Not Track (DNT) browser settings.
            All telemetry is anonymous and never includes personal or financial data. You can change
            these settings at any time.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default PrivacySettings;
