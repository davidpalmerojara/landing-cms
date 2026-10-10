'use client';

import type { CSSProperties, ReactNode } from 'react';
import { safeHref } from '@/lib/safe-link';
import BlockLink from './BlockLink';

interface BlockButtonProps {
  /** The link field as typed; validated here with safeHref() */
  link: string;
  isPreviewMode: boolean;
  className: string;
  /** Hover and pointer effects: only for something that can actually be clicked */
  interactiveClassName?: string;
  style?: CSSProperties;
  /** Called when the link is followed (e.g. to close a menu) */
  onNavigate?: () => void;
  children: ReactNode;
}

/**
 * A button of a block (hero, CTA, pricing, navbar). On previews and published
 * pages it is a link when its link field holds a safe one; without a link it
 * is plain, non-interactive text with the same look (D9): a page must not show
 * buttons that do nothing. In the editor it stays a button (it is not clickable
 * there anyway; texts are edited inline).
 */
export default function BlockButton({ link, isPreviewMode, className, interactiveClassName = '', style, onNavigate, children }: BlockButtonProps) {
  if (!isPreviewMode) {
    return <button type="button" className={className} style={style}>{children}</button>;
  }
  const href = safeHref(link);
  if (href) {
    return <BlockLink href={href} className={`${className} ${interactiveClassName} inline-block text-center`} style={style} onNavigate={onNavigate}>{children}</BlockLink>;
  }
  return <span className={`${className} inline-block text-center`} style={style}>{children}</span>;
}
