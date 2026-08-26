import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Filter, Plus } from 'lucide-react';

interface PortfolioCompany {
  id: number;
  name: string;
  sector: string;
  stage: string;
  investmentAmount: string;
  currentValuation: string | null;
  foundedYear: number | null;
  status: string;
  description: string | null;
  dealTags: string[] | null;
}

interface PortfolioTableProps {
  companies?: PortfolioCompany[];
}

export default function PortfolioTable({ companies = [] }: PortfolioTableProps) {
  const getSectorColor = (sector: string) => {
    switch (sector.toLowerCase()) {
      case 'fintech':
        return 'bg-presson-info/10 text-presson-info';
      case 'healthcare':
        return 'bg-success/10 text-success-dark';
      case 'saas':
        return 'bg-presson-info/10 text-presson-info';
      default:
        return 'bg-pov-gray text-charcoal-700';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'growing':
        return 'bg-success/10 text-success-dark';
      case 'scaling':
        return 'bg-presson-info/10 text-presson-info';
      case 'stable':
        return 'bg-warning/10 text-warning-dark';
      default:
        return 'bg-pov-gray text-charcoal-700';
    }
  };

  const formatCurrency = (amount: string) => {
    return `$${(parseFloat(amount) / 1000000).toFixed(1)}M`;
  };

  const calculateMultiple = (current: string | null, investment: string) => {
    if (!current) return 'N/A';
    const multiple = parseFloat(current) / parseFloat(investment);
    return `${multiple.toFixed(2)}x`;
  };

  const getCompanyInitials = (name: string) => {
    return name
      .split(' ')
      .map((word) => word[0]!)
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  if (companies.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold text-pov-charcoal">
              Portfolio Companies
            </CardTitle>
            <div className="flex space-x-3">
              <Button variant="outline" size="sm">
                <Filter className="h-4 w-4 mr-2" />
                Filter
              </Button>
              <Button size="sm" className="povc-bg-primary">
                <Plus className="h-4 w-4 mr-2" />
                Add Company
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-charcoal-500">
            <p>No portfolio companies to display</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-pov-charcoal">
            Portfolio Companies
          </CardTitle>
          <div className="flex space-x-3">
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4 mr-2" />
              Filter
            </Button>
            <Button size="sm" className="povc-bg-primary">
              <Plus className="h-4 w-4 mr-2" />
              Add Company
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-beige-200">
                <th className="text-left py-3 px-4 font-medium text-charcoal-700">Company</th>
                <th className="text-left py-3 px-4 font-medium text-charcoal-700">Sector</th>
                <th className="text-left py-3 px-4 font-medium text-charcoal-700">Stage</th>
                <th className="text-left py-3 px-4 font-medium text-charcoal-700">Tags</th>
                <th className="text-left py-3 px-4 font-medium text-charcoal-700">Investment</th>
                <th className="text-left py-3 px-4 font-medium text-charcoal-700">Current Value</th>
                <th className="text-left py-3 px-4 font-medium text-charcoal-700">Multiple</th>
                <th className="text-left py-3 px-4 font-medium text-charcoal-700">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-beige-200">
              {companies.map((company) => (
                <tr key={company.id} className="hover:bg-pov-gray transition-colors cursor-pointer">
                  <td className="py-4 px-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-presson-info/10 rounded-lg flex items-center justify-center">
                        <span className="text-presson-info font-medium text-sm">
                          {getCompanyInitials(company.name)}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-pov-charcoal">{company.name}</p>
                        <p className="text-sm text-charcoal-600">
                          Founded {company.foundedYear || 'N/A'}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <Badge className={getSectorColor(company.sector)}>{company.sector}</Badge>
                  </td>
                  <td className="py-4 px-4">
                    <span className="text-charcoal-700">{company.stage}</span>
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex flex-wrap gap-1">
                      {company.dealTags && company.dealTags.length > 0 ? (
                        company.dealTags.slice(0, 3).map((tag, idx) => (
                          <Badge
                            key={idx}
                            variant="outline"
                            className="text-xs bg-presson-info/10 text-presson-info border-presson-info/20"
                          >
                            {tag}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-charcoal-400 text-sm">No tags</span>
                      )}
                      {company.dealTags && company.dealTags.length > 3 && (
                        <Badge variant="outline" className="text-xs bg-pov-gray text-charcoal-600">
                          +{company.dealTags.length - 3}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <span className="font-medium text-pov-charcoal">
                      {formatCurrency(company.investmentAmount)}
                    </span>
                  </td>
                  <td className="py-4 px-4">
                    <span className="font-medium text-pov-charcoal">
                      {company.currentValuation ? formatCurrency(company.currentValuation) : 'N/A'}
                    </span>
                  </td>
                  <td className="py-4 px-4">
                    <span className="font-medium text-presson-positive">
                      {calculateMultiple(company.currentValuation, company.investmentAmount)}
                    </span>
                  </td>
                  <td className="py-4 px-4">
                    <Badge className={getStatusColor(company.status)}>{company.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
