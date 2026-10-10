'use client';

import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { isExternalHref } from '@/lib/safe-link';
import { useLiveLinks } from './live-links-context';

interface BlockLinkProps {
  /** Already validated with safeHref(). */
  href: string;
  className?: string;
  style?: CSSProperties;
  /** Called when the link is clicked, live or not (e.g. to close a menu) */
  onNavigate?: () => void;
  children: ReactNode;
}

/**
 * Anchor for link fields of a block (buttons, nav and footer items). Only
 * rendered on previews and published pages; the editor keeps its inline
 * editable elements. External links open in the same tab.
 *
 * Inside the editor's previews the href is still rendered (hover shows the
 * target, so links can be checked) but clicking does not navigate.
 */
export default function BlockLink({ href, className, style, onNavigate, children }: BlockLinkProps) {
  const live = useLiveLinks();
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!live) e.preventDefault();
    onNavigate?.();
  };
  return (
    <a
      href={href}
      className={className}
      style={style}
      onClick={live && !onNavigate ? undefined : handleClick}
      {...(isExternalHref(href) ? { rel: 'noopener noreferrer' } : {})}
    >
      {children}
    </a>
  );
}
