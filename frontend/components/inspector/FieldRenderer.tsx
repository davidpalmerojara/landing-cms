import type { FieldDefinition } from '@/types/inspector';
import TextField from './TextField';
import TextAreaField from './TextAreaField';

interface FieldRendererProps {
  field: FieldDefinition;
  value: string;
  onChange: (value: string) => void;
}

export default function FieldRenderer({ field, value, onChange }: FieldRendererProps) {
  return (
    <div className="space-y-2.5">
      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex justify-between">
        {field.label}
      </label>
      {field.type === 'textarea' ? (
        <TextAreaField value={value} onChange={onChange} />
      ) : (
        <TextField value={value} onChange={onChange} />
      )}
    </div>
  );
}
