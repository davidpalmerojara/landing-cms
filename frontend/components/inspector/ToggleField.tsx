interface ToggleFieldProps {
  id?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

export default function ToggleField({ id, value, onChange }: ToggleFieldProps) {
  return (
    <button
      id={id}
      type="button"
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        value ? 'bg-primary' : 'bg-default'
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
