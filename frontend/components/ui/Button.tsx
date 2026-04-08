import { forwardRef } from 'react';
import clsx from 'clsx';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-primary hover:bg-[#2563EB]/80 text-white shadow-lg shadow-[#2563EB]/20 active:scale-95',
  secondary:
    'bg-surface-elevated\/50 border border-subtle\/50 text-secondary hover:bg-surface-card hover:text-primary active:scale-[0.98] active:bg-surface-card',
  ghost:
    'text-secondary hover:text-primary hover:bg-surface-card\/50 active:opacity-90 active:bg-surface-card\/50',
  danger:
    'bg-transparent border border-red-900/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/40 hover:text-red-300 active:scale-[0.98] active:bg-red-500/10',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'text-[11px] px-2.5 py-1.5',
  md: 'text-sm px-3 py-1.5',
  lg: 'text-sm px-4 py-2',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className, children, ...props }, ref) => (
    <button
      ref={ref}
      className={clsx(
        'font-medium rounded-md transition-all flex items-center justify-center gap-1.5',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
);

Button.displayName = 'Button';
export default Button;
