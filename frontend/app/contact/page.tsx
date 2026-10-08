'use client';

import { Bug, ExternalLink, Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';
import MarketingShell from '@/components/marketing/MarketingShell';

export default function ContactPage() {
  const t = useTranslations();

  const channels = [
    {
      icon: Bug,
      title: t('marketing.pages.contact.bugsTitle'),
      body: t('marketing.pages.contact.bugsBody'),
      linkLabel: t('marketing.pages.contact.bugsLink'),
      href: 'https://github.com/davidpalmerojara/landing-cms/issues',
    },
    {
      icon: Mail,
      title: t('marketing.pages.contact.otherTitle'),
      body: t('marketing.pages.contact.otherBody'),
      linkLabel: 'davidpalmero.dev',
      href: 'https://davidpalmero.dev',
    },
  ];

  return (
    <MarketingShell
      title={t('marketing.pages.contact.title')}
      subtitle={t('marketing.pages.contact.subtitle')}
    >
      <div className="grid max-w-4xl gap-6 md:grid-cols-2">
        {channels.map((channel) => (
          <article key={channel.href} className="rounded-3xl border border-subtle/70 bg-surface-elevated/35 p-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary-color">
              <channel.icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 className="mt-6 text-2xl font-bold text-primary">{channel.title}</h2>
            <p className="mt-4 text-sm leading-7 text-secondary">{channel.body}</p>
            <a href={channel.href} className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-color hover:underline">
              {channel.linkLabel} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </article>
        ))}
      </div>
    </MarketingShell>
  );
}
