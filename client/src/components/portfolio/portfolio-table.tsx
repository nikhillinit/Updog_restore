import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Filter, Plus } from "lucide-react";

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
      case 'fintech': return 'bg-blue-50 text-blue-700';
      case 'healthcare': return 'bg-green-50 text-green-700';
      case 'saas': return 'bg-purple-50 text-purple-700';
      default: return 'bg-gray-50 text-gray-700';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'growing': return 'bg-green-50 text-green-700';
      case 'scaling': return 'bg-blue-50 text-blue-700';
      case 'stable': return 'bg-yellow-50 text-yellow-700';
      default: return 'bg-gray-50 text-gray-700';
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
    return name.split(' ')
      .map(word => word[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  if (companies.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold text-gray-800">
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
          <div className="text-center py-8 text-gray-500">
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
          <CardTitle className="text-lg font-semibold text-gray-800">
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
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-medium text-gray-700">Company</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700">Sector</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700">Stage</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700">Tags</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700">Investment</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700">Current Value</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700">Multiple</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {companies.map((company) => (
                <tr key={company.id} className="hover:bg-gray-50 transition-colors cursor-pointer">
                  <td className="py-4 px-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <span className="text-blue-600 font-medium text-sm">
                          {getCompanyInitials(company.name)}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-800">{company.name}</p>
                        <p className="text-sm text-gray-600">
                          Founded {company.foundedYear || 'N/A'}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <Badge className={getSectorColor(company.sector)}>
                      {company.sector}
                    </Badge>
                  </td>
                  <td className="py-4 px-4">
                    <span className="text-gray-700">{company.stage}</span>
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex flex-wrap gap-1">
                      {company.dealTags && company.dealTags.length > 0 ? (
                        company.dealTags.slice(0, 3).map((tag, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                            {tag}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-gray-400 text-sm">No tags</span>
                      )}
                      {company.dealTags && company.dealTags.length > 3 && (
                        <Badge variant="outline" className="text-xs bg-gray-50 text-gray-600">
                          +{company.dealTags.length - 3}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <span className="font-medium text-gray-800">
                      {formatCurrency(company.investmentAmount)}
                    </span>
                  </td>
                  <td className="py-4 px-4">
                    <span className="font-medium text-gray-800">
                      {company.currentValuation ? formatCurrency(company.currentValuation) : 'N/A'}
                    </span>
                  </td>
                  <td className="py-4 px-4">
                    <span className="font-medium text-green-600">
                      {calculateMultiple(company.currentValuation, company.investmentAmount)}
                    </span>
                  </td>
                  <td className="py-4 px-4">
                    <Badge className={getStatusColor(company.status)}>
                      {company.status}
                    </Badge>
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
