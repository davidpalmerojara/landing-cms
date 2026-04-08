'use client';

import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { BlockProps } from '@/types/blocks';
import EditableText from './EditableText';

export default function NavbarBlock({ blockId, data, isMobile, isPreviewMode }: BlockProps) {
  const t = useTranslations('blocks');
  const [menuOpen, setMenuOpen] = useState(false);
  const logoImage = data.logoImage as string;

  return (
    <nav
      aria-label={t('navbarAria')}
      className={`relative border-b transition-all ${
        isPreviewMode ? '' : 'pointer-events-none'
      } ${isMobile ? 'px-4 py-3' : 'px-8 py-4'}`}
      style={{ backgroundColor: 'var(--theme-bg)', borderColor: 'var(--theme-border)' }}
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          {logoImage ? (
            <img src={logoImage} alt="" className="h-8 w-8 object-contain rounded" />
          ) : (
            <div
              className="h-8 w-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
              style={{ backgroundColor: 'var(--theme-primary)' }}
            >
              {(data.brandName as string)?.charAt(0) || 'B'}
            </div>
          )}
          <EditableText
            blockId={blockId}
            fieldKey="brandName"
            value={data.brandName as string}
            as="span"
            className="font-semibold text-lg"
            style={{ color: 'var(--theme-text)' }}
          />
        </div>

        {isMobile ? (
          <>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              aria-expanded={menuOpen}
              aria-label={t('toggleMenu')}
              style={{ color: 'var(--theme-text-muted)' }}
              className="p-2"
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            {menuOpen && (
              <div
                className="absolute top-full left-0 right-0 border-b py-4 px-4 flex flex-col gap-3 z-50"
                style={{ backgroundColor: 'var(--theme-bg)', borderColor: 'var(--theme-border)' }}
              >
                <EditableText blockId={blockId} fieldKey="link1" value={data.link1 as string} as="span" className="text-sm" style={{ color: 'var(--theme-text-muted)' }} />
                <EditableText blockId={blockId} fieldKey="link2" value={data.link2 as string} as="span" className="text-sm" style={{ color: 'var(--theme-text-muted)' }} />
                <EditableText blockId={blockId} fieldKey="link3" value={data.link3 as string} as="span" className="text-sm" style={{ color: 'var(--theme-text-muted)' }} />
                <button
                  className="text-white text-sm font-medium px-4 py-2 rounded-lg"
                  style={{ backgroundColor: 'var(--theme-primary)' }}
                >
                  {data.ctaText as string}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-6">
              <EditableText blockId={blockId} fieldKey="link1" value={data.link1 as string} as="span" className="text-sm transition-colors" style={{ color: 'var(--theme-text-muted)' }} />
              <EditableText blockId={blockId} fieldKey="link2" value={data.link2 as string} as="span" className="text-sm transition-colors" style={{ color: 'var(--theme-text-muted)' }} />
              <EditableText blockId={blockId} fieldKey="link3" value={data.link3 as string} as="span" className="text-sm transition-colors" style={{ color: 'var(--theme-text-muted)' }} />
            </div>
            <button
              className="text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors hover:opacity-90"
              style={{ backgroundColor: 'var(--theme-primary)' }}
            >
              <EditableText blockId={blockId} fieldKey="ctaText" value={data.ctaText as string} />
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
