import clsx from 'clsx';

interface PanelProps {
  className?: string;
  children: React.ReactNode;
}

export default function Panel({ className, children }: PanelProps) {
  return (
    <div
      className={clsx(
        'bg-surface border border-subtle\/80 rounded-lg',
        className
      )}
    >
      {children}
    </div>
  );
}
