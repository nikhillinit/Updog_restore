/**
 * Loading skeleton for dashboard
 */
export function DashboardLoading() {
  return (
    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
      <div className="animate-pulse space-y-8">
        {/* Header skeleton */}
        <div className="h-20 bg-gray-200 rounded-xl"></div>
        
        {/* Metrics cards skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 bg-gray-200 rounded-xl"></div>
          ))}
        </div>
        
        {/* Charts skeleton */}
        <div className="h-96 bg-gray-200 rounded-xl"></div>
      </div>
    </div>
  );
}