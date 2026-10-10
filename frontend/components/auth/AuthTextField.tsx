'use client';

import type { Ref } from 'react';

interface AuthTextFieldProps {
  id: string;
  label: string;
  type: 'text' | 'email' | 'password';
  value: string;
  onChange: (value: string) => void;
  /** Hint for password managers and the keyboard: username, current-password, new-password, email */
  autoComplete: string;
  placeholder?: string;
  error?: string;
  inputRef?: Ref<HTMLInputElement>;
}

// 16 px on phones: iOS Safari zooms the page when it focuses a smaller field (QA-064)
const INPUT_CLASSES =
  'w-full min-h-11 bg-surface-elevated/80 border rounded-lg px-3 py-2 text-base sm:text-sm text-primary placeholder-muted focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors';

/** A labelled field of the login and register forms, with its error announced and tied to the input. */
export default function AuthTextField({
  id, label, type, value, onChange, autoComplete, placeholder, error, inputRef,
}: AuthTextFieldProps) {
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-secondary mb-1.5">{label}</label>
      <input
        ref={inputRef}
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder={placeholder ?? (type === 'password' ? '••••••••' : label)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`${INPUT_CLASSES} ${error ? 'border-error' : 'border-subtle'}`}
      />
      {error && <p id={errorId} className="mt-1.5 text-xs text-error">{error}</p>}
    </div>
  );
}
