import { Check, X } from 'lucide-react';
import type { PlanFeature } from '@/lib/plan-features';

interface PlanFeatureListProps {
  features: PlanFeature[];
  includedLabel: string;
  notIncludedLabel: string;
}

const PlanFeatureList = ({ features, includedLabel, notIncludedLabel }: PlanFeatureListProps) => (
  <ul className="space-y-3">
    {features.map((feature) => (
      <li key={feature.key} className="flex items-center gap-2.5 text-sm">
        {feature.included ? (
          <span className="w-4 h-4 rounded-full bg-success/15 flex items-center justify-center shrink-0">
            <Check className="w-2.5 h-2.5 text-success" aria-hidden="true" />
          </span>
        ) : (
          <span className="w-4 h-4 rounded-full bg-surface-card flex items-center justify-center shrink-0">
            <X className="w-2.5 h-2.5 text-muted" aria-hidden="true" />
          </span>
        )}
        <span className={feature.included ? 'text-secondary' : 'text-muted'}>
          <span className="sr-only">{feature.included ? includedLabel : notIncludedLabel}: </span>
          {feature.label}
          {feature.detail && <span className="text-muted ml-1">({feature.detail})</span>}
        </span>
      </li>
    ))}
  </ul>
);

export default PlanFeatureList;
