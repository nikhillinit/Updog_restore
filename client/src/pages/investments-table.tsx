/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { useFundContext } from '@/contexts/FundContext';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useLocation } from 'wouter';
import EnhancedInvestmentsTable from '@/components/investments/enhanced-investments-table';

export default function InvestmentsTable() {
  const { currentFund } = useFundContext();
  const [, setLocation] = useLocation();

  if (!currentFund) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <p className="text-gray-500">Please select a fund to view investments.</p>
          <Button className="mt-4" onClick={() => setLocation('/setup')}>
            Set Up Fund
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation('/investments')}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Investments
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Enhanced Investments Table</h1>
                <p className="text-sm text-gray-600">
                  Comprehensive portfolio view with advanced filtering and tag management
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <EnhancedInvestmentsTable />
      </div>
    </div>
  );
}
