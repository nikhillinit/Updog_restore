/**
 * LP Settings Page
 *
 * LP preferences for notifications, display options, and account settings.
 *
 * @module client/pages/lp/settings
 */

import { useState } from 'react';
import { useLPContext } from '@/contexts/LPContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Bell, Monitor, User, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// ============================================================================
// COMPONENT
// ============================================================================

export default function LPSettings() {
  const { lpProfile } = useLPContext();
  const { toast } = useToast();

  // Notification preferences
  const [emailCapitalCalls, setEmailCapitalCalls] = useState(true);
  const [emailDistributions, setEmailDistributions] = useState(true);
  const [emailQuarterlyReports, setEmailQuarterlyReports] = useState(true);
  const [emailAnnualReports, setEmailAnnualReports] = useState(true);
  const [emailMarketUpdates, setEmailMarketUpdates] = useState(false);

  // Display preferences
  const [currency, setCurrency] = useState('USD');
  const [numberFormat, setNumberFormat] = useState('US');
  const [timezone, setTimezone] = useState('America/New_York');

  const handleSave = () => {
    // In a real app, this would save to the backend
    toast({
      title: 'Settings Saved',
      description: 'Your preferences have been updated successfully.',
    });
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold font-inter text-[#292929]">Settings</h1>
        <p className="text-[#292929]/70 font-poppins mt-1">
          Manage your LP portal preferences
        </p>
      </div>

      {/* Profile Information */}
      <Card className="bg-white rounded-xl border border-[#E0D8D1] shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-inter text-lg text-[#292929]">
            <User className="h-5 w-5 text-blue-600" />
            Profile Information
          </CardTitle>
          <CardDescription className="font-poppins text-sm text-[#292929]/70">
            Your LP account details
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={lpProfile?.name || ''} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={lpProfile?.email || ''} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="entity-type">Entity Type</Label>
              <Input id="entity-type" value={lpProfile?.entityType || ''} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tax-id">Tax ID</Label>
              <Input id="tax-id" value={lpProfile?.taxId || 'Not provided'} disabled />
            </div>
          </div>
          <p className="text-xs text-[#292929]/50 font-poppins">
            To update your profile information, please contact your fund manager.
          </p>
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      <Card className="bg-white rounded-xl border border-[#E0D8D1] shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-inter text-lg text-[#292929]">
            <Bell className="h-5 w-5 text-blue-600" />
            Email Notifications
          </CardTitle>
          <CardDescription className="font-poppins text-sm text-[#292929]/70">
            Choose which email notifications you receive
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="email-capital-calls" className="font-medium">Capital Calls</Label>
              <p className="text-sm text-[#292929]/70 font-poppins">
                Receive notifications for new capital call notices
              </p>
            </div>
            <Switch
              id="email-capital-calls"
              checked={emailCapitalCalls}
              onCheckedChange={setEmailCapitalCalls}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="email-distributions" className="font-medium">Distributions</Label>
              <p className="text-sm text-[#292929]/70 font-poppins">
                Receive notifications for distribution payments
              </p>
            </div>
            <Switch
              id="email-distributions"
              checked={emailDistributions}
              onCheckedChange={setEmailDistributions}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="email-quarterly" className="font-medium">Quarterly Reports</Label>
              <p className="text-sm text-[#292929]/70 font-poppins">
                Receive quarterly performance reports
              </p>
            </div>
            <Switch
              id="email-quarterly"
              checked={emailQuarterlyReports}
              onCheckedChange={setEmailQuarterlyReports}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="email-annual" className="font-medium">Annual Reports</Label>
              <p className="text-sm text-[#292929]/70 font-poppins">
                Receive annual fund reports and K-1 tax documents
              </p>
            </div>
            <Switch
              id="email-annual"
              checked={emailAnnualReports}
              onCheckedChange={setEmailAnnualReports}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="email-updates" className="font-medium">Market Updates</Label>
              <p className="text-sm text-[#292929]/70 font-poppins">
                Receive market insights and portfolio updates
              </p>
            </div>
            <Switch
              id="email-updates"
              checked={emailMarketUpdates}
              onCheckedChange={setEmailMarketUpdates}
            />
          </div>
        </CardContent>
      </Card>

      {/* Display Preferences */}
      <Card className="bg-white rounded-xl border border-[#E0D8D1] shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-inter text-lg text-[#292929]">
            <Monitor className="h-5 w-5 text-blue-600" />
            Display Preferences
          </CardTitle>
          <CardDescription className="font-poppins text-sm text-[#292929]/70">
            Customize how data is displayed
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD ($)</SelectItem>
                  <SelectItem value="EUR">EUR (€)</SelectItem>
                  <SelectItem value="GBP">GBP (£)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="number-format">Number Format</Label>
              <Select value={numberFormat} onValueChange={setNumberFormat}>
                <SelectTrigger id="number-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="US">US (1,234.56)</SelectItem>
                  <SelectItem value="EU">EU (1.234,56)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger id="timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="America/New_York">Eastern Time</SelectItem>
                  <SelectItem value="America/Chicago">Central Time</SelectItem>
                  <SelectItem value="America/Denver">Mountain Time</SelectItem>
                  <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                  <SelectItem value="Europe/London">London</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} className="px-8">
          <Save className="h-4 w-4 mr-2" />
          Save Changes
        </Button>
      </div>
    </div>
  );
}
