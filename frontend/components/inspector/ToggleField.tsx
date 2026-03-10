interface ToggleFieldProps {
  value: boolean;
  onChange: (value: boolean) => void;
}

export default function ToggleField({ value, onChange }: ToggleFieldProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        value ? 'bg-indigo-500' : 'bg-zinc-700'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
          value ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}
