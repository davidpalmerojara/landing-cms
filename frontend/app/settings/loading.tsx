export default function SettingsLoading() {
  return (
    <div className="min-h-screen bg-surface text-secondary">
      {/* Header skeleton */}
      <header className="border-b border-subtle\/80">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center">
          <div className="w-8 h-8 bg-surface-card rounded-lg animate-pulse mr-3" />
          <div className="w-28 h-4 bg-surface-card rounded animate-pulse" />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        {/* Title skeleton */}
        <div className="w-40 h-7 bg-surface-card rounded animate-pulse mb-2" />
        <div className="w-64 h-4 bg-surface-card\/60 rounded animate-pulse mb-8" />

        {/* List items skeleton */}
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 p-5 bg-surface-elevated\/50 border border-subtle\/80 rounded-xl"
            >
              <div className="w-10 h-10 bg-surface-card rounded-lg animate-pulse shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="w-40 h-4 bg-surface-card rounded animate-pulse" />
                <div className="w-60 h-3 bg-surface-card\/60 rounded animate-pulse" />
              </div>
              <div className="w-6 h-6 bg-surface-card rounded animate-pulse" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
