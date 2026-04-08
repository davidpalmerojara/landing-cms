export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-surface text-primary">
      {/* Sidebar skeleton */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-surface border-r border-default/15 py-8 px-4">
        <div className="flex items-center gap-3 px-2 mb-10">
          <div className="w-8 h-8 rounded bg-surface-card animate-pulse" />
          <div className="w-24 h-5 bg-surface-card rounded animate-pulse" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-11 bg-surface-card rounded-lg animate-pulse" />
          ))}
        </div>
      </aside>

      {/* Top bar skeleton */}
      <header className="fixed top-0 right-0 left-64 h-16 bg-surface/80 border-b border-default/15 flex items-center justify-between px-8">
        <div className="flex items-center gap-4">
          <div className="w-64 h-9 bg-surface-elevated rounded-lg animate-pulse" />
          <div className="flex items-center gap-6 ml-4">
            <div className="w-20 h-4 bg-surface-card rounded animate-pulse" />
            <div className="w-16 h-4 bg-surface-card rounded animate-pulse" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-surface-card rounded-lg animate-pulse" />
          <div className="w-10 h-10 bg-surface-card rounded-full animate-pulse" />
        </div>
      </header>

      {/* Main content skeleton */}
      <main className="ml-64 pt-24 pb-12 px-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-end justify-between mb-10">
            <div>
              <div className="w-48 h-9 bg-surface-card rounded animate-pulse mb-2" />
              <div className="w-32 h-4 bg-surface-card rounded animate-pulse" />
            </div>
            <div className="w-40 h-12 bg-surface-card rounded-full animate-pulse" />
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-surface-elevated p-6 rounded-2xl border border-default/10">
                <div className="w-20 h-3 bg-surface-card rounded animate-pulse mb-3" />
                <div className="w-16 h-7 bg-surface-card rounded animate-pulse mb-2" />
                <div className="w-24 h-3 bg-surface-card rounded animate-pulse" />
              </div>
            ))}
          </div>

          {/* Card grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-surface-card rounded-2xl overflow-hidden shadow-[0_32px_64px_-12px_rgba(0,0,0,0.5)]">
                <div className="h-48 bg-surface-elevated animate-pulse" />
                <div className="p-5">
                  <div className="w-32 h-5 bg-surface-card rounded animate-pulse mb-2" />
                  <div className="w-20 h-3 bg-surface-card rounded animate-pulse mb-6" />
                  <div className="flex items-center justify-between">
                    <div className="w-20 h-3 bg-surface-card rounded animate-pulse" />
                    <div className="w-8 h-8 bg-surface-card rounded-full animate-pulse" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
