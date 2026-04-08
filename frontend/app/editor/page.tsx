'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';

export default function EditorRedirect() {
  const t = useTranslations();
  const router = useRouter();
  const [error, setError] = useState(false);

  useEffect(() => {
    async function redirect() {
      try {
        const res = await api.pages.list();
        if (res.results.length > 0) {
          router.replace(`/editor/${res.results[0].id}`);
        } else {
          const page = await api.pages.create({ name: t('dashboard.createUntitled'), blocks: [] });
          router.replace(`/editor/${page.id}`);
        }
      } catch {
        setError(true);
      }
    }
    redirect();
  }, [router, t]);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface text-secondary">
        <div className="text-center space-y-4">
          <p className="text-sm">{t('editor.connectionError')}</p>
          <a href="/dashboard" className="text-primary-color hover:underline text-sm">
            {t('editor.goToDashboard')}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-surface text-secondary">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">{t('editor.loadingPage')}</span>
      </div>
    </div>
  );
}
