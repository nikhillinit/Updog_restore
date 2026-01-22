/**
 * Portal Access Denied - GP access guard page
 *
 * Displays 403 Forbidden message when GP users attempt to access
 * the /portal/* namespace. This is a scaffolding placeholder for
 * future LP portal features.
 *
 * @module client/pages/portal/access-denied
 */

import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldX, ArrowLeft, Home } from 'lucide-react';

export default function PortalAccessDenied() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-presson-bg flex items-center justify-center p-6">
      <Card className="max-w-md w-full border-presson-borderSubtle bg-presson-surface">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-presson-negative/10 flex items-center justify-center">
            <ShieldX className="h-8 w-8 text-presson-negative" />
          </div>
          <CardTitle className="text-2xl text-presson-text">Access Denied</CardTitle>
          <CardDescription className="text-presson-textMuted">
            Error 403 - Forbidden
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-6">
          <p className="text-presson-textMuted">
            The LP Portal is not available for GP users. This area is reserved
            for Limited Partners to view their fund commitments and performance.
          </p>

          <div className="p-4 rounded-lg bg-presson-surfaceSubtle border border-presson-borderSubtle">
            <p className="text-sm text-presson-textMuted">
              If you believe you should have access to this area, please contact
              your fund administrator.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              variant="outline"
              onClick={() => window.history.back()}
              className="border-presson-borderSubtle"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Go Back
            </Button>
            <Button
              onClick={() => navigate('/dashboard')}
              className="bg-presson-accent text-presson-accentOn hover:bg-presson-accent/90"
            >
              <Home className="h-4 w-4 mr-2" />
              GP Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
