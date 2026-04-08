'use client';

import { useTranslations } from 'next-intl';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';

interface DeviceChartProps {
  data: { desktop: number; tablet: number; mobile: number };
}

const COLORS = { desktop: '#6366f1', tablet: '#22d3ee', mobile: '#f59e0b' };
export default function DeviceChart({ data }: DeviceChartProps) {
  const t = useTranslations('analytics');
  const total = data.desktop + data.tablet + data.mobile;

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted text-sm">
        {t('noDeviceData')}
      </div>
    );
  }

  const chartData = (Object.keys(data) as Array<keyof typeof data>)
    .filter((k) => data[k] > 0)
    .map((key) => ({
      name: key === 'desktop'
        ? t('deviceDesktop')
        : key === 'tablet'
          ? t('deviceTablet')
          : t('deviceMobile'),
      value: data[key],
      color: COLORS[key],
    }));

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={40}
            outerRadius={65}
            paddingAngle={3}
            dataKey="value"
          >
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
