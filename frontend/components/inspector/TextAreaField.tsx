interface TextAreaFieldProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
}

export default function TextAreaField({ id, value, onChange }: TextAreaFieldProps) {
  return (
    <textarea
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full text-[13px] p-3 rounded-lg bg-surface-elevated border border-default/10 text-primary placeholder-muted focus:border-[#2563EB]/50 focus:ring-1 focus:ring-[#2563EB]/30 outline-none transition-all resize-none h-24 shadow-inner"
    />
  );
}
