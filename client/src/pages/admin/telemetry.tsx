/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from 'react';
import { readTelemetry, type TelemetryEvent } from '../../lib/telemetry';

/**
 * Live telemetry dashboard for monitoring deployments
 * 
 * Features:
 * - Real-time updates via storage events
 * - Migration success tracking
 * - Error rate monitoring
 * - Quick stats summary
 * 
 * Access: /admin/telemetry (should be gated behind auth/feature flag)
 */
export default function TelemetryDashboard() {
  const [events, setEvents] = useState<TelemetryEvent[]>(() => readTelemetry());
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  useEffect(() => {
    // Listen for new telemetry events (same tab)
    const onTelemetryAppend = (e: CustomEvent) => {
      setEvents(readTelemetry());
      setLastUpdate(Date.now());
    };

    // Listen for storage changes (other tabs)
    const onStorageChange = (e: StorageEvent) => {
      if (e.key === '__telemetry_events') {
        setEvents(readTelemetry());
        setLastUpdate(Date.now());
      }
    };

    window.addEventListener('telemetry:append', onTelemetryAppend as EventListener);
    window.addEventListener('storage', onStorageChange);

    return () => {
      window.removeEventListener('telemetry:append', onTelemetryAppend as EventListener);
      window.removeEventListener('storage', onStorageChange);
    };
  }, []);

  // Calculate stats
  const now = Date.now();
  const last24h = events.filter(e => now - e['t'] < 24 * 60 * 60 * 1000);
  const lastHour = events.filter(e => now - e['t'] < 60 * 60 * 1000);
  
  const migrations = events.filter(e => e['category'] === 'migration');
  const errors = events.filter(e => e['category'] === 'error');
  const features = events.filter(e => e['category'] === 'feature');
  
  const migrationSuccess = migrations.filter(e => e['ok'] !== false).length;
  const migrationErrors = migrations.filter(e => e['ok'] === false).length;
  
  const recentErrors = errors.filter(e => now - e['t'] < 60 * 60 * 1000);
  const errorRate = lastHour.length > 0 ? (recentErrors.length / lastHour.length) * 100 : 0;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Telemetry Dashboard</h1>
        <div className="text-sm text-gray-500">
          Last updated: {new Date(lastUpdate).toLocaleTimeString()}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-2xl font-bold text-blue-600">{migrations.length}</div>
          <div className="text-gray-600">Total Migrations</div>
          <div className="text-sm text-green-600 mt-1">
            {migrationSuccess} successful, {migrationErrors} failed
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-2xl font-bold text-green-600">{features.length}</div>
          <div className="text-gray-600">Feature Events</div>
          <div className="text-sm text-gray-500 mt-1">
            Last 24h: {last24h.filter(e => e.category === 'feature').length}
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className={`text-2xl font-bold ${errors.length === 0 ? 'text-green-600' : 'text-red-600'}`}>
            {errors.length}
          </div>
          <div className="text-gray-600">Total Errors</div>
          <div className="text-sm text-red-600 mt-1">
            Last hour: {recentErrors.length}
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className={`text-2xl font-bold ${errorRate < 1 ? 'text-green-600' : 'text-red-600'}`}>
            {errorRate.toFixed(1)}%
          </div>
          <div className="text-gray-600">Error Rate (1h)</div>
          <div className="text-sm text-gray-500 mt-1">
            {recentErrors.length}/{lastHour.length} events
          </div>
        </div>
      </div>

      {/* Recent Events */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Recent Events</h2>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {events.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              No telemetry events yet
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {events.slice(-20).reverse().map((event, idx) => (
                <div key={`${event['t']}-${idx}`} className="px-6 py-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`w-2 h-2 rounded-full ${
                        event['category'] === 'error' ? 'bg-red-500' :
                        event['category'] === 'migration' ? 'bg-blue-500' :
                        'bg-green-500'
                      }`} />
                      <span className="font-medium text-gray-900">
                        [{event['category']}] {event.event}
                      </span>
                      {event['ok'] === false && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          Failed
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">
                      {new Date(event['t']).toLocaleTimeString()}
                    </div>
                  </div>
                  {event['meta'] && Object.keys(event['meta']).length > 0 && (
                    <div className="mt-2 text-sm text-gray-600 ml-5">
                      <pre className="whitespace-pre-wrap">
                        {JSON.stringify(event['meta'], null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Health Status */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">System Health</h2>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span>Migration Success Rate:</span>
            <span className={`font-medium ${
              migrationErrors === 0 ? 'text-green-600' : 
              migrationSuccess / Math.max(migrations.length, 1) > 0.99 ? 'text-yellow-600' : 'text-red-600'
            }`}>
              {migrations.length === 0 ? 'N/A' : 
               `${((migrationSuccess / migrations.length) * 100).toFixed(1)}%`}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Recent Activity:</span>
            <span className="font-medium">
              {lastHour.length} events in last hour
            </span>
          </div>
          <div className="flex justify-between">
            <span>Buffer Usage:</span>
            <span className="font-medium">
              {events.length}/200 events
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

