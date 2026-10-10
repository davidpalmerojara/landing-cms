'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Copy, ExternalLink, EyeOff, Globe, Layers, Pencil, Trash2, Users } from 'lucide-react';
import type { ApiPageListItem } from '@/lib/api';
import { apiToTokens } from '@/lib/design-tokens';
import { publicPageAddress } from '@/lib/site-url';
import ActionMenu from '@/components/ui/ActionMenu';
import type { ActionMenuItem } from '@/components/ui/ActionMenu';
import PagePreviewThumbnail from './PagePreviewThumbnail';

interface PageCardProps {
  page: ApiPageListItem;
  onDuplicate: (id: string) => void;
  onUnpublish: (id: string, name: string) => void;
  onDelete: (id: string, name: string) => void;
}

/**
 * One page of the dashboard. Duplicating, unpublishing and deleting are the
 * owner's (ADR-032): on a page shared with the user those items are left out
 * and the menu says why.
 */
export default function PageCard({ page, onDuplicate, onUnpublish, onDelete }: PageCardProps) {
  const t = useTranslations();
  const router = useRouter();
  const editHref = `/editor/${page.id}`;
  const isOwner = !page.is_shared;
  const isPublished = page.status === 'published';

  const items: ActionMenuItem[] = [
    {
      key: 'edit',
      label: t('dashboard.editPage'),
      icon: <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />,
      onSelect: () => router.push(editHref),
    },
  ];
  if (isOwner) {
    items.push({
      key: 'duplicate',
      label: t('common.duplicate'),
      icon: <Copy className="h-3.5 w-3.5" aria-hidden="true" />,
      onSelect: () => onDuplicate(page.id),
    });
  }
  items.push({
    key: 'preview',
    label: t('dashboard.previewPage'),
    icon: <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />,
    onSelect: () => window.open(`/preview/${page.id}`, '_blank'),
  });
  if (isPublished) {
    items.push({
      key: 'published',
      label: t('dashboard.viewPublished'),
      icon: <Globe className="h-3.5 w-3.5" aria-hidden="true" />,
      onSelect: () => window.open(`/p/${page.slug}`, '_blank'),
    });
    if (isOwner) {
      items.push({
        key: 'unpublish',
        label: t('dashboard.unpublish'),
        icon: <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />,
        onSelect: () => onUnpublish(page.id, page.name),
      });
    }
  }
  if (isOwner) {
    items.push({
      key: 'delete',
      label: t('common.delete'),
      icon: <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />,
      onSelect: () => onDelete(page.id, page.name),
      danger: true,
    });
  }

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl bg-surface-card shadow-[0_32px_64px_-12px_rgba(0,0,0,0.5)] transition-all duration-300 hover:bg-surface-elevated">
      {/* Thumbnail: a mouse shortcut to the editor link below */}
      <div
        className="relative h-48 cursor-pointer overflow-hidden"
        onClick={() => router.push(editHref)}
        aria-hidden="true"
      >
        <div className="h-full w-full">
          <PagePreviewThumbnail blocks={page.preview_blocks || []} designTokens={apiToTokens(page.design_tokens)} />
        </div>
        <div className="absolute left-4 top-4 z-10">
          <span
            className={`rounded px-2 py-1 text-[10px] font-black uppercase tracking-widest ${
              isPublished ? 'bg-primary text-white' : 'bg-surface-card text-primary'
            }`}
          >
            {!isPublished
              ? t('common.draft').toUpperCase()
              : page.has_unpublished_changes
                ? t('editor.unpublishedChanges').toUpperCase()
                : t('common.published').toUpperCase()}
          </span>
        </div>
        {/* A light fade into the card: the lower half of the preview stays readable */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-surface-card/70 via-transparent to-transparent" />
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="mb-1 flex items-start justify-between gap-2">
          <h2 className="min-w-0 flex-1 truncate text-lg font-bold text-primary">
            <Link href={editHref} className="hover:underline">
              {page.name}
            </Link>
          </h2>
          <ActionMenu
            className="-mr-2 -mt-1"
            label={t('dashboard.pageOptions', { name: page.name })}
            items={items}
            note={isOwner ? undefined : t('dashboard.ownerOnlyNote', { owner: page.owner_name || '' })}
          />
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-2">
          <p className="min-w-0 truncate text-xs text-muted">{publicPageAddress(page.slug)}</p>
          {page.is_shared && (
            <span className="flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary-color">
              <Users className="h-2.5 w-2.5" aria-hidden="true" />
              {page.owner_name}
            </span>
          )}
        </div>

        <div className="mt-auto flex items-center justify-between">
          <div className="flex items-center gap-2 text-muted">
            <Layers className="h-4 w-4" aria-hidden="true" />
            <span className="text-xs font-medium">
              {t('dashboard.blocksCount', { count: page.block_count || 0 })}
            </span>
          </div>
          <Link
            href={editHref}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-card text-primary-color transition-all hover:bg-primary hover:text-white"
            aria-label={t('dashboard.editPageNamed', { name: page.name })}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}
