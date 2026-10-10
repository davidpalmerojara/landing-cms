import type { ScalarFieldDefinition } from '@/types/inspector';
import TextField from './TextField';
import TextAreaField from './TextAreaField';
import SelectField from './SelectField';
import ColorField from './ColorField';
import ToggleField from './ToggleField';
import ImageField from './ImageField';

interface FieldRendererProps {
  field: ScalarFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  /** Id of the input; defaults to one derived from the field key. */
  id?: string;
}

export default function FieldRenderer({ field, value, onChange, id }: FieldRendererProps) {
  const fieldId = id ?? `field-${field.key}`;
  const labelId = `${fieldId}-label`;
  const text = typeof value === 'string' ? value : '';

  const renderField = () => {
    switch (field.type) {
      case 'textarea':
        return <TextAreaField id={fieldId} value={text} onChange={onChange} />;
      case 'select':
        return <SelectField id={fieldId} value={text} options={field.options} onChange={onChange} />;
      case 'color':
        return <ColorField id={fieldId} labelId={labelId} value={text || '#ffffff'} onChange={onChange} />;
      case 'toggle':
        return <ToggleField id={fieldId} value={value === true} onChange={onChange} />;
      case 'image':
        return <ImageField id={fieldId} labelId={labelId} value={text} onChange={onChange} />;
      default:
        return <TextField id={fieldId} value={text} onChange={onChange} />;
    }
  };

  return (
    <div className={`${field.type === 'toggle' ? 'flex items-center justify-between' : 'space-y-2.5'}`}>
      <label id={labelId} htmlFor={fieldId} className="text-[10px] font-bold text-muted uppercase tracking-widest">
        {field.label}
      </label>
      {renderField()}
    </div>
  );
}
