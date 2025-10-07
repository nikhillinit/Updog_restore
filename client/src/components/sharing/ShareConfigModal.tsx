/**
 * Share Configuration Modal
 * Allows GPs to create and manage shareable links for LPs
 */

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Share2, Copy, Eye, Clock, Shield, Users } from 'lucide-react';
import type { CreateShareLinkRequest } from '@shared/sharing-schema';
import { LP_HIDDEN_METRICS } from '@shared/sharing-schema';

interface ShareConfigModalProps {
  fundId: string;
  fundName: string;
  onCreateShare: (config: CreateShareLinkRequest) => Promise<{ shareUrl: string; shareId: string }>;
  children?: React.ReactNode;
}

export const ShareConfigModal: React.FC<ShareConfigModalProps> = ({
  fundId,
  fundName,
  onCreateShare,
  children
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createdLink, setCreatedLink] = useState<string | null>(null);

  const [config, setConfig] = useState<CreateShareLinkRequest>({
    fundId,
    accessLevel: 'view_only',
    requirePasskey: false,
    passkey: '',
    expiresInDays: 30,
    hiddenMetrics: [...LP_HIDDEN_METRICS],
    customTitle: `${fundName} - Portfolio Dashboard`,
    customMessage: ''
  });

  const handleCreateShare = async () => {
    setIsCreating(true);
    try {
      const result = await onCreateShare(config);
      setCreatedLink(result.shareUrl);
    } catch (error) {
      console.error('Failed to create share link:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    // Could add toast notification here
  };

  const resetForm = () => {
    setCreatedLink(null);
    setConfig({
      fundId,
      accessLevel: 'view_only',
      requirePasskey: false,
      passkey: '',
      expiresInDays: 30,
      hiddenMetrics: [...LP_HIDDEN_METRICS],
      customTitle: `${fundName} - Portfolio Dashboard`,
      customMessage: ''
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      setIsOpen(open);
      if (!open) resetForm();
    }}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" className="gap-2">
            <Share2 className="h-4 w-4" />
            Share with LPs
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Share Fund Dashboard
          </DialogTitle>
        </DialogHeader>

        {createdLink ? (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="font-medium text-green-900 mb-2 flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Share Link Created Successfully
              </h3>
              <div className="flex items-center gap-2">
                <Input
                  value={createdLink}
                  readOnly
                  className="flex-1 font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(createdLink)}
                  className="gap-1"
                >
                  <Copy className="h-3 w-3" />
                  Copy
                </Button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={resetForm} variant="outline" className="flex-1">
                Create Another Link
              </Button>
              <Button onClick={() => setIsOpen(false)} className="flex-1">
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Access Level */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Access Level
              </Label>
              <Select
                value={config.accessLevel}
                onValueChange={(value) => setConfig(prev => ({ ...prev, accessLevel: value as any }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="view_only">View Only - Basic LP Dashboard</SelectItem>
                  <SelectItem value="view_with_details">View with Details - Extended Metrics</SelectItem>
                  <SelectItem value="collaborator">Collaborator - Can Comment</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Security Settings */}
            <div className="space-y-4 border rounded-lg p-4">
              <h3 className="font-medium flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Security Settings
              </h3>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Require Passkey</Label>
                  <p className="text-sm text-gray-600">Protect access with a password</p>
                </div>
                <Switch
                  checked={config.requirePasskey}
                  onCheckedChange={(checked) => setConfig(prev => ({ ...prev, requirePasskey: checked }))}
                />
              </div>

              {config.requirePasskey && (
                <div className="space-y-2">
                  <Label>Passkey</Label>
                  <Input
                    type="password"
                    value={config.passkey}
                    onChange={(e) => setConfig(prev => ({ ...prev, passkey: e.target.value }))}
                    placeholder="Enter a secure passkey"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Expires After (Days)
                </Label>
                <Input
                  type="number"
                  min="1"
                  max="365"
                  value={config.expiresInDays || ''}
                  onChange={(e) => setConfig(prev => ({ ...prev, expiresInDays: parseInt(e.target.value) || undefined }))}
                  placeholder="30"
                />
              </div>
            </div>

            {/* Customization */}
            <div className="space-y-4">
              <h3 className="font-medium">Customization</h3>

              <div className="space-y-2">
                <Label>Dashboard Title</Label>
                <Input
                  value={config.customTitle}
                  onChange={(e) => setConfig(prev => ({ ...prev, customTitle: e.target.value }))}
                  placeholder="Custom title for LP dashboard"
                />
              </div>

              <div className="space-y-2">
                <Label>Welcome Message</Label>
                <Textarea
                  value={config.customMessage}
                  onChange={(e) => setConfig(prev => ({ ...prev, customMessage: e.target.value }))}
                  placeholder="Optional message for LPs accessing the dashboard"
                  rows={3}
                />
              </div>
            </div>

            {/* Hidden Metrics */}
            <div className="space-y-4">
              <h3 className="font-medium">Hidden Metrics (LP Protection)</h3>
              <p className="text-sm text-gray-600">Select metrics to hide from LP view</p>

              <div className="grid grid-cols-2 gap-3">
                {LP_HIDDEN_METRICS.map((metric) => (
                  <div key={metric} className="flex items-center space-x-2">
                    <Checkbox
                      id={metric}
                      checked={config.hiddenMetrics.includes(metric)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setConfig(prev => ({
                            ...prev,
                            hiddenMetrics: [...prev.hiddenMetrics, metric]
                          }));
                        } else {
                          setConfig(prev => ({
                            ...prev,
                            hiddenMetrics: prev.hiddenMetrics.filter(m => m !== metric)
                          }));
                        }
                      }}
                    />
                    <Label htmlFor={metric} className="text-sm">
                      {metric.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-4 border-t">
              <Button
                onClick={handleCreateShare}
                disabled={isCreating}
                className="flex-1"
              >
                {isCreating ? 'Creating...' : 'Create Share Link'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setIsOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ShareConfigModal;