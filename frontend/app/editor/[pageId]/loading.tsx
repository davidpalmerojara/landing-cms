export default function EditorLoading() {
  return (
    <div className="flex flex-col min-h-screen bg-surface overflow-hidden">
      {/* Top bar skeleton */}
      <div className="h-14 border-b border-subtle/80 flex items-center px-4 gap-4 shrink-0">
        <div className="w-8 h-8 bg-surface-card rounded-lg animate-pulse" />
        <div className="w-32 h-4 bg-surface-card rounded animate-pulse" />
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <div className="w-20 h-7 bg-surface-card rounded animate-pulse" />
          <div className="w-20 h-7 bg-surface-card rounded animate-pulse" />
          <div className="w-20 h-7 bg-surface-card rounded animate-pulse" />
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <div className="w-24 h-8 bg-surface-card rounded-lg animate-pulse" />
          <div className="w-24 h-8 bg-[#2563EB]/20 rounded-lg animate-pulse" />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar skeleton */}
        <div className="w-64 border-r border-subtle/80 flex flex-col shrink-0">
          <div className="p-3 border-b border-subtle/80">
            <div className="w-full h-8 bg-surface-card rounded animate-pulse" />
          </div>
          <div className="flex-1 p-3 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-10 bg-surface-elevated border border-subtle/60 rounded-lg animate-pulse"
              />
            ))}
          </div>
        </div>

        {/* Canvas area skeleton */}
        <div className="flex-1 flex items-center justify-center bg-surface relative">
          <div className="w-[760px] max-w-full mx-8 space-y-4">
            {/* Browser frame top */}
            <div className="h-8 bg-surface-elevated rounded-t-xl border border-subtle/60 flex items-center px-3 gap-1.5">
              <div className="w-2.5 h-2.5 bg-surface-card rounded-full" />
              <div className="w-2.5 h-2.5 bg-surface-card rounded-full" />
              <div className="w-2.5 h-2.5 bg-surface-card rounded-full" />
            </div>
            {/* Content blocks */}
            <div className="space-y-3">
              <div className="h-48 bg-surface-elevated border border-subtle/60 rounded-lg animate-pulse" />
              <div className="h-32 bg-surface-elevated border border-subtle/60 rounded-lg animate-pulse" />
              <div className="h-24 bg-surface-elevated border border-subtle/60 rounded-lg animate-pulse" />
            </div>
          </div>
        </div>

        {/* Inspector skeleton */}
        <div className="w-72 border-l border-subtle/80 p-4 space-y-4 shrink-0">
          <div className="w-24 h-4 bg-surface-card rounded animate-pulse" />
          <div className="space-y-3">
            <div className="w-full h-8 bg-surface-card rounded animate-pulse" />
            <div className="w-full h-8 bg-surface-card rounded animate-pulse" />
            <div className="w-3/4 h-8 bg-surface-card rounded animate-pulse" />
          </div>
          <div className="border-t border-subtle/80 pt-4 space-y-3">
            <div className="w-16 h-3 bg-surface-card rounded animate-pulse" />
            <div className="w-full h-8 bg-surface-card rounded animate-pulse" />
            <div className="w-full h-8 bg-surface-card rounded animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}
