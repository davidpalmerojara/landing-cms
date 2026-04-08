'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface MetricCardProps {
  label: string;
  value: string | number;
  prevValue?: number;
  currentValue?: number;
  suffix?: string;
}

export default function MetricCard({ label, value, prevValue, currentValue, suffix }: MetricCardProps) {
  let trend: 'up' | 'down' | 'flat' = 'flat';
  let trendPct = 0;

  if (prevValue !== undefined && currentValue !== undefined && prevValue > 0) {
    trendPct = Math.round(((currentValue - prevValue) / prevValue) * 100);
    if (trendPct > 0) trend = 'up';
    else if (trendPct < 0) trend = 'down';
  }

  return (
    <div className="bg-surface-elevated border border-surface-card\/80 rounded-xl p-4 flex flex-col gap-1">
      <span className="text-xs text-muted uppercase tracking-wider">{label}</span>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-semibold text-primary">
          {value}{suffix && <span className="text-base text-secondary ml-0.5">{suffix}</span>}
        </span>
        {prevValue !== undefined && currentValue !== undefined && (
          <span className={`flex items-center gap-0.5 text-xs font-medium mb-0.5 ${
            trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-red-400' : 'text-muted'
          }`}>
            {trend === 'up' && <TrendingUp size={12} />}
            {trend === 'down' && <TrendingDown size={12} />}
            {trend === 'flat' && <Minus size={12} />}
            {trendPct !== 0 ? `${trendPct > 0 ? '+' : ''}${trendPct}%` : '—'}
          </span>
        )}
      </div>
    </div>
  );
}
