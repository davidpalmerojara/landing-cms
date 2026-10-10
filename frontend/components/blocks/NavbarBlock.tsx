'use client';

import { Menu, X } from 'lucide-react';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { BlockProps, NavbarData } from '@/types/blocks';
import EditableText from './EditableText';
import BlockLink from './BlockLink';
import BlockButton from './BlockButton';
import { safeHref } from '@/lib/safe-link';

const ctaStyle = { backgroundColor: 'var(--theme-primary)', color: 'var(--theme-text-on-primary)' };

export default function NavbarBlock({ blockId, data, isPreviewMode }: BlockProps<NavbarData>) {
  const t = useTranslations('blocks');
  const [menuOpen, setMenuOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const logoImage = data.logoImage;
  // Links without a label are not shown; `index` points into data.links for editing
  const navLinks = data.links
    .map((link, index) => ({
      index,
      label: link.label,
      href: isPreviewMode ? safeHref(link.url) : null,
    }))
    .filter((link) => link.label);
  // On the page a CTA without text is not shown (QA-040)
  const showCta = !isPreviewMode || data.ctaText.trim() !== '';

  const closeMenu = () => setMenuOpen(false);

  // Escape closes the menu and gives focus back to the button that opened it (QA-048)
  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    closeMenu();
    toggleRef.current?.focus();
  };

  const renderNavLink = (index: number, label: string, href: string | null, className: string, onNavigate?: () => void) => {
    const style = { color: 'var(--theme-text-muted)' };
    if (href) {
      return (
        <BlockLink key={index} href={href} className={`${className} hover:underline`} style={style} onNavigate={onNavigate}>
          {label}
        </BlockLink>
      );
    }
    // Without a link it is plain text, not something that looks clickable (D9)
    return <EditableText key={index} blockId={blockId} fieldKey={['links', index, 'label']} value={label} as="span" className={className} style={style} />;
  };

  return (
    <nav
      aria-label={t('navbarAria')}
      className={`relative border-b transition-all ${
        isPreviewMode ? '' : 'pointer-events-none'
      } px-4 py-2 @tablet:px-8 @tablet:py-4`}
      style={{ backgroundColor: 'var(--block-bg, var(--theme-bg))', borderColor: 'var(--theme-border)' }}
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
        {/* min-w-0 + truncate: a long brand name never makes the page wider than the screen (QA-095) */}
        <div className="flex items-center gap-3 min-w-0">
          {logoImage ? (
            <img src={logoImage} alt="" className="h-8 w-8 shrink-0 object-contain rounded" />
          ) : (
            <div
              aria-hidden="true"
              className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center font-bold text-sm"
              style={ctaStyle}
            >
              {data.brandName.charAt(0) || 'B'}
            </div>
          )}
          <EditableText
            blockId={blockId}
            fieldKey="brandName"
            value={data.brandName}
            as="span"
            className="min-w-0 truncate font-semibold text-lg [overflow-wrap:normal]"
            style={{ color: 'var(--theme-text)' }}
          />
        </div>

        {/* Which of the two shows is decided by CSS (container width), not JS */}
        <button
          ref={toggleRef}
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-expanded={menuOpen}
          aria-controls={menuId}
          aria-label={menuOpen ? t('closeMenu') : t('openMenu')}
          style={{ color: 'var(--theme-text-muted)' }}
          className="shrink-0 w-11 h-11 -mr-2 flex items-center justify-center rounded-lg @tablet:hidden"
        >
          {menuOpen ? <X className="w-5 h-5" aria-hidden="true" /> : <Menu className="w-5 h-5" aria-hidden="true" />}
        </button>
        {menuOpen && (
        <div
          id={menuId}
          onKeyDown={handleMenuKeyDown}
          className="absolute top-full left-0 right-0 border-b py-2 px-4 flex flex-col gap-1 z-50 @tablet:hidden"
          style={{ backgroundColor: 'var(--block-bg, var(--theme-bg))', borderColor: 'var(--theme-border)' }}
        >
          {/* Following a link (often an anchor on this same page) closes the menu */}
          {navLinks.map(({ index, label, href }) => renderNavLink(index, label, href, 'text-sm flex items-center min-h-11', closeMenu))}
          {showCta && (
            <span className="block py-2">
              <BlockButton
                link={data.ctaLink}
                isPreviewMode={isPreviewMode}
                className="w-full text-sm font-medium px-4 py-3 rounded-lg"
                style={ctaStyle}
                onNavigate={closeMenu}
              >
                {data.ctaText}
              </BlockButton>
            </span>
          )}
        </div>
        )}
        <div className="hidden @tablet:flex items-center gap-8">
          <div className="flex items-center gap-6">
            {navLinks.map(({ index, label, href }) => renderNavLink(index, label, href, 'text-sm transition-colors'))}
          </div>
          {showCta && (
            <BlockButton
              link={data.ctaLink}
              isPreviewMode={isPreviewMode}
              className="text-sm font-medium px-5 py-2 rounded-lg transition-colors"
              interactiveClassName="hover:opacity-90"
              style={ctaStyle}
            >
              <EditableText blockId={blockId} fieldKey="ctaText" value={data.ctaText} />
            </BlockButton>
          )}
        </div>
      </div>
    </nav>
  );
}
