import type { CSSProperties, ReactNode } from 'react';
import { isExternalHref } from '@/lib/safe-link';

interface BlockLinkProps {
  /** Already validated with safeHref(). */
  href: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * Anchor for link fields of a block (buttons, nav and footer items). Only
 * rendered on previews and published pages; the editor keeps its inline
 * editable elements. External links open in the same tab.
 */
export default function BlockLink({ href, className, style, children }: BlockLinkProps) {
  return (
    <a
      href={href}
      className={className}
      style={style}
      {...(isExternalHref(href) ? { rel: 'noopener noreferrer' } : {})}
    >
      {children}
    </a>
  );
}
