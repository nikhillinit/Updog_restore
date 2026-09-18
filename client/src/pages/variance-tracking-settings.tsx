import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export function VarianceTrackingSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-pov-charcoal">Variance Settings</h2>
        <p className="text-charcoal-600">
          Alert delivery and scheduled analysis configuration are unavailable.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Notification Settings</CardTitle>
          <CardDescription>
            Email, real-time, and digest delivery are not connected to a notification service.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {['Email Notifications', 'Real-time Alerts', 'Daily Digest'].map((label) => (
            <div key={label} className="flex items-center justify-between">
              <Label className="text-base">{label}</Label>
              <Switch aria-label={label} checked={false} disabled />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Analysis Settings</CardTitle>
          <CardDescription>
            Threshold and cadence controls will be enabled when the analysis scheduler consumes
            them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label htmlFor="variance-default-threshold">Default Variance Threshold (%)</Label>
            <Input
              id="variance-default-threshold"
              type="number"
              value=""
              disabled
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="variance-analysis-frequency">Analysis Frequency</Label>
            <Input id="variance-analysis-frequency" value="Unavailable" disabled className="mt-1" />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-charcoal-600" aria-live="polite">
          No browser preference is saved because these settings do not affect delivery or analysis.
        </p>
        <Button disabled>Save Settings</Button>
      </div>
    </div>
  );
}
