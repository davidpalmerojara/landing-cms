'use client';

import { useState, useRef, useEffect, type ElementType } from 'react';
import { useEditorStore } from '@/store/editor-store';

interface EditableTextProps {
  blockId: string;
  fieldKey: string;
  value: string;
  as?: ElementType;
  className?: string;
  style?: React.CSSProperties;
  multiline?: boolean;
}

export default function EditableText({
  blockId,
  fieldKey,
  value,
  as: Tag = 'span',
  className = '',
  style,
  multiline = false,
}: EditableTextProps) {
  const selectedBlockId = useEditorStore((s) => s.selectedBlockId);
  const isPreviewMode = useEditorStore((s) => s.isPreviewMode);
  const updateBlock = useEditorStore((s) => s.updateBlock);

  const [isEditing, setIsEditing] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const isSelected = selectedBlockId === blockId;
  const isActiveEditing = isEditing && isSelected;

  // When entering edit mode, focus and select all text
  useEffect(() => {
    if (isActiveEditing && ref.current) {
      ref.current.focus();
      const range = document.createRange();
      range.selectNodeContents(ref.current);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [isActiveEditing]);

  useEffect(() => {
    const current = ref.current;
    if (!isSelected && isEditing && current && current === document.activeElement) {
      current.blur();
    }
  }, [isSelected, isEditing]);

  if (isPreviewMode) {
    return <Tag className={className} style={style}>{value}</Tag>;
  }

  if (isActiveEditing) {
    return (
      <Tag
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        style={style}
        className={`${className} pointer-events-auto outline-none ring-2 ring-[#2563EB]/40 ring-offset-2 ring-offset-transparent rounded-sm cursor-text`}
        onBlur={(e: React.FocusEvent<HTMLElement>) => {
          const newValue = e.currentTarget.innerText || '';
          if (newValue !== value) {
            updateBlock(blockId, fieldKey, newValue);
          }
          setIsEditing(false);
        }}
        onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
          e.stopPropagation();
          if (e.key === 'Escape') {
            if (ref.current) ref.current.innerText = value;
            setIsEditing(false);
          }
          if (e.key === 'Enter' && !multiline) {
            e.preventDefault();
            ref.current?.blur();
          }
        }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
        onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
      >
        {value}
      </Tag>
    );
  }

  return (
    <Tag
      style={style}
      className={`${className} ${
        isSelected
          ? 'pointer-events-auto cursor-text hover:ring-2 hover:ring-[#2563EB]/20 hover:ring-offset-2 hover:ring-offset-transparent active:ring-2 active:ring-[#2563EB]/20 active:ring-offset-2 active:ring-offset-transparent rounded-sm transition-shadow'
          : ''
      }`}
      onDoubleClick={(e: React.MouseEvent) => {
        if (isSelected) {
          e.stopPropagation();
          setIsEditing(true);
        }
      }}
    >
      {value}
    </Tag>
  );
}
