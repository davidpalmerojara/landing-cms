'use client';

import { useTranslations } from 'next-intl';

interface ReferrersTableProps {
  data: Array<{ referrer: string; count: number }>;
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname + (u.pathname !== '/' ? u.pathname : '');
  } catch {
    return url;
  }
}

export default function ReferrersTable({ data }: ReferrersTableProps) {
  const t = useTranslations('analytics');

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted text-sm">
        {t('noReferrers')}
      </div>
    );
  }

  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="space-y-1.5">
      {data.map((item) => {
        const pct = Math.round((item.count / total) * 100);
        return (
          <div key={item.referrer} className="flex items-center gap-2 text-xs">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-secondary truncate">{shortenUrl(item.referrer)}</span>
                <span className="text-muted shrink-0">{item.count}</span>
              </div>
              <div className="h-1 bg-surface-card rounded mt-0.5">
                <div className="h-full bg-primary\/60 rounded" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <span className="text-muted w-8 text-right shrink-0">{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}
