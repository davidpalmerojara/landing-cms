interface SelectFieldProps {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

export default function SelectField({ value, options, onChange }: SelectFieldProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full text-[13px] px-3 py-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800 text-zinc-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all shadow-inner appearance-none cursor-pointer"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
