'use client';

import { useTranslations } from 'next-intl';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from 'recharts';

interface ClicksByBlockChartProps {
  data: Array<{ block_id: string | null; block_type: string | null; click_count: number; ctr: number }>;
}

const COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#818cf8', '#6d28d9', '#7c3aed', '#4f46e5'];
const TRANSLATABLE_BLOCK_TYPES = new Set([
  'hero',
  'features',
  'pricing',
  'testimonials',
  'cta',
  'faq',
  'footer',
  'contact',
  'gallery',
  'navbar',
  'stats',
  'team',
  'timeline',
  'logoCloud',
  'customHtml',
]);

export default function ClicksByBlockChart({ data }: ClicksByBlockChartProps) {
  const t = useTranslations();
  const blocksT = useTranslations('blocks');

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted text-sm">
        {t('analytics.noClicks')}
      </div>
    );
  }

  const chartData = data.slice(0, 10).map((d, i) => ({
    name: d.block_type && TRANSLATABLE_BLOCK_TYPES.has(d.block_type)
      ? blocksT(d.block_type)
      : t('analytics.unknownBlock'),
    clicks: d.click_count,
    ctr: d.ctr,
    idx: i,
  }));

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
          <XAxis type="number" tick={{ fill: '#a1a1aa', fontSize: 11 }} allowDecimals={false} />
          <YAxis type="category" dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 11 }} width={80} />
          <Tooltip
            contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }}
            formatter={(value, _name, entry) => {
              const ctr = (entry as { payload?: { ctr?: number } }).payload?.ctr ?? 0;
              return [
                t('analytics.clicksTooltip', { count: Number(value), ctr }),
                t('analytics.clicksSeries'),
              ];
            }}
          />
          <Bar dataKey="clicks" radius={[0, 4, 4, 0]}>
            {chartData.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
