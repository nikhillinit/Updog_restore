/**
 * Settings Page - Fund preferences and advanced features
 *
 * Includes Advanced Features section with Secondary Market access.
 * Part of Codex-validated UI/UX restructure.
 */

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { POVBrandHeader } from "@/components/ui/POVLogo";
import {
  Settings as SettingsIcon,
  User,
  Bell,
  Shield,
  Database,
  Activity
} from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-slate-100">
      <POVBrandHeader
        title="Settings"
        subtitle="Configure your fund preferences and integrations"
        variant="light"
      />

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Profile Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <User className="h-5 w-5 text-pov-charcoal" />
              <div>
                <CardTitle className="font-inter text-lg">Profile</CardTitle>
                <CardDescription className="font-poppins text-sm">
                  Manage your account information
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-inter text-sm font-medium text-pov-charcoal">Display Name</p>
                <p className="font-poppins text-xs text-gray-500">Fund Manager</p>
              </div>
              <Button variant="outline" size="sm">Edit</Button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-inter text-sm font-medium text-pov-charcoal">Email</p>
                <p className="font-poppins text-xs text-gray-500">manager@pressonfund.com</p>
              </div>
              <Button variant="outline" size="sm">Change</Button>
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5 text-pov-charcoal" />
              <div>
                <CardTitle className="font-inter text-lg">Notifications</CardTitle>
                <CardDescription className="font-poppins text-sm">
                  Configure alerts and reminders
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-inter text-sm font-medium text-pov-charcoal">Email Digests</p>
                <p className="font-poppins text-xs text-gray-500">Weekly portfolio summary</p>
              </div>
              <Switch />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-inter text-sm font-medium text-pov-charcoal">KPI Reminders</p>
                <p className="font-poppins text-xs text-gray-500">Notify when company updates are due</p>
              </div>
              <Switch defaultChecked />
            </div>
          </CardContent>
        </Card>

        {/* Data & Privacy */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-pov-charcoal" />
              <div>
                <CardTitle className="font-inter text-lg">Data & Privacy</CardTitle>
                <CardDescription className="font-poppins text-sm">
                  Manage data exports and security
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-inter text-sm font-medium text-pov-charcoal">Export Data</p>
                <p className="font-poppins text-xs text-gray-500">Download all fund data as CSV</p>
              </div>
              <Button variant="outline" size="sm">
                <Database className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Deferred Surfaces */}
        <Card className="border-pov-charcoal/20">
          <CardHeader>
            <div className="flex items-center gap-3">
              <SettingsIcon className="h-5 w-5 text-pov-charcoal" />
              <div>
                <CardTitle className="font-inter text-lg">Deferred Surfaces</CardTitle>
                <CardDescription className="font-poppins text-sm">
                  These tools are intentionally outside the default runtime perimeter during stabilization
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
              <div className="flex items-center gap-3">
                <Activity className="h-5 w-5 text-pov-charcoal/60" />
                <div>
                  <p className="font-inter text-sm font-medium text-pov-charcoal">Secondary Market</p>
                  <p className="font-poppins text-xs text-gray-500">
                    Deferred until the core internal workflow perimeter is stabilized
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" disabled aria-disabled="true">
                Deferred
              </Button>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
              <div className="flex items-center gap-3">
                <Database className="h-5 w-5 text-pov-charcoal/60" />
                <div>
                  <p className="font-inter text-sm font-medium text-pov-charcoal">Notion Integration</p>
                  <p className="font-poppins text-xs text-gray-500">
                    Deferred until the default runtime perimeter is reduced and hardened
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" disabled aria-disabled="true">
                Deferred
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
