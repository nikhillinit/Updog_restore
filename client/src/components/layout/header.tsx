import { Button } from '@/components/ui/button';
import { Download, RefreshCw, DollarSign, UserCircle2, ChevronDown, Bell } from 'lucide-react';
import { useFundContext } from '@/contexts/FundContext';
import { useState } from 'react';
import { Link } from 'wouter';

interface HeaderProps {
  currentModule: {
    title: string;
    description: string;
  };
}

export default function Header({ currentModule }: HeaderProps) {
  const { currentFund } = useFundContext();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleExport = () => {
    // TODO: Fetch portfolio companies for current fund
    console.warn('Export functionality needs portfolio companies data');
    // exportToExcel({ portfolioCompanies: [] }, 'povc-fund-report');
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // Add refresh logic here if needed
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  return (
    <>
      {/* Top Header with Updog branding */}
      <header className="bg-pov-charcoal text-pov-white py-4 px-6 flex items-center justify-between font-poppins">
        <div className="flex items-center">
          <Link to="/dashboard" className="flex items-center">
            <div className="font-inter font-bold text-2xl mr-2">
              <span className="text-pov-white">U</span>pdawg
            </div>
            <span className="text-sm text-charcoal-300">by Press On Ventures</span>
          </Link>
        </div>
        <div className="flex items-center space-x-6">
          {currentFund && (
            <div className="relative">
              <button className="flex items-center space-x-2 bg-white/10 rounded-md px-3 py-2 hover:bg-white/20 transition-colors">
                <span>{currentFund.name}</span>
                <ChevronDown size={16} />
              </button>
            </div>
          )}
          <div className="relative">
            <Bell size={20} className="text-charcoal-300 cursor-pointer" />
          </div>
          <div className="flex items-center space-x-2">
            <UserCircle2 size={32} className="text-charcoal-300" />
            <div className="flex flex-col">
              <span className="text-sm font-medium">Fund Manager</span>
              <span className="text-xs text-charcoal-300">Press On Ventures</span>
            </div>
            <ChevronDown size={16} />
          </div>
        </div>
      </header>

      {/* Module Header */}
      <div className="bg-white shadow-sm border-b border-beige-200 px-6 py-4 font-poppins">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center space-x-4">
              <div>
                <h2 className="text-2xl font-inter font-bold text-pov-charcoal">
                  {currentModule.title}
                </h2>
                <p className="text-charcoal-600 mt-1">{currentModule.description}</p>
              </div>
              {currentFund && (
                <div className="flex items-center space-x-2 bg-pov-gray border border-beige-200 rounded-lg px-4 py-2">
                  <DollarSign className="h-4 w-4 text-pov-charcoal" />
                  <div className="text-sm">
                    <div className="font-semibold text-pov-charcoal">
                      ${(currentFund.size / 1000000).toFixed(0)}M Fund
                    </div>
                    <div className="text-charcoal-600">Active Portfolio</div>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <Button
              onClick={handleExport}
              className="bg-pov-charcoal hover:bg-charcoal-700 text-pov-white shadow-card"
            >
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button
              variant="outline"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="border-beige-200 text-pov-charcoal hover:bg-pov-gray"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
