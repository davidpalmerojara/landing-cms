'use client';

import { useState, useRef, useEffect, type ElementType } from 'react';
import { useTranslations } from 'next-intl';
import { useEditorStore } from '@/store/editor-store';
import { fieldLimit } from '@/lib/field-limits';
import type { DataPath } from '@/types/block-data';
import { useBlockRender } from './block-render-context';

interface EditableTextProps {
  blockId: string;
  /** Top-level key ('title') or the path of a list item field (['features', 0, 'title']). */
  fieldKey: string | DataPath;
  value: string;
  as?: ElementType;
  className?: string;
  style?: React.CSSProperties;
  multiline?: boolean;
}

// An empty text on the canvas keeps a height and says so, so it can still be found and double-clicked (QA-040);
// on touch screens it says double tap (EDITOR2-014)
const EMPTY_CLASS = 'empty:before:content-[attr(data-placeholder)] pointer-coarse:empty:before:content-[attr(data-placeholder-touch)] empty:before:opacity-50 empty:before:italic empty:inline-block empty:min-w-[4ch] empty:min-h-[1lh]';

/**
 * What an inline edit stores. A contentEditable emptied in the browser keeps a
 * `<br>`, so `innerText` reads "\n": a text with nothing visible is stored
 * empty, or its placeholder never shows and the element collapses to 0 px
 * (EDITOR2-001). A single-line field keeps no line breaks.
 */
export function typedText(innerText: string, multiline: boolean, maxLength: number | null): string {
  if (!innerText.trim()) return '';
  const withoutTrailingBreak = innerText.replace(/\n+$/, '');
  const text = multiline ? withoutTrailingBreak : withoutTrailingBreak.replace(/\n/g, ' ');
  return maxLength === null ? text : text.slice(0, maxLength);
}

/** Inserts `text` at the caret of a contentEditable, as plain text. */
function insertPlainText(text: string) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
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
  const t = useTranslations('blocks');
  const { editable, blockType } = useBlockRender();
  const selectedBlockId = useEditorStore((s) => s.selectedBlockId);
  const updateBlockField = useEditorStore((s) => s.updateBlockField);

  const [isEditing, setIsEditing] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const isSelected = selectedBlockId === blockId;
  const isActiveEditing = isEditing && isSelected;
  const path: DataPath = typeof fieldKey === 'string' ? [fieldKey] : fieldKey;
  // The same limit the server enforces, so an inline edit can't make the next save fail
  const maxLength = blockType ? fieldLimit(blockType, path)?.maxLength ?? null : null;

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

  // What visitors see (public page, previews, thumbnails): an empty text is not rendered at all,
  // so there are no empty headings or nameless buttons (QA-040)
  if (!editable) {
    if (!value.trim()) return null;
    return <Tag className={className} style={style}>{value}</Tag>;
  }

  // Nothing visible (e.g. a "\n" stored before EDITOR2-001): render nothing so the placeholder shows
  const shown = value.trim() ? value : '';
  const roomLeft = (element: HTMLElement) => (maxLength === null ? Infinity : maxLength - element.innerText.length);

  if (isActiveEditing) {
    return (
      <Tag
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={t('emptyText')}
        data-placeholder-touch={t('emptyTextTouch')}
        style={style}
        className={`${className} ${EMPTY_CLASS} pointer-events-auto outline-none ring-2 ring-[#2563EB]/40 ring-offset-2 ring-offset-transparent rounded-sm cursor-text`}
        onBlur={(e: React.FocusEvent<HTMLElement>) => {
          const newValue = typedText(e.currentTarget.innerText || '', multiline, maxLength);
          if (newValue !== value) {
            updateBlockField(blockId, path, newValue);
          }
          setIsEditing(false);
        }}
        onBeforeInput={(e: React.FormEvent<HTMLElement>) => {
          const selection = window.getSelection();
          const replacing = selection !== null && !selection.isCollapsed;
          if (!replacing && roomLeft(e.currentTarget) <= 0) e.preventDefault();
        }}
        onPaste={(e: React.ClipboardEvent<HTMLElement>) => {
          // Plain text only, cut to what still fits
          e.preventDefault();
          const selected = window.getSelection()?.toString().length ?? 0;
          const room = roomLeft(e.currentTarget) + selected;
          let text = e.clipboardData.getData('text/plain');
          if (!multiline) text = text.replace(/\s*\n\s*/g, ' ');
          insertPlainText(room === Infinity ? text : text.slice(0, Math.max(0, room)));
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
        {shown}
      </Tag>
    );
  }

  return (
    <Tag
      style={style}
      data-placeholder={t('emptyText')}
      data-placeholder-touch={t('emptyTextTouch')}
      className={`${className} ${EMPTY_CLASS} ${
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
      {shown}
    </Tag>
  );
}
