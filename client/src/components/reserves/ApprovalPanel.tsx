/**
 * Reserve Strategy Approval Panel
 * UI for dual partner approval workflow
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Shield,
  User,
  DollarSign,
  FileText,
  Hash,
} from 'lucide-react';

interface Approval {
  id: string;
  strategyId: string;
  requestedBy: string;
  requestedAt: string;
  action: 'create' | 'update' | 'delete';
  strategyData: Record<string, unknown>;
  reason: string;
  affectedFunds: string[];
  estimatedAmount: number;
  riskLevel: 'low' | 'medium' | 'high';
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  expiresAt: string;
  calculationHash?: string;
  signatures: Array<{
    partnerEmail: string;
    approvedAt: string;
  }>;
  remainingApprovals: number;
}

interface ApprovalDetails extends Approval {
  auditLog: Array<{
    timestamp: string;
    action: string;
    actor: string;
    details?: Record<string, unknown>;
  }>;
  canSign: boolean;
  isExpired: boolean;
  isApproved: boolean;
}

export function ApprovalPanel() {
  const [selectedApproval, setSelectedApproval] = useState<string | null>(null);
  const [showSignDialog, setShowSignDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  
  const queryClient = useQueryClient();

  // Fetch pending approvals
  const { data: pendingApprovals, isLoading } = useQuery({
    queryKey: ['reserve-approvals', 'pending'],
    queryFn: async () => {
      const response = await fetch('/api/v1/reserve-approvals?status=pending');
      if (!response.ok) throw new Error('Failed to fetch approvals');
      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch specific approval details
  const { data: approvalDetails } = useQuery({
    queryKey: ['reserve-approval', selectedApproval],
    queryFn: async () => {
      if (!selectedApproval) return null;
      const response = await fetch(`/api/v1/reserve-approvals/${selectedApproval}`);
      if (!response.ok) throw new Error('Failed to fetch approval details');
      return response.json() as Promise<ApprovalDetails>;
    },
    enabled: !!selectedApproval,
  });

  // Sign approval mutation
  const signMutation = useMutation({
    mutationFn: async ({ id, code }: { id: string; code?: string }) => {
      const response = await fetch(`/api/v1/reserve-approvals/${id}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verificationCode: code }),
      });
      if (!response.ok) throw new Error('Failed to sign approval');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reserve-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['reserve-approval', selectedApproval] });
      setShowSignDialog(false);
      setVerificationCode('');
    },
  });

  // Reject approval mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const response = await fetch(`/api/v1/reserve-approvals/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!response.ok) throw new Error('Failed to reject approval');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reserve-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['reserve-approval', selectedApproval] });
      setShowRejectDialog(false);
      setRejectionReason('');
    },
  });

  const getRiskBadgeColor = (level: string) => {
    switch (level) {
      case 'low': return 'bg-green-100 text-green-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'high': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'rejected': return <XCircle className="h-5 w-5 text-red-500" />;
      case 'expired': return <Clock className="h-5 w-5 text-gray-500" />;
      default: return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    }
  };

  const formatAmount = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  const getTimeRemaining = (expiresAt: string) => {
    const now = Date.now();
    const expires = new Date(expiresAt).getTime();
    const diff = expires - now;
    
    if (diff <= 0) return 'Expired';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} remaining`;
    return `${hours} hour${hours > 1 ? 's' : ''} remaining`;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Reserve Strategy Approvals
          </CardTitle>
          <CardDescription>
            Dual partner approval required for all reserve strategy changes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="pending" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="pending">
                Pending ({pendingApprovals?.total || 0})
              </TabsTrigger>
              <TabsTrigger value="recent">Recent</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
            
            <TabsContent value="pending" className="space-y-4">
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Loading approvals...
                </div>
              ) : pendingApprovals?.approvals?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No pending approvals
                </div>
              ) : (
                pendingApprovals?.approvals?.map((approval: Approval) => (
                  <Card 
                    key={approval.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setSelectedApproval(approval.id)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            {getStatusIcon(approval.status)}
                            <span className="font-semibold">
                              {approval.action.charAt(0).toUpperCase() + approval.action.slice(1)} Strategy
                            </span>
                            <Badge className={getRiskBadgeColor(approval.riskLevel)}>
                              {approval.riskLevel} risk
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Requested by {approval.requestedBy}
                          </p>
                        </div>
                        <Badge variant="outline">
                          {getTimeRemaining(approval.expiresAt)}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pb-3">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-muted-foreground" />
                          <span>{formatAmount(approval.estimatedAmount)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span>{approval.affectedFunds.length} funds affected</span>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                        {approval.reason}
                      </p>
                    </CardContent>
                    <CardFooter className="pt-3 border-t">
                      <div className="flex justify-between items-center w-full">
                        <div className="flex items-center gap-2">
                          {approval.signatures.map((sig, idx) => (
                            <div key={idx} className="flex items-center gap-1">
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                              <span className="text-xs text-muted-foreground">
                                {sig.partnerEmail.split('@')[0]}
                              </span>
                            </div>
                          ))}
                        </div>
                        <span className="text-sm font-medium">
                          {approval.remainingApprovals} approval{approval.remainingApprovals !== 1 ? 's' : ''} needed
                        </span>
                      </div>
                    </CardFooter>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Approval Details Dialog */}
      {approvalDetails && (
        <Dialog open={!!selectedApproval} onOpenChange={() => setSelectedApproval(null)}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {getStatusIcon(approvalDetails.status)}
                Reserve Strategy {approvalDetails.action}
              </DialogTitle>
              <DialogDescription>
                Review and approve changes to reserve allocation strategy
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {/* Risk Assessment */}
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">Risk Assessment</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Risk Level</Label>
                    <Badge className={getRiskBadgeColor(approvalDetails.riskLevel)}>
                      {approvalDetails.riskLevel}
                    </Badge>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Estimated Impact</Label>
                    <p className="font-medium">{formatAmount(approvalDetails.estimatedAmount)}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Affected Funds</Label>
                    <p className="font-medium">{approvalDetails.affectedFunds.length}</p>
                  </div>
                </div>
              </div>

              {/* Reason */}
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">Reason for Change</h4>
                <p className="text-sm text-muted-foreground">{approvalDetails.reason}</p>
              </div>

              {/* Calculation Hash */}
              {approvalDetails.calculationHash && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Hash className="h-4 w-4" />
                    Calculation Verification
                  </h4>
                  <code className="text-xs bg-muted p-2 rounded font-mono block break-all">
                    {approvalDetails.calculationHash}
                  </code>
                </div>
              )}

              {/* Signatures */}
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">Approval Status</h4>
                <div className="space-y-2">
                  {approvalDetails.signatures.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No signatures yet</p>
                  ) : (
                    approvalDetails.signatures.map((sig, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span>{sig.partnerEmail}</span>
                        <span className="text-muted-foreground">
                          approved on {new Date(sig.approvedAt).toLocaleDateString()}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Audit Trail */}
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">Audit Trail</h4>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {approvalDetails.auditLog.map((entry, idx) => (
                    <div key={idx} className="text-xs text-muted-foreground">
                      {new Date(entry.timestamp).toLocaleString()} - {entry.actor} {entry.action}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2">
              {approvalDetails.canSign && !approvalDetails.isExpired && (
                <>
                  <Button
                    variant="destructive"
                    onClick={() => setShowRejectDialog(true)}
                  >
                    Reject
                  </Button>
                  <Button
                    onClick={() => setShowSignDialog(true)}
                  >
                    Approve & Sign
                  </Button>
                </>
              )}
              {approvalDetails.isExpired && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Expired</AlertTitle>
                  <AlertDescription>
                    This approval request has expired and can no longer be signed.
                  </AlertDescription>
                </Alert>
              )}
              {approvalDetails.isApproved && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>Approved</AlertTitle>
                  <AlertDescription>
                    This change has been approved and executed.
                  </AlertDescription>
                </Alert>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Sign Confirmation Dialog */}
      <Dialog open={showSignDialog} onOpenChange={setShowSignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Approval</DialogTitle>
            <DialogDescription>
              Enter your 2FA code to sign this reserve strategy change.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="verification">Verification Code (optional)</Label>
              <Input
                id="verification"
                placeholder="Enter 2FA code for enhanced security"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSignDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (selectedApproval) {
                  signMutation.mutate({ 
                    id: selectedApproval, 
                    code: verificationCode || undefined 
                  });
                }
              }}
              disabled={signMutation.isPending}
            >
              {signMutation.isPending ? 'Signing...' : 'Sign Approval'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Approval</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this reserve strategy change.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reason">Rejection Reason</Label>
              <Textarea
                id="reason"
                placeholder="Enter reason for rejection (min 10 characters)"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={() => {
                if (selectedApproval && rejectionReason.length >= 10) {
                  rejectMutation.mutate({ 
                    id: selectedApproval, 
                    reason: rejectionReason 
                  });
                }
              }}
              disabled={rejectMutation.isPending || rejectionReason.length < 10}
            >
              {rejectMutation.isPending ? 'Rejecting...' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}