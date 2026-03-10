import type { FieldDefinition } from '@/types/inspector';
import TextField from './TextField';
import TextAreaField from './TextAreaField';
import SelectField from './SelectField';
import ColorField from './ColorField';
import ToggleField from './ToggleField';

interface FieldRendererProps {
  field: FieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}

export default function FieldRenderer({ field, value, onChange }: FieldRendererProps) {
  const renderField = () => {
    switch (field.type) {
      case 'textarea':
        return <TextAreaField value={(value as string) || ''} onChange={onChange} />;
      case 'select':
        return (
          <SelectField
            value={(value as string) || ''}
            options={field.options || []}
            onChange={onChange}
          />
        );
      case 'color':
        return <ColorField value={(value as string) || '#ffffff'} onChange={onChange} />;
      case 'toggle':
        return <ToggleField value={!!value} onChange={onChange} />;
      default:
        return <TextField value={(value as string) || ''} onChange={onChange} />;
    }
  };

  return (
    <div className={`${field.type === 'toggle' ? 'flex items-center justify-between' : 'space-y-2.5'}`}>
      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
        {field.label}
      </label>
      {renderField()}
    </div>
  );
}
