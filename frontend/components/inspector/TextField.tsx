interface TextFieldProps {
  value: string;
  onChange: (value: string) => void;
}

export default function TextField({ value, onChange }: TextFieldProps) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full text-[13px] px-3 py-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800 text-zinc-200 placeholder-zinc-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all shadow-inner"
    />
  );
}
