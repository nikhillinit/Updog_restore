/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { 
  Edit3, 
  Save, 
  Download, 
  History, 
  Phone, 
  Mail,
  Globe,
  MapPin,
  Calendar,
  DollarSign,
  Users
} from 'lucide-react';

interface MobileTearSheetProps {
  tearSheet: {
    id: string;
    companyName: string;
    sector: string;
    stage: string;
    lastModified: string;
    modifiedBy: string;
    version: number;
    status: 'draft' | 'review' | 'published';
    data: {
      website: string;
      fiscalYear: string;
      location: string;
      investmentLead: string;
      percentOfFund: string;
      classification: string;
      collection: string;
      expectedExitValue: string;
      founderMaturity: string;
      boardComposition: string[];
      coInvestors: string[];
      dealTeamNotes: string;
      factorRating: string;
      health: string;
      likeCompany: string;
      parentEntity: string;
      proRata: string;
      revenueNotes: string;
    };
    commentary: {
      id: string;
      content: string;
      author: string;
      createdAt: string;
      version: number;
      previousAnswer?: string;
    };
    contacts: {
      name: string;
      role: string;
      initial: string;
      color: string;
    }[];
  };
  onCommentaryUpdate: (_newCommentary: string) => void;
  onExport: () => void;
}

export default function MobileTearSheet({ tearSheet, onCommentaryUpdate, onExport }: MobileTearSheetProps) {
  const [isEditingCommentary, setIsEditingCommentary] = useState(false);
  const [commentaryDraft, setCommentaryDraft] = useState(tearSheet.commentary.content);

  const handleSaveCommentary = () => {
    onCommentaryUpdate(commentaryDraft);
    setIsEditingCommentary(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published': return 'bg-green-100 text-green-800';
      case 'review': return 'bg-yellow-100 text-yellow-800';
      case 'draft': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getHealthColor = (health: string) => {
    switch (health.toLowerCase()) {
      case 'healthy': return 'bg-green-100 text-green-800';
      case "jury's out": return 'bg-yellow-100 text-yellow-800';
      case 'concern': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-6">
      {/* Mobile Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">
                {tearSheet.companyName.charAt(0)}
              </span>
            </div>
            <div>
              <h1 className="text-lg font-bold">{tearSheet.companyName}</h1>
              <div className="flex items-center space-x-2">
                <Badge className={getStatusColor(tearSheet.status)}>
                  {tearSheet.status}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  v{tearSheet.version}
                </Badge>
              </div>
            </div>
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[300px]">
              <SheetHeader>
                <SheetTitle>Actions</SheetTitle>
              </SheetHeader>
              <div className="grid grid-cols-2 gap-3 mt-4">
                <Button variant="outline" onClick={onExport}>
                  <Download className="h-4 w-4 mr-2" />
                  Export PDF
                </Button>
                <Button variant="outline">
                  <History className="h-4 w-4 mr-2" />
                  View History
                </Button>
                <Button variant="outline">
                  <Mail className="h-4 w-4 mr-2" />
                  Share
                </Button>
                <Button variant="outline">
                  <Edit3 className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Company Overview Card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Company Overview</CardTitle>
              <Button variant="ghost" size="sm">
                <Globe className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="flex items-center text-gray-500 text-xs mb-1">
                  <Calendar className="h-3 w-3 mr-1" />
                  FISCAL YEAR
                </div>
                <div className="font-medium">{tearSheet.data.fiscalYear}</div>
              </div>
              <div>
                <div className="flex items-center text-gray-500 text-xs mb-1">
                  <MapPin className="h-3 w-3 mr-1" />
                  LOCATION
                </div>
                <div className="font-medium">{tearSheet.data.location}</div>
              </div>
              <div>
                <div className="flex items-center text-gray-500 text-xs mb-1">
                  <Users className="h-3 w-3 mr-1" />
                  INVESTMENT LEAD
                </div>
                <div className="font-medium">{tearSheet.data.investmentLead}</div>
              </div>
              <div>
                <div className="flex items-center text-gray-500 text-xs mb-1">
                  <DollarSign className="h-3 w-3 mr-1" />
                  % OF FUND
                </div>
                <div className="font-medium">{tearSheet.data.percentOfFund}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Key Metrics Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Key Metrics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="text-xs text-gray-500 uppercase mb-1">Classification</div>
                <Badge variant="outline">{tearSheet.data.classification}</Badge>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="text-xs text-gray-500 uppercase mb-1">Expected Exit</div>
                <div className="font-medium">{tearSheet.data.expectedExitValue}</div>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="text-xs text-gray-500 uppercase mb-1">Health</div>
                <Badge className={getHealthColor(tearSheet.data.health)}>
                  {tearSheet.data.health}
                </Badge>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="text-xs text-gray-500 uppercase mb-1">Pro Rata</div>
                <div className="font-medium text-sm">{tearSheet.data.proRata}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contacts Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Contacts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {tearSheet.contacts.map((contact, idx) => (
                <div key={idx} className="flex items-center space-x-3 p-2 rounded-lg bg-gray-50">
                  <div className={`w-10 h-10 rounded-full ${contact.color} text-white text-sm flex items-center justify-center font-medium`}>
                    {contact.initial}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{contact.name}</div>
                    {contact.role && <div className="text-sm text-gray-500">{contact.role}</div>}
                  </div>
                  <div className="flex space-x-2">
                    <Button variant="ghost" size="sm">
                      <Phone className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm">
                      <Mail className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Expandable Sections */}
        <Accordion type="multiple" className="space-y-2">
          {/* Board Composition */}
          <AccordionItem value="board" className="border rounded-lg px-4 bg-white">
            <AccordionTrigger className="text-sm font-medium">
              Board Composition ({tearSheet.data.boardComposition.length})
            </AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-wrap gap-2 pt-2">
                {tearSheet.data.boardComposition.map((member, idx) => (
                  <Badge key={idx} variant="secondary" className="text-xs">
                    {member}
                  </Badge>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Co-Investors */}
          <AccordionItem value="investors" className="border rounded-lg px-4 bg-white">
            <AccordionTrigger className="text-sm font-medium">
              Co-Investors ({tearSheet.data.coInvestors.length})
            </AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-wrap gap-2 pt-2">
                {tearSheet.data.coInvestors.map((investor, idx) => (
                  <Badge key={idx} variant="outline" className="text-xs">
                    {investor}
                  </Badge>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Deal Team Notes */}
          {tearSheet.data.dealTeamNotes && (
            <AccordionItem value="notes" className="border rounded-lg px-4 bg-white">
              <AccordionTrigger className="text-sm font-medium">
                Deal Team Notes
              </AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-gray-700 pt-2">{tearSheet.data.dealTeamNotes}</p>
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>

        {/* Commentary Section */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Company Sentiment</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditingCommentary(!isEditingCommentary)}
              >
                <Edit3 className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {tearSheet.commentary.previousAnswer && (
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="text-xs text-gray-500 mb-2">Previous answer (as of Q4 2024)</div>
                <p className="text-sm italic">{tearSheet.commentary.previousAnswer}</p>
              </div>
            )}
            
            {isEditingCommentary ? (
              <div className="space-y-3">
                <Textarea
                  value={commentaryDraft}
                  onChange={(e) => setCommentaryDraft(e.target.value)}
                  placeholder="Enter your commentary..."
                  rows={6}
                  className="text-sm"
                />
                <div className="flex space-x-2">
                  <Button size="sm" onClick={handleSaveCommentary} className="flex-1">
                    <Save className="h-4 w-4 mr-2" />
                    Save
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setIsEditingCommentary(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-sm">{tearSheet.commentary.content}</p>
              </div>
            )}
            
            <div className="text-xs text-gray-500 flex items-center justify-between">
              <span>Version {tearSheet.commentary.version} by {tearSheet.commentary.author}</span>
              <span>{new Date(tearSheet.commentary.createdAt).toLocaleDateString()}</span>
            </div>
          </CardContent>
        </Card>

        {/* Last Modified Footer */}
        <div className="text-center py-4 text-xs text-gray-500">
          Last modified by {tearSheet.modifiedBy} on {new Date(tearSheet.lastModified).toLocaleDateString()}
        </div>
      </div>
    </div>
  );
}
