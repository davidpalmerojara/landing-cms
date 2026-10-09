'use client';

import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { BlockProps, NavbarData } from '@/types/blocks';
import EditableText from './EditableText';
import BlockLink from './BlockLink';
import { safeHref } from '@/lib/safe-link';

export default function NavbarBlock({ blockId, data, isPreviewMode }: BlockProps<NavbarData>) {
  const t = useTranslations('blocks');
  const [menuOpen, setMenuOpen] = useState(false);
  const logoImage = data.logoImage;
  // Links without a label are not shown; `index` points into data.links for editing
  const navLinks = data.links
    .map((link, index) => ({
      index,
      label: link.label,
      href: isPreviewMode ? safeHref(link.url) : null,
    }))
    .filter((link) => link.label);
  const ctaHref = isPreviewMode ? safeHref(data.ctaLink) : null;

  const renderNavLink = (index: number, label: string, href: string | null, className: string) => {
    const style = { color: 'var(--theme-text-muted)' };
    if (href) {
      return <BlockLink key={index} href={href} className={className} style={style}>{label}</BlockLink>;
    }
    return <EditableText key={index} blockId={blockId} fieldKey={['links', index, 'label']} value={label} as="span" className={className} style={style} />;
  };

  return (
    <nav
      aria-label={t('navbarAria')}
      className={`relative border-b transition-all ${
        isPreviewMode ? '' : 'pointer-events-none'
      } px-4 py-3 @tablet:px-8 @tablet:py-4`}
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
              {data.brandName.charAt(0) || 'B'}
            </div>
          )}
          <EditableText
            blockId={blockId}
            fieldKey="brandName"
            value={data.brandName}
            as="span"
            className="font-semibold text-lg"
            style={{ color: 'var(--theme-text)' }}
          />
        </div>

        {/* Which of the two shows is decided by CSS (container width), not JS */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          aria-expanded={menuOpen}
          aria-label={t('toggleMenu')}
          style={{ color: 'var(--theme-text-muted)' }}
          className="p-2 @tablet:hidden"
        >
          {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
        {menuOpen && (
          <div
            className="absolute top-full left-0 right-0 border-b py-4 px-4 flex flex-col gap-3 z-50 @tablet:hidden"
            style={{ backgroundColor: 'var(--theme-bg)', borderColor: 'var(--theme-border)' }}
          >
            {navLinks.map(({ index, label, href }) => renderNavLink(index, label, href, 'text-sm'))}
            {ctaHref ? (
              <BlockLink
                href={ctaHref}
                className="text-white text-sm font-medium px-4 py-2 rounded-lg inline-block text-center"
                style={{ backgroundColor: 'var(--theme-primary)' }}
              >
                {data.ctaText}
              </BlockLink>
            ) : (
              <button
                className="text-white text-sm font-medium px-4 py-2 rounded-lg"
                style={{ backgroundColor: 'var(--theme-primary)' }}
              >
                {data.ctaText}
              </button>
            )}
          </div>
        )}
        <div className="hidden @tablet:flex items-center gap-8">
          <div className="flex items-center gap-6">
            {navLinks.map(({ index, label, href }) => renderNavLink(index, label, href, 'text-sm transition-colors'))}
          </div>
          {ctaHref ? (
            <BlockLink
              href={ctaHref}
              className="text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors hover:opacity-90 inline-block text-center"
              style={{ backgroundColor: 'var(--theme-primary)' }}
            >
              <EditableText blockId={blockId} fieldKey="ctaText" value={data.ctaText} />
            </BlockLink>
          ) : (
            <button
              className="text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors hover:opacity-90"
              style={{ backgroundColor: 'var(--theme-primary)' }}
            >
              <EditableText blockId={blockId} fieldKey="ctaText" value={data.ctaText} />
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
