/**
 * Loading, latest-route error, and generic error states for the fund model
 * results route.
 *
 * Extracted unchanged from client/src/pages/fund-model-results.tsx.
 *
 * @module client/pages/fund-model-results/states
 */

import { AlertCircle, ArrowLeft } from 'lucide-react';
import { useLocation } from 'wouter';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export function LoadingState() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-24 text-center" role="status">
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-beige-100 rounded w-1/3 mx-auto" />
        <div className="h-4 bg-beige-100 rounded w-1/2 mx-auto" />
        <div className="h-32 bg-beige-100 rounded" />
        <div className="h-32 bg-beige-100 rounded" />
      </div>
    </div>
  );
}

export function LatestErrorState() {
  const [, navigate] = useLocation();
  return (
    <div className="max-w-xl mx-auto px-8 py-24 text-center">
      <Alert className="mb-8 border-beige-200">
        <AlertCircle className="h-5 w-5 text-charcoal-400" />
        <AlertTitle>Invalid results route</AlertTitle>
        <AlertDescription className="font-poppins text-charcoal-500">
          No fund ID specified. Please complete the modeling wizard to view results.
        </AlertDescription>
      </Alert>
      <Button
        variant="outline"
        className="border-charcoal-300 text-charcoal hover:bg-charcoal-50"
        onClick={() => navigate('/fund-setup')}
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Go to Fund Setup
      </Button>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  const [, navigate] = useLocation();
  return (
    <div className="max-w-xl mx-auto px-8 py-24 text-center">
      <Alert className="mb-8 border-beige-200">
        <AlertCircle className="h-5 w-5 text-charcoal-400" />
        <AlertTitle>Error loading results</AlertTitle>
        <AlertDescription className="font-poppins text-charcoal-500">{message}</AlertDescription>
      </Alert>
      <Button
        variant="outline"
        className="border-charcoal-300 text-charcoal hover:bg-charcoal-50"
        onClick={() => navigate('/fund-setup')}
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Fund Setup
      </Button>
    </div>
  );
}
