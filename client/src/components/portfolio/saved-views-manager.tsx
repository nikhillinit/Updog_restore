/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Save,
  Eye,
  MoreVertical,
  Edit,
  Trash2,
  Share,
  Download,
  Calendar,
  User,
  FileText,
  BarChart3,
  LineChart,
  PieChart,
  TrendingUp,
} from 'lucide-react';

interface AnalyticsView {
  id: string;
  name: string;
  description: string;
  chartType: 'bar' | 'line' | 'pie' | 'area';
  xAxis: string;
  yAxis: string;
  groupBy?: string;
  filters: Record<string, any>;
  notes: string;
  createdAt: string;
  lastModified: string;
  createdBy: string;
  isShared: boolean;
  tags: string[];
}

interface SavedViewsManagerProps {
  views: AnalyticsView[];
  onViewLoad: (_view: AnalyticsView) => void;
  onViewSave: (_view: Omit<AnalyticsView, 'id' | 'createdAt' | 'lastModified'>) => void;
  onViewUpdate: (_id: string, _view: Partial<AnalyticsView>) => void;
  onViewDelete: (_id: string) => void;
  currentView?: Partial<AnalyticsView>;
}

const CHART_TYPE_ICONS = {
  bar: BarChart3,
  line: LineChart,
  pie: PieChart,
  area: TrendingUp,
};

