'use client';

import { useLocale, useTranslations } from 'next-intl';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

interface ViewsChartProps {
  data: Array<{ date: string; views: number; unique_visitors: number }>;
}

function formatDate(dateStr: string, locale: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

export default function ViewsChart({ data }: ViewsChartProps) {
  const t = useTranslations();
  const locale = useLocale();
  const formatted = data.map((d) => ({
    ...d,
    label: formatDate(d.date, locale),
  }));

  if (formatted.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted text-sm">
        {t('analytics.noDataForPeriod')}
      </div>
    );
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={formatted} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
          <XAxis dataKey="label" tick={{ fill: '#a1a1aa', fontSize: 11 }} />
          <YAxis tick={{ fill: '#a1a1aa', fontSize: 11 }} allowDecimals={false} />
          <Tooltip
            contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: '#e4e4e7' }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="views" stroke="#6366f1" name={t('analytics.metricViews')} strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="unique_visitors" stroke="#22d3ee" name={t('analytics.metricUnique')} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
