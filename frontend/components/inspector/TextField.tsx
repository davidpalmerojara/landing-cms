interface TextFieldProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
}

export default function TextField({ id, value, onChange }: TextFieldProps) {
  return (
    <input
      id={id}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full text-[13px] px-3 py-2.5 rounded-lg bg-surface-elevated border border-default/10 text-primary placeholder-muted focus:border-[#2563EB]/50 focus:ring-1 focus:ring-[#2563EB]/30 outline-none transition-all shadow-inner"
    />
  );
}
