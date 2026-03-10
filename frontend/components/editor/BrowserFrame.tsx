'use client';

import { forwardRef } from 'react';
import { useEditorStore } from '@/store/editor-store';

function LockIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function getCanvasWidthClass(deviceMode: string) {
  switch (deviceMode) {
    case 'mobile':
      return 'w-[375px] min-w-[375px]';
    case 'tablet':
      return 'w-[768px] min-w-[768px]';
    default:
      return 'w-full min-w-[1024px] max-w-[1200px]';
  }
}

interface BrowserFrameProps {
  children: React.ReactNode;
}

const BrowserFrame = forwardRef<HTMLDivElement, BrowserFrameProps>(
  function BrowserFrame({ children }, ref) {
    const deviceMode = useEditorStore((s) => s.deviceMode);

    return (
      <div
        ref={ref}
        className={`${getCanvasWidthClass(deviceMode)} bg-white min-h-[800px] rounded-xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)] border border-zinc-800/50 flex flex-col mb-20 overflow-hidden`}
      >
        {/* Chrome bar */}
        <div className="h-10 bg-zinc-950/95 border-b border-zinc-800/50 flex items-center px-4 gap-4 w-full shrink-0">
          <div className="flex gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500/80 hover:bg-red-500 transition-colors" />
            <div className="w-3 h-3 rounded-full bg-amber-500/80 hover:bg-amber-500 transition-colors" />
            <div className="w-3 h-3 rounded-full bg-green-500/80 hover:bg-green-500 transition-colors" />
          </div>
          <div className="mx-auto bg-zinc-900/80 h-6 rounded-md px-24 flex items-center text-[11px] font-medium text-zinc-500 border border-zinc-800/50 shadow-inner">
            <LockIcon className="w-3 h-3 mr-2 opacity-50" /> tu-proyecto.dev
          </div>
          <div className="w-[52px]" />
        </div>

        {/* Page content */}
        <div className="flex flex-col w-full flex-1 relative bg-white">
          {children}
        </div>
      </div>
    );
  }
);

export default BrowserFrame;
