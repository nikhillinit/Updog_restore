/**
 * Documents Widget
 *
 * Dashboard widget showing recent documents with quick access.
 *
 * @module client/components/lp/DocumentsWidget
 */

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useLPRecentDocuments, type LPDocument, type DocumentType } from '@/hooks/useLPDocuments';
import { FileText, Download, ArrowRight, Sparkles } from 'lucide-react';
import { useLocation } from 'wouter';

// ============================================================================
// HELPERS
// ============================================================================

const getDocumentTypeLabel = (type: DocumentType): string => {
  const labels: Record<DocumentType, string> = {
    k1: 'K-1',
    capital_statement: 'Capital Statement',
    quarterly_report: 'Quarterly Report',
    annual_report: 'Annual Report',
    subscription_agreement: 'Subscription',
    side_letter: 'Side Letter',
    legal: 'Legal',
    tax: 'Tax',
    other: 'Other',
  };
  return labels[type] || type;
};

const getDocumentTypeColor = (type: DocumentType): string => {
  const colors: Record<DocumentType, string> = {
    k1: 'bg-purple-500',
    capital_statement: 'bg-blue-500',
    quarterly_report: 'bg-green-500',
    annual_report: 'bg-indigo-500',
    subscription_agreement: 'bg-orange-500',
    side_letter: 'bg-pink-500',
    legal: 'bg-gray-500',
    tax: 'bg-red-500',
    other: 'bg-gray-400',
  };
  return colors[type] || 'bg-gray-500';
};

const formatFileSize = (bytes: number): string => {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(0)} KB`;
  return `${bytes} B`;
};

const isNewDocument = (createdAt: string): boolean => {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  return new Date(createdAt) > oneWeekAgo;
};

// ============================================================================
// COMPONENT
// ============================================================================

export function DocumentsWidget() {
  const { data, isLoading } = useLPRecentDocuments({ limit: 4 });
  const [, navigate] = useLocation();

  const handleDownload = (doc: LPDocument, e: React.MouseEvent) => {
    e.stopPropagation();
    // In real implementation, this would trigger a download
    window.open(doc.downloadUrl, '_blank');
  };

  if (isLoading) {
    return (
      <Card className="bg-white rounded-xl border border-[#E0D8D1] shadow-md">
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-60" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white rounded-xl border border-[#E0D8D1] shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-inter text-[#292929]">
          <FileText className="h-5 w-5 text-indigo-600" />
          Documents
          {data?.hasNewDocuments && <Sparkles className="h-4 w-4 text-yellow-500" />}
        </CardTitle>
        <CardDescription className="font-poppins text-[#292929]/70">
          {data?.totalDocuments
            ? `${data.totalDocuments} document${data.totalDocuments !== 1 ? 's' : ''} available`
            : 'Fund documents and reports'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data?.recentDocuments && data.recentDocuments.length > 0 ? (
          <div className="space-y-3">
            {data.recentDocuments.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between p-3 border border-[#E0D8D1] rounded-lg hover:bg-gray-50 cursor-pointer group"
                onClick={() => navigate(`/lp/documents/${doc.id}`)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-lg ${getDocumentTypeColor(doc.documentType)} flex items-center justify-center`}
                  >
                    <FileText className="h-5 w-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium font-inter text-sm truncate">{doc.title}</span>
                      {isNewDocument(doc.createdAt) && (
                        <Badge variant="default" className="bg-yellow-500 text-xs">
                          New
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[#292929]/60 font-poppins">
                      <Badge variant="outline" className="text-xs">
                        {getDocumentTypeLabel(doc.documentType)}
                      </Badge>
                      <span>{formatFileSize(doc.fileSizeBytes)}</span>
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => handleDownload(doc, e)}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-[#292929]/60 font-poppins">
            <FileText className="h-10 w-10 mx-auto mb-2 text-[#292929]/30" />
            <p>No documents available</p>
          </div>
        )}

        {/* View All Button */}
        <Button
          variant="ghost"
          className="w-full mt-4 font-poppins"
          onClick={() => navigate('/lp/documents')}
        >
          View All Documents
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </CardContent>
    </Card>
  );
}

export default DocumentsWidget;
