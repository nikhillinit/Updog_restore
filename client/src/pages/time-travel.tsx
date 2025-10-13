import { useState, useMemo } from 'react';
import { useFundContext } from '@/contexts/FundContext';
import {
  useTimelineData,
  usePointInTimeState,
  useStateComparison,
  useCreateSnapshot,
  useRestoreSnapshot
} from '@/hooks/useTimelineData';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ErrorState,
  StatCard,
  StatCardGrid,
  TimelineChart,
  EventTimelineChart
} from '@/components/analytics';
import {
  Clock,
  Camera,
  GitBranch,
  RotateCcw,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  History,
  Zap,
  Database,
  Activity
} from 'lucide-react';
import { format, parseISO, subDays, addDays } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { spreadIfDefined } from '@/lib/spreadIfDefined';

export default function TimeTravelPage() {
  const { currentFund } = useFundContext();
  const [selectedTimeRange, setSelectedTimeRange] = useState({
    start: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd')
  });
  const [selectedTimestamp1, setSelectedTimestamp1] = useState<string>('');
  const [selectedTimestamp2, setSelectedTimestamp2] = useState<string>('');
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentViewTime, setCurrentViewTime] = useState<string>('');
  const [createSnapshotDialogOpen, setCreateSnapshotDialogOpen] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<number | null>(null);
  const [confirmationCode, setConfirmationCode] = useState('');

  // Hooks
  const {
    data: timelineData,
    isLoading: timelineLoading,
    error: timelineError,
    refetch: refetchTimeline
  } = useTimelineData(currentFund?.id || 0, {
    startTime: `${selectedTimeRange.start}T00:00:00Z`,
    endTime: `${selectedTimeRange.end}T23:59:59Z`,
    limit: 100
  });

  const {
    data: pointInTimeData,
    isLoading: pointInTimeLoading,
    error: pointInTimeError
  } = usePointInTimeState(
    currentFund?.id || 0,
    currentViewTime || new Date().toISOString(),
    true
  );

  const {
    data: comparisonData,
    isLoading: comparisonLoading,
    error: comparisonError
  } = useStateComparison(
    currentFund?.id || 0,
    selectedTimestamp1,
    selectedTimestamp2,
    true
  );

  const createSnapshotMutation = useCreateSnapshot();
  const restoreSnapshotMutation = useRestoreSnapshot();

  // Process timeline data for visualization
  const timelineChartData = useMemo(() => {
    if (!timelineData?.events) return [];

    return timelineData.events.map((event: any, index: any) => ({
      timestamp: event.eventTime,
      value: index + 1, // Simple sequential value for visualization
      label: event.eventType,
      type: event.operation as 'event' | 'snapshot' | 'milestone',
      metadata: event.metadata
    }));
  }, [timelineData?.events]);

  const snapshotEvents = useMemo(() => {
    if (!timelineData?.snapshots) return [];

    return timelineData.snapshots.map(snapshot => ({
      timestamp: snapshot.snapshotTime,
      type: 'snapshot',
      label: `Snapshot ${snapshot.id}`,
      value: snapshot.eventCount
    }));
  }, [timelineData?.snapshots]);

  // Handle snapshot creation
  const handleCreateSnapshot = async (type: 'manual' | 'scheduled' | 'auto' = 'manual', description?: string) => {
    if (!currentFund) return;

    try {
      await createSnapshotMutation.mutateAsync({
        fundId: currentFund.id,
        type,
        ...spreadIfDefined('description', description)
      });

      toast({
        title: "Snapshot Created",
        description: "A new snapshot has been queued for creation.",
      });

      setCreateSnapshotDialogOpen(false);
      refetchTimeline();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create snapshot. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Handle snapshot restoration
  const handleRestoreSnapshot = async () => {
    if (!currentFund || !selectedSnapshotId) return;

    try {
      await restoreSnapshotMutation.mutateAsync({
        fundId: currentFund.id,
        snapshotId: selectedSnapshotId,
        confirmationCode
      });

      toast({
        title: "Restoration Initiated",
        description: "Fund state restoration has been initiated.",
      });

      setRestoreDialogOpen(false);
      setSelectedSnapshotId(null);
      setConfirmationCode('');
      refetchTimeline();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to restore snapshot. Please check your confirmation code.",
        variant: "destructive",
      });
    }
  };

  if (!currentFund) {
    return (
      <div className="container mx-auto p-6">
        <ErrorState
          title="No Fund Selected"
          message="Please select a fund to view time-travel analytics."
          onGoHome={() => window.location.href = '/fund-setup'}
        />
      </div>
    );
  }

  if (timelineError) {
    return (
      <div className="container mx-auto p-6">
        <ErrorState
          title="Failed to Load Timeline"
          message="There was an error loading the timeline data."
          error={timelineError}
          onRetry={() => refetchTimeline()}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Time-Travel Analytics</h1>
          <p className="text-gray-600 mt-2">
            Explore historical fund states, create snapshots, and restore previous configurations.
          </p>
        </div>

        <div className="flex items-center space-x-4">
          <Dialog open={createSnapshotDialogOpen} onOpenChange={setCreateSnapshotDialogOpen}>
            <DialogTrigger asChild>
              <Button className="flex items-center space-x-2">
                <Camera className="w-4 h-4" />
                <span>Create Snapshot</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Snapshot</DialogTitle>
                <DialogDescription>
                  Create a snapshot of the current fund state for future reference or restoration.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Snapshot Type</label>
                  <Select defaultValue="manual">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual</SelectItem>
                      <SelectItem value="scheduled">Scheduled</SelectItem>
                      <SelectItem value="auto">Automatic</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Description (Optional)</label>
                  <Input placeholder="Enter snapshot description..." />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateSnapshotDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => handleCreateSnapshot('manual')}
                  disabled={createSnapshotMutation.isPending}
                >
                  {createSnapshotMutation.isPending ? 'Creating...' : 'Create Snapshot'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      {timelineLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_: any, i: any) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse space-y-2">
                  <div className="h-4 w-24 bg-gray-200 rounded" />
                  <div className="h-6 w-16 bg-gray-200 rounded" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <StatCardGrid>
          <StatCard
            title="Total Events"
            value={timelineData?.events?.length || 0}
            icon={Activity}
            description="Events in selected time range"
          />
          <StatCard
            title="Snapshots"
            value={timelineData?.snapshots?.length || 0}
            icon={Camera}
            description="Available snapshots"
          />
          <StatCard
            title="Time Range"
            value={`${format(parseISO(selectedTimeRange.start), 'MMM dd')} - ${format(parseISO(selectedTimeRange.end), 'MMM dd')}`}
            icon={Clock}
            description="Selected analysis period"
          />
          <StatCard
            title="Data Points"
            value={timelineData?.pagination?.total || 0}
            icon={Database}
            description="Total timeline entries"
          />
        </StatCardGrid>
      )}

      {/* Main Content */}
      <Tabs defaultValue="timeline" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="timeline">Timeline View</TabsTrigger>
          <TabsTrigger value="snapshots">Snapshot Manager</TabsTrigger>
          <TabsTrigger value="comparison">State Comparison</TabsTrigger>
          <TabsTrigger value="playback">Time Playback</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="space-y-6">
          {/* Time Range Selector */}
          <Card>
            <CardHeader>
              <CardTitle>Time Range Selection</CardTitle>
              <CardDescription>
                Select the time range for timeline analysis
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium">Start Date:</label>
                  <Input
                    type="date"
                    value={selectedTimeRange.start}
                    onChange={(e: any) => setSelectedTimeRange(prev => ({ ...prev, start: e.target.value }))}
                    className="w-40"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium">End Date:</label>
                  <Input
                    type="date"
                    value={selectedTimeRange.end}
                    onChange={(e: any) => setSelectedTimeRange(prev => ({ ...prev, end: e.target.value }))}
                    className="w-40"
                  />
                </div>
                <Button
                  onClick={() => refetchTimeline()}
                  variant="outline"
                  className="flex items-center space-x-2"
                >
                  <History className="w-4 h-4" />
                  <span>Update Timeline</span>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Timeline Visualizations */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TimelineChart
              data={timelineChartData}
              title="Event Timeline"
              description="Timeline of fund events and activities"
              loading={timelineLoading}
              height={400}
            />

            <EventTimelineChart
              events={snapshotEvents}
              title="Snapshot Timeline"
              description="Available fund snapshots over time"
              height={400}
            />
          </div>

          {/* Event List */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Events</CardTitle>
              <CardDescription>
                Detailed list of fund events in the selected time range
              </CardDescription>
            </CardHeader>
            <CardContent>
              {timelineLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 5 }).map((_: any, i: any) => (
                    <div key={i} className="animate-pulse flex items-center space-x-4 p-4 border rounded-lg">
                      <div className="w-10 h-10 bg-gray-200 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-3/4 bg-gray-200 rounded" />
                        <div className="h-3 w-1/2 bg-gray-200 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : timelineData?.events?.length ? (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {timelineData.events.slice(0, 20).map((event: any) => (
                    <div
                      key={event.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                    >
                      <div className="flex items-center space-x-4">
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                          <Activity className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{event.eventType}</div>
                          <div className="text-sm text-gray-600">
                            {event.operation} • {event.entityType}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-gray-900">
                          {format(parseISO(event.eventTime), 'MMM dd, yyyy')}
                        </div>
                        <div className="text-xs text-gray-500">
                          {format(parseISO(event.eventTime), 'HH:mm:ss')}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No events found in the selected time range
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="snapshots" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Snapshot Management</CardTitle>
              <CardDescription>
                Create, manage, and restore fund snapshots
              </CardDescription>
            </CardHeader>
            <CardContent>
              {timelineLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 3 }).map((_: any, i: any) => (
                    <div key={i} className="animate-pulse flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-gray-200 rounded-lg" />
                        <div className="space-y-2">
                          <div className="h-4 w-48 bg-gray-200 rounded" />
                          <div className="h-3 w-32 bg-gray-200 rounded" />
                        </div>
                      </div>
                      <div className="w-24 h-8 bg-gray-200 rounded" />
                    </div>
                  ))}
                </div>
              ) : timelineData?.snapshots?.length ? (
                <div className="space-y-4">
                  {timelineData.snapshots.map((snapshot: any) => (
                    <div
                      key={snapshot.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                    >
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                          <Camera className="w-6 h-6 text-green-600" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">
                            Snapshot {snapshot.id}
                          </div>
                          <div className="text-sm text-gray-600">
                            {format(parseISO(snapshot.snapshotTime), 'MMM dd, yyyy HH:mm')}
                          </div>
                          <Badge variant="outline" className="mt-1">
                            {snapshot.eventCount} events
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentViewTime(snapshot.snapshotTime)}
                        >
                          View State
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-orange-600 border-orange-200 hover:bg-orange-50"
                              onClick={() => setSelectedSnapshotId(snapshot.id)}
                            >
                              <RotateCcw className="w-4 h-4 mr-1" />
                              Restore
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Restore Fund State</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will restore your fund to the state captured in Snapshot {snapshot.id}.
                                This action cannot be undone. Please enter the confirmation code to proceed.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <div className="my-4">
                              <Input
                                placeholder="Enter confirmation code"
                                value={confirmationCode}
                                onChange={(e: any) => setConfirmationCode(e.target.value)}
                              />
                            </div>
                            <AlertDialogFooter>
                              <AlertDialogCancel onClick={() => {
                                setSelectedSnapshotId(null);
                                setConfirmationCode('');
                              }}>
                                Cancel
                              </AlertDialogCancel>
                              <AlertDialogAction
                                onClick={handleRestoreSnapshot}
                                disabled={!confirmationCode.trim() || restoreSnapshotMutation.isPending}
                                className="bg-orange-600 hover:bg-orange-700"
                              >
                                {restoreSnapshotMutation.isPending ? 'Restoring...' : 'Restore State'}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Camera className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Snapshots</h3>
                  <p className="text-gray-600 mb-4">
                    Create your first snapshot to save the current fund state.
                  </p>
                  <Button onClick={() => setCreateSnapshotDialogOpen(true)}>
                    Create First Snapshot
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comparison" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>State Comparison</CardTitle>
              <CardDescription>
                Compare fund states between two different points in time
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Timestamp Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium">First Timestamp</label>
                  <Input
                    type="datetime-local"
                    value={selectedTimestamp1}
                    onChange={(e: any) => setSelectedTimestamp1(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Second Timestamp</label>
                  <Input
                    type="datetime-local"
                    value={selectedTimestamp2}
                    onChange={(e: any) => setSelectedTimestamp2(e.target.value)}
                  />
                </div>
              </div>

              {/* Comparison Results */}
              {comparisonLoading ? (
                <div className="animate-pulse space-y-4">
                  <div className="h-8 w-64 bg-gray-200 rounded" />
                  <div className="h-32 w-full bg-gray-200 rounded" />
                </div>
              ) : comparisonData && selectedTimestamp1 && selectedTimestamp2 ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <StatCard
                      title="Total Changes"
                      value={comparisonData.summary.totalChanges}
                      icon={GitBranch}
                    />
                    <StatCard
                      title="Time Span"
                      value={`${Math.round(comparisonData.summary.timeSpan / (1000 * 60 * 60))}h`}
                      icon={Clock}
                    />
                    <StatCard
                      title="State Snapshots"
                      value="2"
                      icon={Camera}
                    />
                  </div>

                  {comparisonData.differences && comparisonData.differences.length > 0 ? (
                    <Card>
                      <CardHeader>
                        <CardTitle>Detected Changes</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {comparisonData.differences.map((diff: any, index: any) => (
                            <div key={index} className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                              <div className="font-medium text-yellow-800">
                                Change {index + 1}
                              </div>
                              <div className="text-sm text-yellow-700 mt-1">
                                {typeof diff === 'object' ? JSON.stringify(diff) : diff}
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <Card>
                      <CardContent className="text-center py-8">
                        <div className="text-green-600 mb-2">
                          <GitBranch className="w-8 h-8 mx-auto" />
                        </div>
                        <h3 className="font-medium text-gray-900">No Changes Detected</h3>
                        <p className="text-gray-600 text-sm">
                          The fund states are identical between these two timestamps.
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  Select two timestamps to compare fund states
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="playback" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Time Playback</CardTitle>
              <CardDescription>
                Step through time to see how your fund evolved
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Playback Controls */}
              <div className="flex items-center justify-center space-x-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (currentViewTime) {
                      const newTime = subDays(parseISO(currentViewTime), 1).toISOString();
                      setCurrentViewTime(newTime);
                    }
                  }}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>

                <Button
                  variant={isPlaying ? "secondary" : "default"}
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="flex items-center space-x-2"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  <span>{isPlaying ? 'Pause' : 'Play'}</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (currentViewTime) {
                      const newTime = addDays(parseISO(currentViewTime), 1).toISOString();
                      setCurrentViewTime(newTime);
                    }
                  }}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>

              {/* Speed Control */}
              <div className="flex items-center justify-center space-x-4">
                <span className="text-sm text-gray-600">Speed:</span>
                <Select value={playbackSpeed.toString()} onValueChange={(value: any) => setPlaybackSpeed(parseFloat(value))}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0.5">0.5x</SelectItem>
                    <SelectItem value="1">1x</SelectItem>
                    <SelectItem value="2">2x</SelectItem>
                    <SelectItem value="5">5x</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Current Time Display */}
              <div className="text-center">
                <div className="text-lg font-medium text-gray-900">
                  {currentViewTime ? format(parseISO(currentViewTime), 'MMMM dd, yyyy HH:mm') : 'Select a time to view'}
                </div>
              </div>

              {/* Point in Time State */}
              {pointInTimeLoading ? (
                <div className="animate-pulse space-y-4">
                  <div className="h-8 w-48 bg-gray-200 rounded mx-auto" />
                  <div className="h-32 w-full bg-gray-200 rounded" />
                </div>
              ) : pointInTimeData ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Fund State</CardTitle>
                    <CardDescription>
                      State as of {format(parseISO(pointInTimeData.timestamp), 'MMMM dd, yyyy HH:mm')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <StatCard
                        title="Snapshot ID"
                        value={pointInTimeData.snapshot.id}
                        icon={Camera}
                      />
                      <StatCard
                        title="Event Count"
                        value={pointInTimeData.snapshot.eventCount}
                        icon={Activity}
                      />
                      <StatCard
                        title="Events Applied"
                        value={pointInTimeData.eventsApplied}
                        icon={Zap}
                      />
                    </div>

                    {pointInTimeData.state && (
                      <div className="mt-6">
                        <h4 className="font-medium text-gray-900 mb-2">State Data</h4>
                        <pre className="bg-gray-50 p-4 rounded-lg text-sm overflow-auto max-h-64">
                          {JSON.stringify(pointInTimeData.state, null, 2)}
                        </pre>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : currentViewTime ? (
                <div className="text-center py-8 text-gray-500">
                  No state data available for the selected time
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}