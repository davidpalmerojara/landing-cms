import type { FieldDefinition } from '@/types/inspector';
import TextField from './TextField';
import TextAreaField from './TextAreaField';
import SelectField from './SelectField';
import ColorField from './ColorField';
import ToggleField from './ToggleField';
import ImageField from './ImageField';

interface FieldRendererProps {
  field: FieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}

export default function FieldRenderer({ field, value, onChange }: FieldRendererProps) {
  const fieldId = `field-${field.key}`;

  const renderField = () => {
    switch (field.type) {
      case 'textarea':
        return <TextAreaField id={fieldId} value={(value as string) || ''} onChange={onChange} />;
      case 'select':
        return (
          <SelectField
            id={fieldId}
            value={(value as string) || ''}
            options={field.options || []}
            onChange={onChange}
          />
        );
      case 'color':
        return <ColorField id={fieldId} value={(value as string) || '#ffffff'} onChange={onChange} />;
      case 'toggle':
        return <ToggleField id={fieldId} value={!!value} onChange={onChange} />;
      case 'image':
        return <ImageField id={fieldId} value={(value as string) || ''} onChange={onChange} />;
      default:
        return <TextField id={fieldId} value={(value as string) || ''} onChange={onChange} />;
    }
  };

  return (
    <div className={`${field.type === 'toggle' ? 'flex items-center justify-between' : 'space-y-2.5'}`}>
      <label htmlFor={fieldId} className="text-[10px] font-bold text-muted uppercase tracking-widest">
        {field.label}
      </label>
      {renderField()}
    </div>
  );
}
