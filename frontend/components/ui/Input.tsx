import { forwardRef } from 'react';
import clsx from 'clsx';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, className, ...props }, ref) => (
    <input
      ref={ref}
      className={clsx(
        'w-full text-base px-3 py-2.5 rounded-lg bg-surface-elevated\/80 border text-primary placeholder-muted outline-none transition-all shadow-inner focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none',
        error
          ? 'border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500'
          : 'border-subtle focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]',
        className
      )}
      {...props}
    />
  )
);

Input.displayName = 'Input';
export default Input;
