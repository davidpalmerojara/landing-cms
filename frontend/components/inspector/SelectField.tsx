interface SelectFieldProps {
  id?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

export default function SelectField({ id, value, options, onChange }: SelectFieldProps) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full text-[13px] px-3 py-2.5 rounded-lg bg-surface-elevated border border-default/10 text-primary focus:border-[#2563EB]/50 focus:ring-1 focus:ring-[#2563EB]/30 outline-none transition-all shadow-inner appearance-none cursor-pointer"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
