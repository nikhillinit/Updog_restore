/**
 * Notion Integration Hub
 * Central management interface for all Notion workspace connections and data sync
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Plus,
  Zap,
  Database,
  Users,
  Settings,
  CheckCircle,
  AlertTriangle,
  Clock,
  Trash2,
  Edit,
  Play,
  Pause,
  RefreshCw,
  ExternalLink,
  FileText,
  TrendingUp,
  Activity,
  Briefcase,
  Target,
  Calendar,
  Bell,
  Shield
} from 'lucide-react';

// Mock data types (replace with actual API types)
interface NotionWorkspace {
  id: string;
  name: string;
  status: 'active' | 'error' | 'pending';
  connectedAt: string;
  lastSyncAt?: string;
  databaseCount: number;
  syncedRecords: number;
}

interface NotionDatabase {
  id: string;
  name: string;
  type: string;
  recordCount: number;
  lastSyncAt?: string;
  syncStatus: 'synced' | 'syncing' | 'error' | 'never';
  mappingType: string;
}

interface SyncJob {
  id: string;
  type: string;
  status: 'running' | 'completed' | 'failed';
  progress: number;
  startedAt: string;
  completedAt?: string;
  recordsProcessed: number;
  errors: string[];
}

// Mock data
const MOCK_WORKSPACES: NotionWorkspace[] = [
  {
    id: 'ws-1',
    name: 'Fund Team Workspace',
    status: 'active',
    connectedAt: '2024-01-15T10:00:00Z',
    lastSyncAt: '2024-01-29T14:30:00Z',
    databaseCount: 8,
    syncedRecords: 247
  },
  {
    id: 'ws-2',
    name: 'Portfolio Companies Hub',
    status: 'active',
    connectedAt: '2024-01-20T15:30:00Z',
    lastSyncAt: '2024-01-29T13:45:00Z',
    databaseCount: 15,
    syncedRecords: 1892
  }
];

const MOCK_DATABASES: NotionDatabase[] = [
  {
    id: 'db-1',
    name: 'Deal Pipeline',
    type: 'investments',
    recordCount: 45,
    lastSyncAt: '2024-01-29T14:30:00Z',
    syncStatus: 'synced',
    mappingType: 'Investment Tracking'
  },
  {
    id: 'db-2',
    name: 'Portfolio KPIs',
    type: 'kpi_tracking',
    recordCount: 156,
    lastSyncAt: '2024-01-29T13:45:00Z',
    syncStatus: 'synced',
    mappingType: 'KPI Metrics'
  },
  {
    id: 'db-3',
    name: 'Board Reports',
    type: 'board_reports',
    recordCount: 78,
    lastSyncAt: '2024-01-29T12:15:00Z',
    syncStatus: 'error',
    mappingType: 'Board Materials'
  }
];

const MOCK_SYNC_JOBS: SyncJob[] = [
  {
    id: 'job-1',
    type: 'Full Sync - Portfolio KPIs',
    status: 'completed',
    progress: 100,
    startedAt: '2024-01-29T13:45:00Z',
    completedAt: '2024-01-29T13:47:32Z',
    recordsProcessed: 156,
    errors: []
  },
  {
    id: 'job-2',
    type: 'Incremental Sync - Deal Pipeline',
    status: 'running',
    progress: 65,
    startedAt: '2024-01-29T14:30:00Z',
    recordsProcessed: 29,
    errors: []
  }
];

export const NotionIntegrationHub: React.FC = () => {
  const [workspaces] = useState<NotionWorkspace[]>(MOCK_WORKSPACES);
  const [databases] = useState<NotionDatabase[]>(MOCK_DATABASES);
  const [syncJobs] = useState<SyncJob[]>(MOCK_SYNC_JOBS);
  const [selectedTab, setSelectedTab] = useState('overview');
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
      case 'synced':
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'error':
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'pending':
      case 'syncing':
      case 'running':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
      case 'synced':
      case 'completed':
        return <CheckCircle className="h-4 w-4" />;
      case 'error':
      case 'failed':
        return <AlertTriangle className="h-4 w-4" />;
      case 'pending':
      case 'syncing':
      case 'running':
        return <Clock className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const totalSyncedRecords = workspaces.reduce((sum, ws) => sum + ws.syncedRecords, 0);
  const totalDatabases = workspaces.reduce((sum, ws) => sum + ws.databaseCount, 0);
  const activeSyncJobs = syncJobs.filter(job => job.status === 'running').length;
  const errorDatabases = databases.filter(db => db.syncStatus === 'error').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notion Integration</h1>
          <p className="text-gray-600">
            Connect and sync data from Notion workspaces across your fund and portfolio companies
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
          <Dialog open={isConnectModalOpen} onOpenChange={setIsConnectModalOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Connect Workspace
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Connect Notion Workspace</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <Alert>
                  <Shield className="h-4 w-4" />
                  <AlertDescription>
                    You'll be redirected to Notion to authorize access. We only request permissions needed for data synchronization.
                  </AlertDescription>
                </Alert>
                <div className="space-y-2">
                  <Label>Workspace Type</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select workspace type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fund">Fund Team Workspace</SelectItem>
                      <SelectItem value="portfolio">Portfolio Company Workspace</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2 pt-4">
                  <Button className="flex-1">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Connect to Notion
                  </Button>
                  <Button variant="outline" onClick={() => setIsConnectModalOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Connected Workspaces</p>
                <p className="text-2xl font-bold">{workspaces.length}</p>
              </div>
              <Database className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Synced Records</p>
                <p className="text-2xl font-bold">{totalSyncedRecords.toLocaleString()}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Active Databases</p>
                <p className="text-2xl font-bold">{totalDatabases}</p>
              </div>
              <FileText className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Active Syncs</p>
                <p className="text-2xl font-bold">{activeSyncJobs}</p>
                {errorDatabases > 0 && (
                  <p className="text-xs text-red-600">{errorDatabases} errors</p>
                )}
              </div>
              <Activity className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="databases">Databases</TabsTrigger>
          <TabsTrigger value="portfolio">Portfolio Companies</TabsTrigger>
          <TabsTrigger value="activity">Sync Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Connected Workspaces */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Connected Workspaces
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {workspaces.map(workspace => (
                  <div key={workspace.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <div>
                        <h3 className="font-semibold">{workspace.name}</h3>
                        <p className="text-sm text-gray-600">
                          Connected {formatDate(workspace.connectedAt)} • {workspace.databaseCount} databases
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-medium">{workspace.syncedRecords} records</p>
                        <p className="text-xs text-gray-500">
                          Last sync: {workspace.lastSyncAt ? formatDate(workspace.lastSyncAt) : 'Never'}
                        </p>
                      </div>
                      <Badge className={getStatusColor(workspace.status)}>
                        {getStatusIcon(workspace.status)}
                        <span className="ml-1 capitalize">{workspace.status}</span>
                      </Badge>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm">
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Settings className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Recent Sync Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Recent Sync Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {syncJobs.map(job => (
                  <div key={job.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <div>
                        <h3 className="font-semibold">{job.type}</h3>
                        <p className="text-sm text-gray-600">
                          Started {formatDate(job.startedAt)} • {job.recordsProcessed} records processed
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {job.status === 'running' && (
                        <div className="flex items-center gap-2">
                          <Progress value={job.progress} className="w-24" />
                          <span className="text-sm text-gray-600">{job.progress}%</span>
                        </div>
                      )}
                      <Badge className={getStatusColor(job.status)}>
                        {getStatusIcon(job.status)}
                        <span className="ml-1 capitalize">{job.status}</span>
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="databases" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Database Mappings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {databases.map(database => (
                  <div key={database.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <div>
                        <h3 className="font-semibold">{database.name}</h3>
                        <p className="text-sm text-gray-600">
                          {database.mappingType} • {database.recordCount} records
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <Badge className={getStatusColor(database.syncStatus)}>
                          {getStatusIcon(database.syncStatus)}
                          <span className="ml-1 capitalize">{database.syncStatus}</span>
                        </Badge>
                        <p className="text-xs text-gray-500 mt-1">
                          {database.lastSyncAt ? `Last sync: ${formatDate(database.lastSyncAt)}` : 'Never synced'}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm">
                          <Play className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="portfolio" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                Portfolio Company Integrations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <Users className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Portfolio Company Integrations</h3>
                <p className="text-gray-600 mb-6">
                  Connect your portfolio companies' Notion workspaces to automatically sync board reports, KPIs, and updates.
                </p>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Invite Portfolio Company
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Sync History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {syncJobs.map(job => (
                  <div key={job.id} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold">{job.type}</h3>
                      <Badge className={getStatusColor(job.status)}>
                        {getStatusIcon(job.status)}
                        <span className="ml-1 capitalize">{job.status}</span>
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600">
                      <div>
                        <span className="font-medium">Started:</span>
                        <br />
                        {formatDate(job.startedAt)}
                      </div>
                      <div>
                        <span className="font-medium">Records:</span>
                        <br />
                        {job.recordsProcessed}
                      </div>
                      <div>
                        <span className="font-medium">Progress:</span>
                        <br />
                        {job.progress}%
                      </div>
                      <div>
                        <span className="font-medium">Status:</span>
                        <br />
                        {job.status === 'running' ? 'In Progress' : job.completedAt ? formatDate(job.completedAt) : 'Failed'}
                      </div>
                    </div>
                    {job.errors.length > 0 && (
                      <Alert className="mt-3">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          {job.errors.length} error(s) occurred during sync. Click to view details.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default NotionIntegrationHub;