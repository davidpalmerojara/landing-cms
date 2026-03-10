interface TextAreaFieldProps {
  value: string;
  onChange: (value: string) => void;
}

export default function TextAreaField({ value, onChange }: TextAreaFieldProps) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full text-[13px] p-3 rounded-lg bg-zinc-900/80 border border-zinc-800 text-zinc-200 placeholder-zinc-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all resize-none h-24 shadow-inner"
    />
  );
}
