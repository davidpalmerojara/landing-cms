import clsx from 'clsx';

interface TextAreaFieldProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** The server's limit (lib/field-limits); the textarea stops there */
  maxLength?: number;
  invalid?: boolean;
  /** Ids of the counter or error that describe the field */
  describedBy?: string;
}

export default function TextAreaField({ id, value, onChange, maxLength, invalid, describedBy }: TextAreaFieldProps) {
  return (
    <textarea
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      maxLength={maxLength}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      className={clsx(
        'w-full text-[13px] p-3 rounded-lg bg-surface-elevated border text-primary placeholder-muted focus:ring-1 outline-none transition-all resize-none h-24 shadow-inner',
        invalid
          ? 'border-error/70 focus:border-error focus:ring-error/30'
          : 'border-default/10 focus:border-primary/50 focus:ring-primary/30',
      )}
    />
  );
}
