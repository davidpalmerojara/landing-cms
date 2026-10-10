'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import LocaleSwitcher from '@/components/ui/LocaleSwitcher';
import ThemeToggle from '@/components/ui/ThemeToggle';

export interface MobileMenuLink {
  href: string;
  label: string;
}

interface MobileMenuProps {
  links: MobileMenuLink[];
}

/**
 * The header menu below md: the page links, the theme and the language, which
 * the header itself has no room for on a phone (QA-015, QA-058). Escape closes
 * it and returns focus to the button; so does choosing a link.
 */
export default function MobileMenu({ links }: MobileMenuProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t('navigation.menu')}
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 w-11 items-center justify-center rounded-lg text-secondary transition-colors hover:bg-surface-card hover:text-primary"
      >
        {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
      </button>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          className="absolute inset-x-0 top-16 border-b border-subtle/60 bg-surface px-4 pb-4 pt-2 shadow-xl shadow-black/20"
        >
          <nav aria-label={t('navigation.main')}>
            <ul>
              {links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setOpen(false)}
                    aria-current={link.href === pathname ? 'page' : undefined}
                    className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-secondary hover:bg-surface-card hover:text-primary aria-[current=page]:text-primary-color"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-2 flex items-center gap-2 border-t border-subtle/60 px-3 pt-3">
            <ThemeToggle />
            <LocaleSwitcher />
          </div>
        </div>
      )}
    </div>
  );
}
