import clsx from 'clsx';

interface TextFieldProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  /** The server's limit (lib/field-limits); the input stops there */
  maxLength?: number;
  invalid?: boolean;
  /** Ids of the counter or error that describe the field */
  describedBy?: string;
  /** `url` for links: the right keyboard on phones, no autocorrect */
  inputMode?: 'text' | 'url';
}

export default function TextField({ id, value, onChange, onBlur, maxLength, invalid, describedBy, inputMode }: TextFieldProps) {
  const isUrl = inputMode === 'url';
  return (
    <input
      id={id}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      maxLength={maxLength}
      inputMode={inputMode}
      autoCapitalize={isUrl ? 'none' : undefined}
      spellCheck={isUrl ? false : undefined}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      className={clsx(
        'w-full text-[13px] px-3 py-2.5 rounded-lg bg-surface-elevated border text-primary placeholder-muted focus:ring-1 outline-none transition-all shadow-inner',
        invalid
          ? 'border-error/70 focus:border-error focus:ring-error/30'
          : 'border-default/10 focus:border-primary/50 focus:ring-primary/30',
      )}
    />
  );
}
