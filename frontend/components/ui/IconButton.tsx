import { forwardRef } from 'react';
import clsx from 'clsx';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md';
  active?: boolean;
  children: React.ReactNode;
}

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ size = 'md', active = false, className, children, ...props }, ref) => (
    <button
      ref={ref}
      className={clsx(
        'rounded-md transition-all flex items-center justify-center min-w-11 min-h-11 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none',
        size === 'sm' ? 'p-1.5' : 'p-2',
        active
          ? 'bg-surface-card text-primary shadow-sm'
          : 'text-muted hover:text-secondary hover:bg-surface-card\/50',
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
);

IconButton.displayName = 'IconButton';
export default IconButton;
