import clsx from 'clsx';

interface Tab {
  key: string;
  label: string;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (key: string) => void;
  className?: string;
}

export default function Tabs({ tabs, activeTab, onTabChange, className }: TabsProps) {
  return (
    <div className={clsx('flex border-b border-subtle\/80', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onTabChange(tab.key)}
          className={clsx(
            'flex-1 py-2.5 text-[11px] font-semibold uppercase tracking-widest transition-colors',
            activeTab === tab.key
              ? 'text-primary border-b-2 border-primary-color'
              : 'text-muted hover:text-secondary'
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