export default function SavedViewsManager({
  views,
  onViewLoad,
  onViewSave,
  onViewUpdate,
  onViewDelete,
  currentView,
}: SavedViewsManagerProps) {
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingView, setEditingView] = useState<AnalyticsView | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  
  // Form states
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    notes: '',
    tags: [] as string[],
    isShared: false,
  });

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      notes: '',
      tags: [],
      isShared: false,
    });
  };

  const handleSaveView = () => {
    if (!currentView || !formData.name.trim()) return;
    
    const newView: Omit<AnalyticsView, 'id' | 'createdAt' | 'lastModified'> = {
      name: formData.name,
      description: formData.description,
      chartType: currentView.chartType || 'bar',
      xAxis: currentView.xAxis || '',
      yAxis: currentView.yAxis || '',
      ...(currentView.groupBy !== undefined ? { groupBy: currentView.groupBy } : {}),
      filters: currentView.filters || {},
      notes: formData.notes,
      createdBy: 'Current User', // Replace with actual user
      isShared: formData.isShared,
      tags: formData.tags,
    };
    
    onViewSave(newView);
    setShowSaveDialog(false);
    resetForm();
  };

  const handleEditView = () => {
    if (!editingView || !formData.name.trim()) return;
    
    onViewUpdate(editingView.id, {
      name: formData.name,
      description: formData.description,
      notes: formData.notes,
      tags: formData.tags,
      isShared: formData.isShared,
      lastModified: new Date().toISOString(),
    });
    
    setShowEditDialog(false);
    setEditingView(null);
    resetForm();
  };

  const startEdit = (view: AnalyticsView) => {
    setEditingView(view);
    setFormData({
      name: view.name,
      description: view.description,
      notes: view.notes,
      tags: view.tags,
      isShared: view.isShared,
    });
    setShowEditDialog(true);
  };

  const filteredViews = views.filter(view => {
    const matchesSearch = view.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         view.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTags = selectedTags.length === 0 || 
                       selectedTags.some(tag => view.tags.includes(tag));
    return matchesSearch && matchesTags;
  });

  const allTags = Array.from(new Set(views.flatMap(view => view.tags)));

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getChartTypeIcon = (type: string) => {
    const Icon = CHART_TYPE_ICONS[type as keyof typeof CHART_TYPE_ICONS] || BarChart3;
    return Icon;
  };

  return (
    <div className="space-y-6">
      {/* Header with Save Button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Saved Analytics Views</h2>
          <p className="text-sm text-gray-600">
            Manage your custom analysis configurations and insights
          </p>
        </div>
        
        <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
          <DialogTrigger asChild>
            <Button>
              <Save className="h-4 w-4 mr-2" />
              Save Current View
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save Analytics View</DialogTitle>
              <DialogDescription>
                Save your current chart configuration for quick access later
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                placeholder="View name (required)"
                value={formData.name}
                onChange={(e: any) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              />
              <Input
                placeholder="Description (optional)"
                value={formData.description}
                onChange={(e: any) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              />
              <Textarea
                placeholder="Analysis notes and insights..."
                value={formData.notes}
                onChange={(e: any) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                rows={3}
              />
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveView} disabled={!formData.name.trim()}>
                  Save View
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center space-x-4">
        <div className="flex-1">
          <Input
            placeholder="Search saved views..."
            value={searchTerm}
            onChange={(e: any) => setSearchTerm(e.target.value)}
          />
        </div>
        {allTags.length > 0 && (
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Tags:</span>
            {allTags.map(tag => (
              <Badge
                key={tag}
                variant={selectedTags.includes(tag) ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => {
                  setSelectedTags(prev =>
                    prev.includes(tag)
                      ? prev.filter(t => t !== tag)
                      : [...prev, tag]
                  );
                }}
              >
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Views Grid */}
      <div className="grid gap-4">
        {filteredViews.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <Eye className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No saved views yet</h3>
              <p className="text-gray-600 mb-4">
                Create custom chart configurations to save them for quick access
              </p>
              <Button onClick={() => setShowSaveDialog(true)}>
                <Save className="h-4 w-4 mr-2" />
                Save Your First View
              </Button>
            </CardContent>
          </Card>
        ) : (
          filteredViews.map((view: any) => {
            const ChartIcon = getChartTypeIcon(view.chartType);
            return (
              <Card key={view.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3 flex-1">
                      <div className="bg-blue-100 p-2 rounded">
                        <ChartIcon className="h-5 w-5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-900 mb-1">{view.name}</h3>
                        {view.description && (
                          <p className="text-sm text-gray-600 mb-2">{view.description}</p>
                        )}
                        
                        <div className="flex items-center space-x-4 text-xs text-gray-500 mb-2">
                          <div className="flex items-center">
                            <Calendar className="h-3 w-3 mr-1" />
                            {formatDate(view.createdAt)}
                          </div>
                          <div className="flex items-center">
                            <User className="h-3 w-3 mr-1" />
                            {view.createdBy}
                          </div>
                          {view.notes && (
                            <div className="flex items-center">
                              <FileText className="h-3 w-3 mr-1" />
                              Has notes
                            </div>
                          )}
                        </div>

                        <div className="flex items-center space-x-2">
                          <Badge variant="outline" className="text-xs">
                            {view.chartType} chart
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {view.yAxis} by {view.xAxis}
                          </Badge>
                          {view.isShared && (
                            <Badge variant="secondary" className="text-xs">
                              Shared
                            </Badge>
                          )}
                        </div>

                        {view.tags.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {view.tags.map((tag: string) => (
                              <Badge key={tag} variant="outline" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onViewLoad(view)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Load
                      </Button>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => startEdit(view)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Share className="h-4 w-4 mr-2" />
                            Share
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Download className="h-4 w-4 mr-2" />
                            Export
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => onViewDelete(view.id)}
                            className="text-red-600"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  
                  {view.notes && (
                    <div className="mt-3 p-3 bg-gray-50 rounded text-sm">
                      <div className="font-medium text-gray-700 mb-1">Analysis Notes:</div>
                      <div className="text-gray-600">{view.notes}</div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Analytics View</DialogTitle>
            <DialogDescription>
              Update the details for this saved view
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="View name (required)"
              value={formData.name}
              onChange={(e: any) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            />
            <Input
              placeholder="Description (optional)"
              value={formData.description}
              onChange={(e: any) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            />
            <Textarea
              placeholder="Analysis notes and insights..."
              value={formData.notes}
              onChange={(e: any) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              rows={3}
            />
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setShowEditDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleEditView} disabled={!formData.name.trim()}>
                Update View
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
